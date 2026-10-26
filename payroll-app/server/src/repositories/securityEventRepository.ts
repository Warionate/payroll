/**
 * Security Event Repository - security_events table (Drizzle ORM)
 */
import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { securityEvents } from '../schema.js';

export interface SecurityEventRow {
  id: number;
  user_id: number;
  type: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
}

export const securityEventRepository = {
  create(row: Omit<SecurityEventRow, 'id'>): void {
    db.insert(securityEvents).values(row).run();
  },

  listByUser(userId: number, limit: number): SecurityEventRow[] {
    return db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.user_id, userId))
      .orderBy(desc(securityEvents.created_at), desc(securityEvents.id))
      .limit(limit)
      .all() as SecurityEventRow[];
  },

  /** ある時刻以降の、指定した種類の出来事の数（全利用者） */
  countSince(types: string[], sinceIso: string): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(securityEvents)
      .where(and(inArray(securityEvents.type, types), gt(securityEvents.created_at, sinceIso)))
      .get();
    return row?.n ?? 0;
  },

  deleteOlderThan(cutoffIso: string): number {
    return db.delete(securityEvents).where(lt(securityEvents.created_at, cutoffIso)).run().changes;
  },
};
