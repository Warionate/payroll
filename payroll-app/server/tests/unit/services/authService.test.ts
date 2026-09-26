import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodeCrypto from 'node:crypto';

const sha256 = (value: string) => nodeCrypto.createHash('sha256').update(value).digest('hex');

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: unknown) => (v == null ? v : `enc_${v}`)),
  decrypt: vi.fn((v: unknown) => (v == null ? v : String(v).replace('enc_', ''))),
}));

const { mockUserRepository, mockRefreshTokenRepository, mockAuthentikService } = vi.hoisted(() => ({
  mockAuthentikService: {
    isConfigured: vi.fn(),
    isAdmin: vi.fn(),
    setAdmin: vi.fn(),
  },
  mockUserRepository: {
    findByUsername: vi.fn(),
    findById: vi.fn(),
    findByOidcSub: vi.fn(),
    setOidcSub: vi.fn(),
    updateRole: vi.fn(),
    create: vi.fn(),
    getCalendarToken: vi.fn(),
    updateCalendarToken: vi.fn(),
  },
  mockRefreshTokenRepository: {
    create: vi.fn(),
    findByToken: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
    deleteByToken: vi.fn(),
    deleteExpired: vi.fn(),
    cleanupExpired: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/userRepository.js', () => ({
  userRepository: mockUserRepository,
}));

vi.mock('../../../src/repositories/refreshTokenRepository.js', () => ({
  refreshTokenRepository: mockRefreshTokenRepository,
}));

vi.mock('../../../src/services/authentikService.js', () => ({
  authentikService: mockAuthentikService,
}));

// Mock dynamic import of db for register
vi.mock('../../../src/db.js', () => ({
  default: {
    transaction: (fn: () => unknown) => fn,
  },
}));

import { authService } from '../../../src/services/authService.js';

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should return null when user is not found', async () => {
      mockUserRepository.findByUsername.mockReturnValue(undefined);

      const result = await authService.login('nonexistent', 'password');

      expect(result).toBeNull();
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith('nonexistent');
    });

    it('should return null when password is invalid', async () => {
      const hash = await bcrypt.hash('correct_password', 10);
      mockUserRepository.findByUsername.mockReturnValue({
        id: 1,
        username: 'testuser',
        password_hash: hash,
        role: 'user',
      });

      const result = await authService.login('testuser', 'wrong_password');

      expect(result).toBeNull();
    });

    it('should return user data and tokens on successful login', async () => {
      const hash = await bcrypt.hash('password123', 10);
      mockUserRepository.findByUsername.mockReturnValue({
        id: 1,
        username: 'testuser',
        password_hash: hash,
        role: 'user',
      });
      mockRefreshTokenRepository.create.mockReturnValue(undefined);

      const result = await authService.login('testuser', 'password123');

      expect(result).not.toBeNull();
      expect(result!.user).toEqual({ id: 1, username: 'testuser', role: 'user' });
      expect(result!.token).toBeDefined();
      expect(result!.refreshToken).toBeDefined();
    });
  });

  describe('logout', () => {
    it('should revoke the stored (hashed) refresh token', () => {
      mockRefreshTokenRepository.findByToken.mockImplementation((token: string) =>
        token === sha256('some_token')
          ? { token: sha256('some_token'), user_id: 1, revoked: 0, expires_at: '' }
          : undefined,
      );

      authService.logout('some_token');

      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith(sha256('some_token'));
    });

    it('should revoke legacy plaintext tokens stored before hashing', () => {
      mockRefreshTokenRepository.findByToken.mockImplementation((token: string) =>
        token === 'legacy_token'
          ? { token: 'legacy_token', user_id: 1, revoked: 0, expires_at: '' }
          : undefined,
      );

      authService.logout('legacy_token');

      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith('legacy_token');
    });

    it('should do nothing when no token provided', () => {
      authService.logout(undefined);

      expect(mockRefreshTokenRepository.revoke).not.toHaveBeenCalled();
    });

    it('should do nothing when token is unknown', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue(undefined);

      authService.logout('unknown_token');

      expect(mockRefreshTokenRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should return null when token is not found', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue(undefined);

      const result = authService.refresh('invalid_token');

      expect(result).toBeNull();
    });

    it('should revoke all user tokens when a revoked token is reused (theft detection)', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('revoked_token'),
        user_id: 1,
        revoked: 1,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = authService.refresh('revoked_token');

      expect(result).toBeNull();
      expect(mockRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });

    it('should return null when token is expired', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('expired_token'),
        user_id: 1,
        revoked: 0,
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      });

      const result = authService.refresh('expired_token');

      expect(result).toBeNull();
      expect(mockRefreshTokenRepository.deleteByToken).toHaveBeenCalledWith(
        sha256('expired_token'),
      );
    });

    it('should return null when user is not found', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('valid_token'),
        user_id: 999,
        revoked: 0,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      mockUserRepository.findById.mockReturnValue(undefined);

      const result = authService.refresh('valid_token');

      expect(result).toBeNull();
    });

    it('should return new tokens on successful refresh', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('valid_token'),
        user_id: 1,
        revoked: 0,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      mockUserRepository.findById.mockReturnValue({
        id: 1,
        username: 'testuser',
        role: 'user',
      });

      const result = authService.refresh('valid_token');

      expect(result).not.toBeNull();
      expect(result!.token).toBeDefined();
      expect(result!.refreshToken).toBeDefined();
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith(sha256('valid_token'));
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user = { id: 1, username: 'testuser', role: 'user' };
      const token = authService.generateToken(user);

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const payload = jwt.decode(token) as Record<string, unknown>;
      expect(payload.id).toBe(1);
      expect(payload.username).toBe('testuser');
      expect(payload.role).toBe('user');
    });

    it('should set expiration to 15 minutes', () => {
      const user = { id: 1, username: 'test', role: 'admin' };
      const token = authService.generateToken(user);

      const payload = jwt.decode(token) as Record<string, number>;
      const expiresInSeconds = payload.exp - payload.iat;
      expect(expiresInSeconds).toBe(15 * 60);
    });
  });

  describe('generateRefreshToken', () => {
    it('should create a refresh token and store only its hash', () => {
      const token = authService.generateRefreshToken(1);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(128); // 64 bytes = 128 hex chars
      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        sha256(token),
        1,
        expect.any(String),
      );
      // The raw token must never be persisted
      expect(mockRefreshTokenRepository.create).not.toHaveBeenCalledWith(
        token,
        1,
        expect.any(String),
      );
    });
  });

  describe('getOrCreateCalendarToken', () => {
    it('should return existing token if available', () => {
      mockUserRepository.getCalendarToken.mockReturnValue('existing_token');

      const result = authService.getOrCreateCalendarToken(1);

      expect(result).toBe('existing_token');
      expect(mockUserRepository.updateCalendarToken).not.toHaveBeenCalled();
    });

    it('should create and return new token if none exists', () => {
      mockUserRepository.getCalendarToken.mockReturnValue(null);

      const result = authService.getOrCreateCalendarToken(1);

      expect(result).toBeDefined();
      expect(mockUserRepository.updateCalendarToken).toHaveBeenCalledWith(1, expect.any(String));
    });
  });

  describe('resetCalendarToken', () => {
    it('should generate a new token and update it', () => {
      const result = authService.resetCalendarToken(1);

      expect(result).toBeDefined();
      expect(result.length).toBe(64); // 32 bytes = 64 hex chars
      expect(mockUserRepository.updateCalendarToken).toHaveBeenCalledWith(1, result);
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for the user', () => {
      authService.revokeAllUserTokens(42);

      expect(mockRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(42);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens and return count', () => {
      mockRefreshTokenRepository.cleanupExpired.mockReturnValue(5);

      const result = authService.cleanupExpiredTokens();

      expect(result).toBe(5);
      expect(mockRefreshTokenRepository.cleanupExpired).toHaveBeenCalled();
    });
  });

  describe('login with Authentik-linked account', () => {
    const linked = async (role: 'user' | 'admin') => ({
      id: 5,
      username: 'linked',
      password_hash: await bcrypt.hash('pw', 4),
      role,
      oidc_sub: '42',
    });

    it('demotes to user when Authentik says not admin', async () => {
      mockUserRepository.findByUsername.mockReturnValue(await linked('admin'));
      mockAuthentikService.isAdmin.mockResolvedValue(false);

      const result = await authService.login('linked', 'pw');

      expect(result?.user.role).toBe('user');
      expect(mockUserRepository.updateRole).toHaveBeenCalledWith(5, 'user');
    });

    it('keeps DB role when Authentik is unreachable', async () => {
      mockUserRepository.findByUsername.mockReturnValue(await linked('admin'));
      mockAuthentikService.isAdmin.mockResolvedValue(null);

      const result = await authService.login('linked', 'pw');

      expect(result?.user.role).toBe('admin');
      expect(mockUserRepository.updateRole).not.toHaveBeenCalled();
    });

    it('does not ask Authentik for unlinked accounts', async () => {
      mockUserRepository.findByUsername.mockReturnValue({
        ...(await linked('user')),
        oidc_sub: null,
      });

      await authService.login('linked', 'pw');

      expect(mockAuthentikService.isAdmin).not.toHaveBeenCalled();
    });
  });

  describe('loginWithOidc', () => {
    it('rejects an Authentik user that is not linked (no account is created)', () => {
      mockUserRepository.findByOidcSub.mockReturnValue(undefined);

      expect(authService.loginWithOidc('99', [], 'payroll-admin')).toBeNull();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('takes the role from the groups claim', () => {
      mockUserRepository.findByOidcSub.mockReturnValue({
        id: 5,
        username: 'linked',
        role: 'user',
        oidc_sub: '42',
      });

      const result = authService.loginWithOidc('42', ['payroll-admin'], 'payroll-admin');

      expect(result?.user.role).toBe('admin');
      expect(mockUserRepository.updateRole).toHaveBeenCalledWith(5, 'admin');
    });

    it('never changes the main admin role', () => {
      mockUserRepository.findByOidcSub.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
        oidc_sub: '7',
      });

      const result = authService.loginWithOidc('7', [], 'payroll-admin');

      expect(result?.user.role).toBe('admin');
      expect(mockUserRepository.updateRole).not.toHaveBeenCalled();
    });
  });

  describe('linkOidc', () => {
    it('pushes the app role to Authentik, then links', async () => {
      mockUserRepository.findById.mockReturnValue({ id: 5, username: 'u', role: 'admin' });
      mockUserRepository.findByOidcSub.mockReturnValue(undefined);
      mockAuthentikService.isConfigured.mockReturnValue(true);
      mockAuthentikService.setAdmin.mockResolvedValue(undefined);

      await expect(authService.linkOidc(5, '42')).resolves.toBe('linked');
      expect(mockAuthentikService.setAdmin).toHaveBeenCalledWith('42', true);
      expect(mockUserRepository.setOidcSub).toHaveBeenCalledWith(5, '42');
    });

    it('refuses a sub already linked to someone else', async () => {
      mockUserRepository.findById.mockReturnValue({ id: 5, username: 'u', role: 'user' });
      mockUserRepository.findByOidcSub.mockReturnValue({ id: 6 });

      await expect(authService.linkOidc(5, '42')).resolves.toBe('taken');
      expect(mockUserRepository.setOidcSub).not.toHaveBeenCalled();
    });

    it('does not link when the Authentik write fails', async () => {
      mockUserRepository.findById.mockReturnValue({ id: 5, username: 'u', role: 'user' });
      mockUserRepository.findByOidcSub.mockReturnValue(undefined);
      mockAuthentikService.isConfigured.mockReturnValue(true);
      mockAuthentikService.setAdmin.mockRejectedValue(new Error('HTTP 503'));

      await expect(authService.linkOidc(5, '42')).rejects.toThrow();
      expect(mockUserRepository.setOidcSub).not.toHaveBeenCalled();
    });
  });
});
