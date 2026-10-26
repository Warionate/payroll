import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMailService } = vi.hoisted(() => ({
  mockMailService: { isEnabled: vi.fn(() => true), send: vi.fn(() => Promise.resolve()) },
}));
vi.mock('../../../src/services/mailService.js', () => ({ mailService: mockMailService }));
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendAccountNotice } from '../../../src/utils/accountNotice.js';

describe('sendAccountNotice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mails the verified address with a subject per kind and a support contact', async () => {
    sendAccountNotice(
      { id: 1, username: 'staff', email: 'me@example.com', display_name: '山田' },
      'password_reset',
    );
    await vi.waitFor(() => expect(mockMailService.send).toHaveBeenCalled());
    expect(mockMailService.send).toHaveBeenCalledWith(
      'me@example.com',
      'パスワードが再設定されました',
      expect.stringContaining('support@payroll.warionate.com'),
    );
    expect(mockMailService.send.mock.calls[0][2]).toContain('山田 さん');
  });

  it('does nothing without a verified address or when mail is disabled', async () => {
    sendAccountNotice({ id: 1, username: 'staff', email: null }, 'password_changed');
    mockMailService.isEnabled.mockReturnValueOnce(false);
    sendAccountNotice({ id: 1, username: 'staff', email: 'me@example.com' }, 'mfa_reset');
    await new Promise((r) => setTimeout(r, 10));
    expect(mockMailService.send).not.toHaveBeenCalled();
  });
});
