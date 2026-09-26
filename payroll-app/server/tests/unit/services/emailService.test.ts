import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockTokens, mockUsers, mockMail, mockAuth } = vi.hoisted(() => ({
  mockTokens: {
    create: vi.fn(),
    take: vi.fn(),
    pendingVerify: vi.fn(),
    countRecent: vi.fn(),
    deleteForUser: vi.fn(),
  },
  mockUsers: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    usernameTakenAsEmail: vi.fn(),
    setEmail: vi.fn(),
    updatePassword: vi.fn(),
  },
  mockMail: {
    isEnabled: vi.fn(() => true),
    appUrl: vi.fn(() => 'https://payroll.example'),
    send: vi.fn(),
  },
  mockAuth: {
    revokeAllUserTokens: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/emailTokenRepository.js', () => ({
  emailTokenRepository: mockTokens,
}));
vi.mock('../../../src/repositories/userRepository.js', () => ({ userRepository: mockUsers }));
vi.mock('../../../src/services/mailService.js', () => ({ mailService: mockMail }));
vi.mock('../../../src/services/authService.js', () => ({ authService: mockAuth }));

import { emailService, EmailError } from '../../../src/services/emailService.js';

describe('emailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTokens.countRecent.mockReturnValue(0);
    mockUsers.usernameTakenAsEmail.mockReturnValue(false);
    mockUsers.findByEmail.mockReturnValue(undefined);
  });

  describe('requestVerification', () => {
    it('sends a link and stores only the hash of the token', async () => {
      mockUsers.findById.mockReturnValue({ id: 5, username: 'u', email: null });

      await emailService.requestVerification(5, '  Me@Example.com ');

      const row = mockTokens.create.mock.calls[0][0];
      expect(row).toMatchObject({ user_id: 5, purpose: 'verify', email: 'me@example.com' });
      const body = mockMail.send.mock.calls[0][2] as string;
      const token = body.match(/token=([\w-]+)/)![1];
      expect(row.token_hash).not.toBe(token);
      expect(mockUsers.setEmail).not.toHaveBeenCalled(); // 確認されるまで変わらない
    });

    it('silently does not send when the address belongs to someone else', async () => {
      mockUsers.findById.mockReturnValue({ id: 5, username: 'u', email: null });
      mockUsers.findByEmail.mockReturnValue({ id: 6 });

      await emailService.requestVerification(5, 'taken@example.com');

      expect(mockMail.send).not.toHaveBeenCalled();
      expect(mockTokens.create).not.toHaveBeenCalled();
    });

    it('refuses after too many mails in an hour', async () => {
      mockUsers.findById.mockReturnValue({ id: 5, username: 'u', email: null });
      mockTokens.countRecent.mockReturnValue(3);

      await expect(emailService.requestVerification(5, 'me@example.com')).rejects.toThrow(
        EmailError,
      );
      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('rejects a malformed address', async () => {
      await expect(emailService.requestVerification(5, 'not-an-email')).rejects.toThrow(EmailError);
    });
  });

  describe('confirmVerification', () => {
    it('refuses when the address was taken in the meantime', () => {
      mockTokens.take.mockReturnValue({ user_id: 5, email: 'me@example.com' });
      mockUsers.findByEmail.mockReturnValue({ id: 6 });

      expect(() => emailService.confirmVerification('t')).toThrow(EmailError);
      expect(mockUsers.setEmail).not.toHaveBeenCalled();
    });

    it('refuses when a username equals the address', () => {
      mockTokens.take.mockReturnValue({ user_id: 5, email: 'me@example.com' });
      mockUsers.usernameTakenAsEmail.mockReturnValue(true);

      expect(() => emailService.confirmVerification('t')).toThrow(EmailError);
    });

    it('sets the email for a valid token', () => {
      mockTokens.take.mockReturnValue({ user_id: 5, email: 'me@example.com' });

      expect(emailService.confirmVerification('t')).toBe('me@example.com');
      expect(mockUsers.setEmail).toHaveBeenCalledWith(5, 'me@example.com');
    });
  });

  describe('requestPasswordReset', () => {
    it('does nothing (and says nothing) for an unknown address', async () => {
      await emailService.requestPasswordReset('nobody@example.com');

      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('sends a 30-minute link to the verified address', async () => {
      mockUsers.findByEmail.mockReturnValue({ id: 5, username: 'u', email: 'me@example.com' });

      await emailService.requestPasswordReset('ME@example.com');

      const row = mockTokens.create.mock.calls[0][0];
      const ttl = new Date(row.expires_at).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(29 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);
      expect(mockMail.send.mock.calls[0][0]).toBe('me@example.com');
    });
  });

  describe('resetPassword', () => {
    it('rejects the link when the address changed after it was sent', async () => {
      mockTokens.take.mockReturnValue({ user_id: 5, email: 'old@example.com' });
      mockUsers.findById.mockReturnValue({ id: 5, username: 'u', email: 'new@example.com' });

      await expect(emailService.resetPassword('t', 'newpass123')).rejects.toThrow(EmailError);
      expect(mockUsers.updatePassword).not.toHaveBeenCalled();
    });

    it('updates the password and logs out every device', async () => {
      mockTokens.take.mockReturnValue({ user_id: 5, email: 'me@example.com' });
      mockUsers.findById.mockReturnValue({ id: 5, username: 'u', email: 'me@example.com' });

      await emailService.resetPassword('t', 'newpass123');

      expect(mockUsers.updatePassword).toHaveBeenCalledWith(5, expect.any(String));
      expect(mockAuth.revokeAllUserTokens).toHaveBeenCalledWith(5);
    });

    it('rejects a password containing the username', async () => {
      mockTokens.take.mockReturnValue({ user_id: 5, email: 'me@example.com' });
      mockUsers.findById.mockReturnValue({ id: 5, username: 'tanaka', email: 'me@example.com' });

      await expect(emailService.resetPassword('t', 'tanaka123')).rejects.toThrow(EmailError);
    });
  });
});
