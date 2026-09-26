import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const { mockUserRepository } = vi.hoisted(() => ({
  mockUserRepository: {
    getRole: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/userRepository.js', () => ({
  userRepository: mockUserRepository,
}));

// Set required env vars before importing
beforeAll(() => {
  process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
  process.env.JWT_SECRET = 'testsecret12345678901234567890123';
});

describe('auth middleware', () => {
  let authenticateToken;

  beforeAll(async () => {
    const auth = await import('../../../src/middleware/auth.js');
    authenticateToken = auth.authenticateToken;
  });

  // Helper: generate a test token directly with jwt.sign (independent of authService)
  const createTestToken = (user) => jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '15m' });

  beforeEach(() => {
    mockUserRepository.getRole.mockReset();
    mockUserRepository.getRole.mockReturnValue('user');
  });

  describe('authenticateToken', () => {
    it('should call next() with valid token', () => {
      const user = { id: 1, username: 'testuser', role: 'user' };
      const token = createTestToken(user);

      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(req.user.username).toBe('testuser');
    });

    it('should return 401 when no token provided', () => {
      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: '認証トークンが必要です' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token format', () => {
      const req = {
        headers: { authorization: 'InvalidFormat' },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for expired/invalid token', () => {
      const req = {
        headers: { authorization: 'Bearer invalid.token.here' },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'トークンが無効または期限切れです' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user no longer exists (deleted user)', () => {
      mockUserRepository.getRole.mockReturnValue(undefined);
      const token = createTestToken({ id: 99, username: 'ghost', role: 'user' });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'ユーザーが存在しません' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should fall back to JWT role when DB role check throws', () => {
      mockUserRepository.getRole.mockImplementation(() => {
        throw new Error('db unavailable');
      });
      const token = createTestToken({ id: 1, username: 'testuser', role: 'admin' });

      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('admin');
    });
  });
});
