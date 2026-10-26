import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { verifyPassword } from '../../../src/utils/password.js';

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
    findByUsername: vi.fn(),
    updateDisplayName: vi.fn(),
    setSetupDeadline: vi.fn(),
    setOidcSub: vi.fn(),
    findPastSetupDeadline: vi.fn(),
    deleteWithCascade: vi.fn(),
    updateUsername: vi.fn(),
    updatePassword: vi.fn(),
    updateRole: vi.fn(),
  },
  mockAuthService: {
    revokeAllUserTokens: vi.fn(),
    assertNotPwned: vi.fn(),
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

vi.mock('../../../src/utils/securityLog.js', () => ({
  recordSecurityEvent: vi.fn(),
}));

const { mockMfaService } = vi.hoisted(() => ({
  mockMfaService: { enforced: vi.fn(() => true), setupStatus: vi.fn() },
}));
vi.mock('../../../src/services/mfaService.js', () => ({ mfaService: mockMfaService }));

const { mockSendAccountNotice } = vi.hoisted(() => ({ mockSendAccountNotice: vi.fn() }));
vi.mock('../../../src/utils/accountNotice.js', () => ({
  sendAccountNotice: mockSendAccountNotice,
}));

const { mockWebauthnRepository, mockMfaRepository } = vi.hoisted(() => ({
  mockWebauthnRepository: { deleteAllForUser: vi.fn(() => 2) },
  mockMfaRepository: { disableTotp: vi.fn() },
}));
vi.mock('../../../src/repositories/webauthnRepository.js', () => ({
  webauthnRepository: mockWebauthnRepository,
}));
vi.mock('../../../src/repositories/mfaRepository.js', () => ({
  mfaRepository: mockMfaRepository,
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

      mockMfaService.setupStatus.mockReturnValue({ email: false, mfa: false, loginId: false });

      const result = userService.getAll();

      expect(result).toEqual(
        users.map((u) => ({ ...u, setup: { email: false, mfa: false, loginId: false } })),
      );
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

  describe('updateLoginId', () => {
    it('should allow admin to update any user profile', () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'oldname',
        role: 'user',
      });

      userService.updateLoginId(2, 'newname', { id: 1, role: 'admin' });

      expect(mockUserRepository.updateUsername).toHaveBeenCalledWith(2, 'newname');
    });

    it('should allow user to update own profile', () => {
      mockUserRepository.findById.mockReturnValue({
        id: 2,
        username: 'oldname',
        role: 'user',
      });

      userService.updateLoginId(2, 'newname', { id: 2, role: 'user' });

      expect(mockUserRepository.updateUsername).toHaveBeenCalledWith(2, 'newname');
    });

    it('should throw AuthorizationError for admin username change', () => {
      mockUserRepository.findById.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      expect(() => {
        userService.updateLoginId(1, 'newadmin', { id: 1, role: 'admin' });
      }).toThrow();
    });

    it('should throw AuthorizationError for unauthorized access', () => {
      expect(() => {
        userService.updateLoginId(3, 'newname', { id: 2, role: 'user' });
      }).toThrow('Unauthorized');
    });
    it('rejects a login ID that someone else already uses', () => {
      mockUserRepository.findById.mockReturnValue({ id: 2, username: 'oldname', role: 'user' });
      mockUserRepository.findByUsername.mockReturnValue({ id: 5, username: 'taken' });

      expect(() => userService.updateLoginId(2, 'taken', { id: 2, role: 'user' })).toThrow(
        '既に使われています',
      );
      expect(mockUserRepository.updateUsername).not.toHaveBeenCalledWith(2, 'taken');
    });
  });

  describe('updateDisplayName', () => {
    it('lets a user change their own display name (Japanese allowed)', () => {
      mockUserRepository.findById.mockReturnValue({ id: 2, username: 'staff', role: 'user' });

      userService.updateDisplayName(2, '山田 太郎', { id: 2, role: 'user' });

      expect(mockUserRepository.updateDisplayName).toHaveBeenCalledWith(2, '山田 太郎');
    });

    it("does not let a user change someone else's display name", () => {
      expect(() => userService.updateDisplayName(3, 'x', { id: 2, role: 'user' })).toThrow();
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
      const isValid = await verifyPassword('newpassword', hash);
      expect(isValid).toBe(true);
      // 管理者が変えたときは、本人に「管理者によって変更されました」のメールを送る
      expect(mockSendAccountNotice).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2 }),
        'password_set_by_admin',
      );
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

  describe('cleanupIncompleteSignups', () => {
    const past = '2026-10-01T00:00:00.000Z';

    it('deletes a signup that is past its deadline and still not set up', () => {
      mockUserRepository.findPastSetupDeadline.mockReturnValue([
        { id: 9, username: 'late', role: 'user', setup_deadline: past },
      ]);
      mockMfaService.setupStatus.mockReturnValue({ email: true, mfa: true, loginId: false });

      expect(userService.cleanupIncompleteSignups()).toBe(1);
      expect(mockUserRepository.deleteWithCascade).toHaveBeenCalledWith(9);
    });

    it('only clears the deadline when setup is already done', () => {
      mockUserRepository.findPastSetupDeadline.mockReturnValue([
        { id: 9, username: 'done', role: 'user', setup_deadline: past },
      ]);
      mockMfaService.setupStatus.mockReturnValue({ email: false, mfa: false, loginId: false });

      expect(userService.cleanupIncompleteSignups()).toBe(0);
      expect(mockUserRepository.deleteWithCascade).not.toHaveBeenCalled();
      expect(mockUserRepository.setSetupDeadline).toHaveBeenCalledWith(9, null);
    });

    it('never deletes an admin', () => {
      mockUserRepository.findPastSetupDeadline.mockReturnValue([
        { id: 3, username: 'boss', role: 'admin', setup_deadline: past },
      ]);
      mockMfaService.setupStatus.mockReturnValue({ email: true, mfa: true, loginId: false });

      expect(userService.cleanupIncompleteSignups()).toBe(0);
      expect(mockUserRepository.deleteWithCascade).not.toHaveBeenCalled();
    });

    it('does nothing when setup is not enforced', () => {
      mockMfaService.enforced.mockReturnValueOnce(false);
      expect(userService.cleanupIncompleteSignups()).toBe(0);
      expect(mockUserRepository.findPastSetupDeadline).not.toHaveBeenCalled();
    });
  });

  describe('resetMfa', () => {
    const admin = { id: 1, username: 'boss', role: 'admin' };

    it('removes every second factor and logs the user out everywhere', () => {
      mockUserRepository.findById.mockReturnValue({ id: 5, username: 'staff', role: 'user' });

      userService.resetMfa(5, admin);

      expect(mockWebauthnRepository.deleteAllForUser).toHaveBeenCalledWith(5);
      expect(mockMfaRepository.disableTotp).toHaveBeenCalledWith(5);
      expect(mockUserRepository.setOidcSub).toHaveBeenCalledWith(5, null);
      expect(mockAuthService.revokeAllUserTokens).toHaveBeenCalledWith(5);
      expect(mockSendAccountNotice).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5 }),
        'mfa_reset',
      );
    });

    it('refuses to reset an admin (they would be locked out)', () => {
      mockUserRepository.findById.mockReturnValue({ id: 2, username: 'other', role: 'admin' });

      expect(() => userService.resetMfa(2, admin)).toThrow('管理者');
      expect(mockWebauthnRepository.deleteAllForUser).not.toHaveBeenCalled();
    });

    it('refuses to reset yourself and refuses non-admins', () => {
      expect(() => userService.resetMfa(1, admin)).toThrow('自分');
      expect(() => userService.resetMfa(5, { id: 3, username: 'x', role: 'user' })).toThrow();
      expect(mockWebauthnRepository.deleteAllForUser).not.toHaveBeenCalled();
    });
  });
});
