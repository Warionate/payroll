import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/errors.js', () => {
  class AuthorizationError extends Error {
    statusCode: number;
    constructor(message?: string) {
      super(message || 'Unauthorized');
      this.name = 'AuthorizationError';
      this.statusCode = 403;
    }
  }
  class AuthenticationError extends Error {
    statusCode: number;
    constructor(message?: string) {
      super(message || 'Unauthenticated');
      this.name = 'AuthenticationError';
      this.statusCode = 401;
    }
  }
  class NotFoundError extends Error {
    statusCode: number;
    constructor(resource?: string) {
      super(`${resource || 'Resource'} not found`);
      this.name = 'NotFoundError';
      this.statusCode = 404;
    }
  }
  class ValidationError extends Error {
    statusCode: number;
    details?: unknown;
    constructor(message: string, details?: unknown) {
      super(message);
      this.name = 'ValidationError';
      this.statusCode = 400;
      this.details = details;
    }
  }
  class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 500) {
      super(message);
      this.name = 'AppError';
      this.statusCode = statusCode;
    }
  }
  const ErrorCodes = { SERVICE_UNAVAILABLE: 9002 };
  return {
    AppError,
    AuthorizationError,
    AuthenticationError,
    ErrorCodes,
    NotFoundError,
    ValidationError,
  };
});

const { mockUserRepository, mockAuthService, mockAuthentikService } = vi.hoisted(() => ({
  mockUserRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    deleteWithCascade: vi.fn(),
    updateUsername: vi.fn(),
    updatePassword: vi.fn(),
    updateRole: vi.fn(),
  },
  mockAuthService: {
    revokeAllUserTokens: vi.fn(),
  },
  mockAuthentikService: {
    isConfigured: vi.fn(),
    setAdmin: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/userRepository.js', () => ({
  userRepository: mockUserRepository,
}));

vi.mock('../../../src/services/authService.js', () => ({
  authService: mockAuthService,
}));

vi.mock('../../../src/services/authentikService.js', () => ({
  authentikService: mockAuthentikService,
}));

import { userService } from '../../../src/services/userService.js';

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all users', () => {
      const users = [
        { id: 1, username: 'admin', role: 'admin' },
        { id: 2, username: 'user1', role: 'user' },
      ];
      mockUserRepository.findAll.mockReturnValue(users);

      const result = userService.getAll();

      expect(result).toEqual(users);
    });
  });

  describe('deleteUser', () => {
    it('should allow admin to delete any user without a password', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'user',
      });

      await userService.deleteUser(2, { id: 1, username: 'admin', role: 'admin' });

      expect(mockUserRepository.deleteWithCascade).toHaveBeenCalledWith(2);
    });

    it('should allow user to delete themselves with a valid password', async () => {
      const password_hash = await bcrypt.hash('mypassword', 10);
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'user',
        password_hash,
      });

      await userService.deleteUser(2, { id: 2, username: 'user1', role: 'user' }, 'mypassword');

      expect(mockUserRepository.deleteWithCascade).toHaveBeenCalledWith(2);
    });

    it('should throw ValidationError when self-delete has no password', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'user',
        password_hash: 'irrelevant',
      });

      await expect(
        userService.deleteUser(2, { id: 2, username: 'user1', role: 'user' }),
      ).rejects.toThrow('パスワードを入力してください');
      expect(mockUserRepository.deleteWithCascade).not.toHaveBeenCalled();
    });

    it('should throw AuthenticationError when self-delete password is wrong', async () => {
      const password_hash = await bcrypt.hash('correct', 10);
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'user',
        password_hash,
      });

      await expect(
        userService.deleteUser(2, { id: 2, username: 'user1', role: 'user' }, 'wrong'),
      ).rejects.toThrow('パスワードが間違っています');
      expect(mockUserRepository.deleteWithCascade).not.toHaveBeenCalled();
    });

    it('should throw AuthorizationError when non-admin tries to delete another user', async () => {
      await expect(
        userService.deleteUser(3, { id: 2, username: 'user1', role: 'user' }),
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw NotFoundError when user does not exist', async () => {
      mockUserRepository.findById.mockReturnValue(undefined);

      await expect(
        userService.deleteUser(999, { id: 1, username: 'admin', role: 'admin' }),
      ).rejects.toThrow('not found');
    });

    it('should throw AuthorizationError when trying to delete admin user', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      await expect(
        userService.deleteUser(1, { id: 1, username: 'admin', role: 'admin' }),
      ).rejects.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('should allow admin to update any user profile', () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'oldname',
        role: 'user',
      });

      userService.updateProfile(2, 'newname', { id: 1, role: 'admin' });

      expect(mockUserRepository.updateUsername).toHaveBeenCalledWith(2, 'newname');
    });

    it('should allow user to update own profile', () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'oldname',
        role: 'user',
      });

      userService.updateProfile(2, 'newname', { id: 2, role: 'user' });

      expect(mockUserRepository.updateUsername).toHaveBeenCalledWith(2, 'newname');
    });

    it('should throw AuthorizationError for admin username change', () => {
      mockUserRepository.findById.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      expect(() => {
        userService.updateProfile(1, 'newadmin', { id: 1, role: 'admin' });
      }).toThrow();
    });

    it('should throw AuthorizationError for unauthorized access', () => {
      expect(() => {
        userService.updateProfile(3, 'newname', { id: 2, role: 'user' });
      }).toThrow('Unauthorized');
    });
  });

  describe('updatePassword', () => {
    it('should hash password and revoke all tokens', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        password_hash: 'old-hash',
        role: 'user',
      });

      await userService.updatePassword(2, 'newpassword', {
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith(2, expect.any(String));
      expect(mockAuthService.revokeAllUserTokens).toHaveBeenCalledWith(2);

      // Verify the password was actually hashed
      const hash = mockUserRepository.updatePassword.mock.calls[0][1];
      const isValid = await bcrypt.compare('newpassword', hash);
      expect(isValid).toBe(true);
    });

    it('should throw AuthorizationError for unauthorized access', async () => {
      await expect(
        userService.updatePassword(3, 'newpassword', { id: 2, role: 'user' }),
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw NotFoundError when target user does not exist', async () => {
      mockUserRepository.findById.mockReturnValue(undefined);

      await expect(
        userService.updatePassword(999, 'newpassword', {
          id: 1,
          username: 'admin',
          role: 'admin',
        }),
      ).rejects.toThrow('not found');

      expect(mockUserRepository.updatePassword).not.toHaveBeenCalled();
      expect(mockAuthService.revokeAllUserTokens).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('should update user role', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'user',
      });

      await userService.updateRole(2, 'admin', { id: 1, username: 'admin', role: 'admin' });

      expect(mockUserRepository.updateRole).toHaveBeenCalledWith(2, 'admin');
      expect(mockAuthentikService.setAdmin).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid role', async () => {
      await expect(
        userService.updateRole(2, 'superadmin', { id: 1, username: 'admin', role: 'admin' }),
      ).rejects.toThrow('無効な権限');
    });

    it('should throw NotFoundError when user not found', async () => {
      mockUserRepository.findById.mockReturnValue(undefined);

      await expect(
        userService.updateRole(999, 'admin', { id: 1, username: 'admin', role: 'admin' }),
      ).rejects.toThrow('not found');
    });

    it('should throw AuthorizationError when trying to change admin role', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      await expect(
        userService.updateRole(1, 'user', { id: 1, username: 'admin', role: 'admin' }),
      ).rejects.toThrow();
    });

    it('should write to Authentik first for a linked user', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'user',
        oidc_sub: '42',
      });
      mockAuthentikService.isConfigured.mockReturnValue(true);
      mockAuthentikService.setAdmin.mockResolvedValue(undefined);

      await userService.updateRole(2, 'admin', { id: 1, username: 'admin', role: 'admin' });

      expect(mockAuthentikService.setAdmin).toHaveBeenCalledWith('42', true);
      expect(mockUserRepository.updateRole).toHaveBeenCalledWith(2, 'admin');
    });

    it('should not change DB role when Authentik write fails', async () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'user1',
        role: 'admin',
        oidc_sub: '42',
      });
      mockAuthentikService.isConfigured.mockReturnValue(true);
      mockAuthentikService.setAdmin.mockRejectedValue(new Error('HTTP 503'));

      await expect(
        userService.updateRole(2, 'user', { id: 1, username: 'admin', role: 'admin' }),
      ).rejects.toThrow('Authentik');
      expect(mockUserRepository.updateRole).not.toHaveBeenCalled();
    });
  });
});
