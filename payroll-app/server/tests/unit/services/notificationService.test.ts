import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockPushSubscriptionRepository } = vi.hoisted(() => ({
  mockPushSubscriptionRepository: {
    subscribe: vi.fn(() => 'created'),
    unsubscribe: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/pushSubscriptionRepository.js', () => ({
  pushSubscriptionRepository: mockPushSubscriptionRepository,
}));

import { notificationService } from '../../../src/services/notificationService.js';

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getVapidPublicKey', () => {
    it('should return VAPID_PUBLIC_KEY from env', () => {
      const original = process.env.VAPID_PUBLIC_KEY;
      process.env.VAPID_PUBLIC_KEY = 'test_vapid_key';

      const result = notificationService.getVapidPublicKey();

      expect(result).toBe('test_vapid_key');

      if (original !== undefined) {
        process.env.VAPID_PUBLIC_KEY = original;
      } else {
        delete process.env.VAPID_PUBLIC_KEY;
      }
    });

    it('should return undefined when VAPID_PUBLIC_KEY is not set', () => {
      const original = process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PUBLIC_KEY;

      const result = notificationService.getVapidPublicKey();

      expect(result).toBeUndefined();

      if (original !== undefined) {
        process.env.VAPID_PUBLIC_KEY = original;
      }
    });
  });

  describe('subscribe', () => {
    it('should register push subscription and return created status', () => {
      const subscription = {
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'key1', auth: 'auth1' },
      };

      const result = notificationService.subscribe(1, subscription);

      expect(mockPushSubscriptionRepository.subscribe).toHaveBeenCalledWith(
        1,
        'https://push.example.com/sub1',
        'key1',
        'auth1',
      );
      expect(result).toBe('created');
    });

    it('should return conflict when endpoint belongs to another user', () => {
      mockPushSubscriptionRepository.subscribe.mockReturnValueOnce('conflict');

      const subscription = {
        endpoint: 'https://push.example.com/sub2',
        keys: { p256dh: 'key2', auth: 'auth2' },
      };

      const result = notificationService.subscribe(1, subscription);

      expect(result).toBe('conflict');
    });
  });

  describe('unsubscribe', () => {
    it('should remove push subscription', () => {
      notificationService.unsubscribe('https://push.example.com/sub1', 1);

      expect(mockPushSubscriptionRepository.unsubscribe).toHaveBeenCalledWith(
        'https://push.example.com/sub1',
        1,
      );
    });
  });
});
