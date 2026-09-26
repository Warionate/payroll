import webpush from 'web-push';
import db from '../db.js';
import logger from './logger.js';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  [key: string]: unknown;
}

interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

const MAX_PUSH_CONCURRENCY = 8;

// Initialize web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@payroll.warionate.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  logger.warn('VAPID keys not found. Push notifications will not work.');
}

/** Send one payload to a single subscription, pruning it if the endpoint is gone. */
async function sendToSubscription(sub: PushSubscriptionRow, payloadString: string): Promise<void> {
  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };

  try {
    await webpush.sendNotification(pushSubscription, payloadString);
    logger.info(`Push sent to user ${sub.user_id} (endpoint: ${sub.id})`);
  } catch (error) {
    const pushError = error as { statusCode?: number; message?: string };
    logger.error(
      `Error sending push to user ${sub.user_id}: ${pushError.message || 'Unknown push error'}`,
    );

    if (pushError.statusCode === 410 || pushError.statusCode === 404) {
      logger.info(`Removing invalid subscription: ${sub.id}`);
      try {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } catch (err) {
        logger.error(`Failed to delete invalid subscription: ${(err as Error).message}`);
      }
    }
  }
}

/** Send to a set of subscriptions in bounded batches to avoid fan-out spikes. */
function dispatch(subscriptions: PushSubscriptionRow[], payload: PushPayload): void {
  if (!subscriptions || subscriptions.length === 0) return;
  const payloadString = JSON.stringify(payload);

  void (async () => {
    for (let i = 0; i < subscriptions.length; i += MAX_PUSH_CONCURRENCY) {
      const batch = subscriptions.slice(i, i + MAX_PUSH_CONCURRENCY);
      await Promise.allSettled(batch.map((sub) => sendToSubscription(sub, payloadString)));
    }
  })();
}

/**
 * Send push notification to a specific user
 */
export const sendPushNotification = (userId: number, payload: PushPayload): void => {
  try {
    const subscriptions = db
      .prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .all(userId) as PushSubscriptionRow[];
    dispatch(subscriptions, payload);
  } catch (err) {
    logger.error(`Error fetching subscriptions for user ${userId}: ${(err as Error).message}`);
  }
};

/**
 * Send push notification to multiple users
 */
export const sendPushToUsers = (userIds: number[], payload: PushPayload): void => {
  userIds.forEach((id) => sendPushNotification(id, payload));
};

/**
 * Send push notification to all users (except sender if specified).
 * Fetches every subscription in a single query and dispatches directly, instead
 * of re-querying push_subscriptions per user (B-2, avoids the N+1).
 */
export const sendPushToAll = (payload: PushPayload, excludeUserId: number | null = null): void => {
  try {
    let query = 'SELECT * FROM push_subscriptions';
    const params: unknown[] = [];

    if (excludeUserId) {
      query += ' WHERE user_id != ?';
      params.push(excludeUserId);
    }

    const subscriptions = db.prepare(query).all(...params) as PushSubscriptionRow[];
    dispatch(subscriptions, payload);
  } catch (err) {
    logger.error(`Error fetching all push subscriptions: ${(err as Error).message}`);
  }
};
