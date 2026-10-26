import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword } from '../../../src/utils/password.js';
import { encrypt } from '../../../src/utils/crypto.js';
import { totpCode, currentStep } from '../../../src/utils/totp.js';
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

const {
  mockUserRepository,
  mockRefreshTokenRepository,
  mockAuthentikService,
  mockSessionRepository,
  mockRecordSecurityEvent,
  mockMailService,
} = vi.hoisted(() => ({
  mockSessionRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    listActive: vi.fn(),
    touch: vi.fn(),
    markAuthenticated: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
    cleanup: vi.fn(),
    countDevices: vi.fn(),
    rememberDevice: vi.fn(),
    isDeviceTrusted: vi.fn(() => false),
    trustDevice: vi.fn(),
    clearTrustedDevices: vi.fn(),
  },
  mockRecordSecurityEvent: vi.fn(),
  mockMailService: { isEnabled: vi.fn(), send: vi.fn() },
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
    setOidcMfaAt: vi.fn(),
    updateRole: vi.fn(),
    updatePassword: vi.fn(),
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

vi.mock('../../../src/repositories/sessionRepository.js', () => ({
  sessionRepository: mockSessionRepository,
}));

vi.mock('../../../src/repositories/securityEventRepository.js', () => ({
  securityEventRepository: { deleteOlderThan: vi.fn(), create: vi.fn(), listByUser: vi.fn() },
}));

vi.mock('../../../src/utils/securityLog.js', () => ({
  recordSecurityEvent: mockRecordSecurityEvent,
}));

vi.mock('../../../src/services/mailService.js', () => ({
  mailService: mockMailService,
}));

const { mockMfaRepository } = vi.hoisted(() => ({
  mockMfaRepository: {
    countPasskeys: vi.fn(() => 0),
    advanceTotpStep: vi.fn(() => true),
    useRecoveryCode: vi.fn(() => false),
    countUnusedRecoveryCodes: vi.fn(() => 0),
  },
}));
vi.mock('../../../src/repositories/mfaRepository.js', () => ({
  mfaRepository: mockMfaRepository,
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

    it('should upgrade a legacy bcrypt hash to Argon2id on successful login', async () => {
      mockUserRepository.updatePassword.mockClear();
      const hash = await bcrypt.hash('password123', 4);
      mockUserRepository.findByUsername.mockReturnValue({
        id: 1,
        username: 'testuser',
        password_hash: hash,
        role: 'user',
      });

      const result = await authService.login('testuser', 'password123');

      expect(result).not.toBeNull();
      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith(1, expect.any(String));
      const newHash = mockUserRepository.updatePassword.mock.calls[0][1];
      expect(newHash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword('password123', newHash)).toBe(true);
    });

    it('should not rehash an Argon2id hash with current parameters', async () => {
      mockUserRepository.updatePassword.mockClear();
      mockUserRepository.findByUsername.mockReturnValue({
        id: 1,
        username: 'testuser',
        password_hash: await hashPassword('password123'),
        role: 'user',
      });

      const result = await authService.login('testuser', 'password123');

      expect(result).not.toBeNull();
      expect(mockUserRepository.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('sessions', () => {
    const user = { id: 1, username: 'testuser', role: 'user' as const };
    const future = new Date(Date.now() + 86400000).toISOString();

    it('starts a session that expires 30 days after login and records the login', () => {
      const before = Date.now();
      const result = authService.startSession(user, 'password', { ip: '1.2.3.4' });

      const row = mockSessionRepository.create.mock.calls[0][0];
      expect(row.id).toBe(result.sessionId);
      expect(row.method).toBe('password');
      const lifetime = new Date(row.expires_at).getTime() - before;
      expect(lifetime).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
      expect(lifetime).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);
      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        expect.any(String),
        1,
        row.expires_at,
        result.sessionId,
      );
      expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
        1,
        'login',
        { ip: '1.2.3.4' },
        'password',
      );
    });

    it('keeps the session expiry on refresh (does not extend it)', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('t'),
        user_id: 1,
        revoked: 0,
        expires_at: future,
        session_id: 's1',
      });
      mockSessionRepository.findById.mockReturnValue({
        id: 's1',
        user_id: 1,
        revoked_at: null,
        expires_at: future,
      });
      mockUserRepository.findById.mockReturnValue(user);

      const result = authService.refresh('t');

      expect(result).not.toBeNull();
      expect(mockSessionRepository.create).not.toHaveBeenCalled();
      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        expect.any(String),
        1,
        future,
        's1',
      );
      expect((jwt.decode(result!.token) as Record<string, unknown>).sid).toBe('s1');
    });

    it('rejects a refresh when the session was revoked', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('t'),
        user_id: 1,
        revoked: 0,
        expires_at: future,
        session_id: 's1',
      });
      mockSessionRepository.findById.mockReturnValue({
        id: 's1',
        user_id: 1,
        revoked_at: new Date().toISOString(),
        expires_at: future,
      });

      expect(authService.refresh('t')).toBeNull();
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith(sha256('t'));
    });

    it('rejects a refresh when the session passed its 30-day limit', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('t'),
        user_id: 1,
        revoked: 0,
        expires_at: future,
        session_id: 's1',
      });
      mockSessionRepository.findById.mockReturnValue({
        id: 's1',
        user_id: 1,
        revoked_at: null,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      expect(authService.refresh('t')).toBeNull();
    });

    it('moves a pre-session refresh token onto a new session', () => {
      mockRefreshTokenRepository.findByToken.mockReturnValue({
        token: sha256('t'),
        user_id: 1,
        revoked: 0,
        expires_at: future,
        session_id: null,
      });
      mockUserRepository.findById.mockReturnValue(user);

      expect(authService.refresh('t')).not.toBeNull();
      expect(mockSessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'legacy', user_id: 1 }),
      );
      expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
    });

    it('does not revoke a session that belongs to someone else', () => {
      mockSessionRepository.findById.mockReturnValue({ id: 's9', user_id: 2, revoked_at: null });

      expect(authService.revokeSession(1, 's9')).toBe(false);
      expect(mockSessionRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('new device notification', () => {
    const user = { id: 1, username: 'testuser', role: 'user' as const };

    it('silently remembers the first device of a user', () => {
      mockSessionRepository.countDevices.mockReturnValue(0);
      mockSessionRepository.rememberDevice.mockReturnValue(true);

      authService.checkDevice(user, { deviceId: 'a'.repeat(64) });

      expect(mockMailService.send).not.toHaveBeenCalled();
      expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
    });

    it('mails the verified address when an unknown device logs in', () => {
      mockSessionRepository.countDevices.mockReturnValue(2);
      mockSessionRepository.rememberDevice.mockReturnValue(true);
      mockUserRepository.findById.mockReturnValue({ id: 1, email: 'me@example.com' });
      mockMailService.isEnabled.mockReturnValue(true);
      mockMailService.send.mockResolvedValue(undefined);

      authService.checkDevice(user, { deviceId: 'b'.repeat(64), ip: '5.6.7.8' });

      expect(mockMailService.send).toHaveBeenCalledWith(
        'me@example.com',
        expect.stringContaining('新しい端末'),
        expect.stringContaining('5.6.7.8'),
      );
      expect(mockRecordSecurityEvent).toHaveBeenCalledWith(1, 'new_device', expect.anything());
    });

    it('does nothing for a known device', () => {
      mockSessionRepository.countDevices.mockReturnValue(2);
      mockSessionRepository.rememberDevice.mockReturnValue(false);

      authService.checkDevice(user, { deviceId: 'c'.repeat(64) });

      expect(mockMailService.send).not.toHaveBeenCalled();
    });
  });

  describe('admin password-only login', () => {
    it('blocks an admin from logging in with only a password outside tests', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        mockUserRepository.findByUsername.mockReturnValue({
          id: 1,
          username: 'boss',
          password_hash: await hashPassword('pw-correct'),
          role: 'admin',
          oidc_sub: null,
        });

        await expect(authService.login('boss', 'pw-correct')).rejects.toMatchObject({
          statusCode: 403,
        });
        expect(mockSessionRepository.create).not.toHaveBeenCalled();
        expect(mockRecordSecurityEvent).toHaveBeenCalledWith(1, 'admin_mfa_blocked', {});
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('allows it with ADMIN_PASSWORD_LOGIN=allow (break-glass)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ADMIN_PASSWORD_LOGIN', 'allow');
      try {
        mockUserRepository.findByUsername.mockReturnValue({
          id: 1,
          username: 'boss',
          password_hash: await hashPassword('pw-correct'),
          role: 'admin',
          oidc_sub: null,
        });

        expect(await authService.login('boss', 'pw-correct')).not.toBeNull();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('still lets a normal user log in with a password', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        mockUserRepository.findByUsername.mockReturnValue({
          id: 2,
          username: 'staff',
          password_hash: await hashPassword('pw-correct'),
          role: 'user',
          oidc_sub: null,
        });

        expect(await authService.login('staff', 'pw-correct')).not.toBeNull();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('second factor at login', () => {
    const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    it('asks for an authenticator code instead of logging in when TOTP is enabled', async () => {
      mockUserRepository.findByUsername.mockReturnValue({
        id: 3,
        username: 'staff',
        password_hash: await hashPassword('pw-correct'),
        role: 'user',
        oidc_sub: null,
        totp_secret: encrypt(SECRET),
        totp_enabled_at: '2026-10-19T00:00:00.000Z',
        totp_last_step: null,
      });

      const result = await authService.login('staff', 'pw-correct');

      expect(result).toHaveProperty('mfaPending');
      expect(mockSessionRepository.create).not.toHaveBeenCalled();
    });

    it('logs in with the pending token and a current code, and refuses a wrong code', async () => {
      const user = {
        id: 3,
        username: 'staff',
        password_hash: await hashPassword('pw-correct'),
        role: 'user',
        oidc_sub: null,
        totp_secret: encrypt(SECRET),
        totp_enabled_at: '2026-10-19T00:00:00.000Z',
        totp_last_step: null,
      };
      mockUserRepository.findByUsername.mockReturnValue(user);
      mockUserRepository.findById.mockReturnValue(user);
      const first = (await authService.login('staff', 'pw-correct')) as { mfaPending: string };

      expect(await authService.completeMfaLogin(first.mfaPending, '000000')).toBeNull();
      expect(mockRecordSecurityEvent).toHaveBeenCalledWith(3, 'login_failed', {}, 'totp');

      const ok = await authService.completeMfaLogin(
        first.mfaPending,
        totpCode(SECRET, currentStep()),
      );
      expect(ok).not.toBeNull();
      expect(mockSessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'totp', user_id: 3 }),
      );
    });

    it('skips the code on a device that was remembered', async () => {
      mockSessionRepository.isDeviceTrusted.mockReturnValueOnce(true);
      mockUserRepository.findByUsername.mockReturnValue({
        id: 3,
        username: 'staff',
        password_hash: await hashPassword('pw-correct'),
        role: 'user',
        oidc_sub: null,
        totp_secret: encrypt(SECRET),
        totp_enabled_at: '2026-10-19T00:00:00.000Z',
        totp_last_step: null,
      });

      const result = await authService.login('staff', 'pw-correct', { deviceId: 'd'.repeat(64) });

      expect(result).toHaveProperty('token');
      expect(result).not.toHaveProperty('mfaPending');
    });

    it('remembers the device only after logging in with a real code (not a recovery code)', async () => {
      const user = {
        id: 3,
        username: 'staff',
        password_hash: await hashPassword('pw-correct'),
        role: 'user',
        oidc_sub: null,
        totp_secret: encrypt(SECRET),
        totp_enabled_at: '2026-10-19T00:00:00.000Z',
        totp_last_step: null,
      };
      mockUserRepository.findByUsername.mockReturnValue(user);
      mockUserRepository.findById.mockReturnValue(user);
      const ctx = { deviceId: 'e'.repeat(64) };
      const first = (await authService.login('staff', 'pw-correct', ctx)) as { mfaPending: string };

      // 回復コードでは記憶しない
      mockMfaRepository.useRecoveryCode.mockReturnValueOnce(true);
      await authService.completeMfaLogin(first.mfaPending, 'abcd-efgh', ctx, true);
      expect(mockSessionRepository.trustDevice).not.toHaveBeenCalled();

      await authService.completeMfaLogin(
        first.mfaPending,
        totpCode(SECRET, currentStep()),
        ctx,
        true,
      );
      expect(mockSessionRepository.trustDevice).toHaveBeenCalledWith(
        3,
        expect.any(String),
        expect.any(String),
      );
      // 新しい端末のお知らせ（checkDevice → rememberDevice）は、記憶より先に走る
      expect(mockSessionRepository.rememberDevice.mock.invocationCallOrder[0]).toBeLessThan(
        mockSessionRepository.trustDevice.mock.invocationCallOrder[0],
      );
    });

    it('rejects a forged or expired pending token', async () => {
      await expect(authService.completeMfaLogin('not-a-token', '123456')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('sends a passkey holder to the second step instead of refusing (outside tests)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        mockMfaRepository.countPasskeys.mockReturnValue(1);
        mockUserRepository.findByUsername.mockReturnValue({
          id: 4,
          username: 'pk',
          password_hash: await hashPassword('pw-correct'),
          role: 'user',
          oidc_sub: null,
          totp_secret: null,
          totp_enabled_at: null,
        });

        const result = await authService.login('pk', 'pw-correct');

        expect(result).toMatchObject({
          mfaPending: expect.any(String),
          methods: { totp: false, passkey: true, oidc: false },
        });
        expect(mockSessionRepository.create).not.toHaveBeenCalled();
      } finally {
        mockMfaRepository.countPasskeys.mockReturnValue(0);
        vi.unstubAllEnvs();
      }
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
      const token = authService.generateToken(user, 'sess1');

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const payload = jwt.decode(token) as Record<string, unknown>;
      expect(payload.id).toBe(1);
      expect(payload.sid).toBe('sess1');
      expect(payload.username).toBe('testuser');
      expect(payload.role).toBe('user');
    });

    it('should set expiration to 15 minutes', () => {
      const user = { id: 1, username: 'test', role: 'admin' };
      const token = authService.generateToken(user, 'sess1');

      const payload = jwt.decode(token) as Record<string, number>;
      const expiresInSeconds = payload.exp - payload.iat;
      expect(expiresInSeconds).toBe(15 * 60);
    });
  });

  describe('generateRefreshToken', () => {
    it('should create a refresh token and store only its hash', () => {
      const token = authService.generateRefreshToken(1, 'sess1', '2030-01-01T00:00:00.000Z');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(128); // 64 bytes = 128 hex chars
      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        sha256(token),
        1,
        '2030-01-01T00:00:00.000Z',
        'sess1',
      );
      // The raw token must never be persisted
      expect(mockRefreshTokenRepository.create).not.toHaveBeenCalledWith(
        token,
        1,
        expect.any(String),
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

  describe('Authentik login without MFA (amr)', () => {
    const linked = {
      id: 7,
      username: 'ak',
      role: 'user',
      oidc_sub: '77',
      totp_secret: null,
      totp_enabled_at: null,
    };

    it('asks for a payroll second factor when Authentik used only a password', () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        mockUserRepository.findByOidcSub.mockReturnValue(linked);
        mockMfaRepository.countPasskeys.mockReturnValue(1);

        const result = authService.loginWithOidc('77', [], undefined, {}, ['pwd']);

        expect(result).toMatchObject({
          mfaPending: expect.any(String),
          methods: { passkey: true },
        });
        expect(mockUserRepository.setOidcMfaAt).toHaveBeenCalledWith(7, null);
        expect(mockSessionRepository.create).not.toHaveBeenCalled();
      } finally {
        mockMfaRepository.countPasskeys.mockReturnValue(0);
        vi.unstubAllEnvs();
      }
    });

    it('logs in directly and remembers it when Authentik used MFA', () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        mockUserRepository.findByOidcSub.mockReturnValue(linked);

        const result = authService.loginWithOidc('77', [], undefined, {}, ['pwd', 'mfa']);

        expect(result).toHaveProperty('token');
        expect(mockUserRepository.setOidcMfaAt).toHaveBeenCalledWith(7, expect.any(String));
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('treats a passwordless passkey login at Authentik (amr user) as MFA', () => {
      mockUserRepository.findByOidcSub.mockReturnValue(linked);
      authService.loginWithOidc('77', [], undefined, {}, ['user']);
      expect(mockUserRepository.setOidcMfaAt).toHaveBeenCalledWith(7, expect.any(String));
    });

    it('lets a user without any payroll factor in (the setup gate then asks for one)', () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        mockUserRepository.findByOidcSub.mockReturnValue(linked);
        const result = authService.loginWithOidc('77', [], undefined, {}, ['pwd']);
        expect(result).toHaveProperty('token');
        expect(mockUserRepository.setOidcMfaAt).toHaveBeenCalledWith(7, null);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("refuses an Authentik re-authentication by someone else's Authentik account", () => {
      mockUserRepository.findById.mockReturnValue({ ...linked, oidc_sub: '77' });
      mockSessionRepository.findById.mockReturnValue({ id: 's', user_id: 7, revoked_at: null });

      expect(authService.completeOidcReauth(7, 's', '99', ['pwd'])).toBe(false);
      expect(authService.completeOidcReauth(7, 's', '77', ['pwd'])).toBe(true);
      expect(mockSessionRepository.markAuthenticated).toHaveBeenCalledTimes(1);
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
