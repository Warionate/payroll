/**
 * Notification Service - push subscription management
 */
import logger from '../utils/logger.js';
import {
  pushSubscriptionRepository,
  type PushSubscriptionSaveStatus,
} from '../repositories/pushSubscriptionRepository.js';

export const notificationService = {
  getVapidPublicKey(): string | undefined {
    return process.env.VAPID_PUBLIC_KEY;
  },

  subscribe(
    userId: number,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): PushSubscriptionSaveStatus {
    const result = pushSubscriptionRepository.subscribe(
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
    );

    if (result === 'conflict') {
      logger.warn(`Push subscription conflict for user ${userId}`);
    } else {
      logger.info(`Push subscription ${result} for user ${userId}`);
    }

    return result;
  },

  unsubscribe(endpoint: string, userId: number): void {
    pushSubscriptionRepository.unsubscribe(endpoint, userId);
    logger.info(`Push subscription removed for user ${userId}`);
  },
};
