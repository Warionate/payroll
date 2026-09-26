/**
 * Push Subscription Repository - push_subscriptions table (Drizzle ORM)
 */
import { eq, and, inArray } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { pushSubscriptions } from '../schema.js';

export type PushSubscriptionSaveStatus = 'created' | 'updated' | 'conflict';

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export const pushSubscriptionRepository = {
  subscribe(
    userId: number,
    endpoint: string,
    p256dh: string,
    auth: string,
  ): PushSubscriptionSaveStatus {
    const existing = db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .get() as PushSubscriptionRow | undefined;

    if (!existing) {
      db.insert(pushSubscriptions).values({ user_id: userId, endpoint, p256dh, auth }).run();
      return 'created';
    }

    if (existing.user_id !== userId) {
      return 'conflict';
    }

    db.update(pushSubscriptions)
      .set({ p256dh, auth })
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.user_id, userId)))
      .run();

    return 'updated';
  },

  unsubscribe(endpoint: string, userId: number): void {
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.user_id, userId)))
      .run();
  },

  findByUserId(userId: number): PushSubscriptionRow[] {
    return db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.user_id, userId))
      .all() as PushSubscriptionRow[];
  },

  findByUserIds(userIds: number[]): PushSubscriptionRow[] {
    if (userIds.length === 0) return [];
    return db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.user_id, userIds))
      .all() as PushSubscriptionRow[];
  },

  findAll(): PushSubscriptionRow[] {
    return db.select().from(pushSubscriptions).all() as PushSubscriptionRow[];
  },

  deleteByEndpoint(endpoint: string): void {
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
  },
};
