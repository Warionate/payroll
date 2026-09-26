/**
 * Broadcast Repository - broadcasts, broadcast_reads (Drizzle ORM)
 */
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { broadcasts, broadcastReads, users } from '../schema.js';

export interface BroadcastRow {
  id: number;
  sender_id: number | null;
  title: string;
  message: string;
  category: string;
  expires_at: string | null;
  deleted_at: string | null;
  send_push: number;
  show_on_open: number;
  created_at: string;
  updated_at: string | null;
  sender_name: string | null;
  is_read: number;
  read_count: number;
}

export const broadcastRepository = {
  findAll(userId: number, isAdmin: boolean): BroadcastRow[] {
    let expiryFilter = '';
    if (!isAdmin) {
      expiryFilter = `AND (${broadcasts.expires_at.name} IS NULL OR datetime(${broadcasts.expires_at.name}) > datetime('now'))`;
    }

    return db
      .select({
        id: broadcasts.id,
        sender_id: broadcasts.sender_id,
        title: broadcasts.title,
        message: broadcasts.message,
        category: broadcasts.category,
        expires_at: broadcasts.expires_at,
        deleted_at: broadcasts.deleted_at,
        send_push: broadcasts.send_push,
        show_on_open: broadcasts.show_on_open,
        created_at: broadcasts.created_at,
        updated_at: broadcasts.updated_at,
        sender_name: users.username,
        is_read: sql<number>`CASE WHEN ${broadcastReads.read_at} IS NOT NULL THEN 1 ELSE 0 END`,
        read_count: sql<number>`(SELECT COUNT(*) FROM broadcast_reads WHERE broadcast_id = ${broadcasts.id})`,
      })
      .from(broadcasts)
      .leftJoin(users, eq(broadcasts.sender_id, users.id))
      .leftJoin(
        broadcastReads,
        and(eq(broadcasts.id, broadcastReads.broadcast_id), eq(broadcastReads.user_id, userId)),
      )
      .where(sql`${broadcasts.deleted_at} IS NULL ${sql.raw(expiryFilter)}`)
      .orderBy(desc(broadcasts.created_at))
      .all() as BroadcastRow[];
  },

  create(
    senderId: number,
    title: string,
    encryptedMessage: string,
    expiresAt: string | null,
    category: string,
    sendPush: boolean,
    showOnOpen: boolean,
  ): number | bigint {
    const result = db
      .insert(broadcasts)
      .values({
        sender_id: senderId,
        title,
        message: encryptedMessage,
        expires_at: expiresAt,
        category,
        send_push: sendPush ? 1 : 0,
        show_on_open: showOnOpen ? 1 : 0,
      })
      .run();
    return result.lastInsertRowid;
  },

  findMessageById(id: string | number): { message: string } | undefined {
    return db
      .select({ message: broadcasts.message })
      .from(broadcasts)
      .where(eq(broadcasts.id, Number(id)))
      .get() as { message: string } | undefined;
  },

  softDelete(id: string | number): void {
    db.update(broadcasts)
      .set({ deleted_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(broadcasts.id, Number(id)))
      .run();
  },

  update(
    id: string | number,
    encryptedMessage: string,
    title: string | null,
    expiresAt: string | null,
    category: string,
    sendPush: boolean,
    showOnOpen: boolean,
  ): number {
    const result = db
      .update(broadcasts)
      .set({
        message: encryptedMessage,
        title,
        expires_at: expiresAt,
        category,
        send_push: sendPush ? 1 : 0,
        show_on_open: showOnOpen ? 1 : 0,
        updated_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(eq(broadcasts.id, Number(id)), isNull(broadcasts.deleted_at)))
      .run();
    return result.changes;
  },

  resetReadStatus(broadcastId: string | number): void {
    db.delete(broadcastReads)
      .where(eq(broadcastReads.broadcast_id, Number(broadcastId)))
      .run();
  },

  markAsRead(userId: number, broadcastId: string | number): void {
    db.insert(broadcastReads)
      .values({
        user_id: userId,
        broadcast_id: Number(broadcastId),
      })
      .onConflictDoNothing()
      .run();
  },

  getReaders(
    broadcastId: string | number,
  ): { id: number; username: string; role: 'admin' | 'user'; read_at: string }[] {
    return db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        read_at: broadcastReads.read_at,
      })
      .from(broadcastReads)
      .innerJoin(users, eq(broadcastReads.user_id, users.id))
      .where(eq(broadcastReads.broadcast_id, Number(broadcastId)))
      .orderBy(desc(broadcastReads.read_at))
      .all() as { id: number; username: string; role: 'admin' | 'user'; read_at: string }[];
  },

  /**
   * Count unread broadcasts for a user
   */
  countUnread(userId: number): number {
    const row = db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(broadcasts)
      .leftJoin(
        broadcastReads,
        and(eq(broadcasts.id, broadcastReads.broadcast_id), eq(broadcastReads.user_id, userId)),
      )
      .where(
        sql`${broadcastReads.read_at} IS NULL AND ${broadcasts.deleted_at} IS NULL AND (${broadcasts.expires_at} IS NULL OR datetime(${broadcasts.expires_at}) > datetime('now'))`,
      )
      .get();
    return row?.count || 0;
  },
};
