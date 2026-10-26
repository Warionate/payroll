import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockNotify, mockRepo } = vi.hoisted(() => ({
  mockNotify: vi.fn(),
  mockRepo: { countSince: vi.fn() },
}));
vi.mock('../../../src/utils/discord.js', () => ({ notifySecurityAlert: mockNotify }));
vi.mock('../../../src/repositories/securityEventRepository.js', () => ({
  securityEventRepository: mockRepo,
}));
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  alertAdminLogin,
  checkLoginFailureSpike,
  resetSecurityAlertState,
} from '../../../src/utils/securityAlerts.js';

describe('securityAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSecurityAlertState();
  });

  it('alerts on a spike of login failures and then stays quiet for an hour', () => {
    mockRepo.countSince.mockReturnValue(20);
    const t0 = 1_800_000_000_000;

    checkLoginFailureSpike(t0);
    checkLoginFailureSpike(t0 + 5 * 60 * 1000);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0].title).toContain('急増');

    checkLoginFailureSpike(t0 + 61 * 60 * 1000);
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it('stays quiet below the threshold', () => {
    mockRepo.countSince.mockReturnValue(3);
    checkLoginFailureSpike(1_800_000_000_000);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('reports an admin login with the method and IP', () => {
    alertAdminLogin({ id: 1, username: 'admin' }, 'passkey', { ip: '203.0.113.5' });
    const sent = mockNotify.mock.calls[0][0];
    expect(sent.title).toBe('管理者のログイン');
    expect(JSON.stringify(sent.fields)).toContain('203.0.113.5');
    expect(JSON.stringify(sent.fields)).toContain('passkey');
  });
});
