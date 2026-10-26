/**
 * Session Repository - sessions / known_devices tables (Drizzle ORM)
 */
import { and, desc, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { knownDevices, refreshTokens, sessions } from '../schema.js';

export interface SessionRow {
  id: string;
  user_id: number;
  method: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  authenticated_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export const sessionRepository = {
  create(row: Omit<SessionRow, 'revoked_at'>): void {
    db.insert(sessions).values(row).run();
  },

  findById(id: string): SessionRow | undefined {
    return db.select().from(sessions).where(eq(sessions.id, id)).get() as SessionRow | undefined;
  },

  /** 失効しておらず期限内のログインだけ（新しい順） */
  listActive(userId: number): SessionRow[] {
    return db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.user_id, userId),
          isNull(sessions.revoked_at),
          gt(sessions.expires_at, new Date().toISOString()),
        ),
      )
      .orderBy(desc(sessions.last_used_at))
      .all() as SessionRow[];
  },

  touch(id: string, ip: string | null, userAgent: string | null): void {
    db.update(sessions)
      .set({ last_used_at: new Date().toISOString(), ip, user_agent: userAgent })
      .where(eq(sessions.id, id))
      .run();
  },

  markAuthenticated(id: string): void {
    db.update(sessions)
      .set({ authenticated_at: new Date().toISOString() })
      .where(eq(sessions.id, id))
      .run();
  },

  /** 1つのログインを失効させる（ぶら下がるリフレッシュトークンも） */
  revoke(id: string): void {
    db.transaction((tx) => {
      tx.update(sessions)
        .set({ revoked_at: new Date().toISOString() })
        .where(and(eq(sessions.id, id), isNull(sessions.revoked_at)))
        .run();
      tx.update(refreshTokens).set({ revoked: 1 }).where(eq(refreshTokens.session_id, id)).run();
    });
  },

  /** 本人の全ログインを失効させる。exceptId を渡すとそれだけ残す */
  revokeAllForUser(userId: number, exceptId?: string): void {
    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(sessions)
        .set({ revoked_at: now })
        .where(
          and(
            eq(sessions.user_id, userId),
            isNull(sessions.revoked_at),
            exceptId ? ne(sessions.id, exceptId) : undefined,
          ),
        )
        .run();
      tx.update(refreshTokens)
        .set({ revoked: 1 })
        .where(
          and(
            eq(refreshTokens.user_id, userId),
            exceptId
              ? or(isNull(refreshTokens.session_id), ne(refreshTokens.session_id, exceptId))
              : undefined,
          ),
        )
        .run();
    });
  },

  /** 失効・期限切れから 30 日以上たったものを消す */
  cleanup(): number {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return db
      .delete(sessions)
      .where(or(lt(sessions.expires_at, cutoff), lt(sessions.revoked_at, cutoff)))
      .run().changes;
  },

  // --- known_devices ---

  countDevices(userId: number): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(knownDevices)
      .where(eq(knownDevices.user_id, userId))
      .get();
    return row?.n ?? 0;
  },

  /** この端末では、期限まで認証アプリのコードを求めない */
  trustDevice(userId: number, deviceHash: string, until: string): void {
    sessionRepository.rememberDevice(userId, deviceHash);
    db.update(knownDevices)
      .set({ mfa_trusted_until: until })
      .where(and(eq(knownDevices.user_id, userId), eq(knownDevices.device_hash, deviceHash)))
      .run();
  },

  isDeviceTrusted(userId: number, deviceHash: string): boolean {
    const row = db
      .select({ until: knownDevices.mfa_trusted_until })
      .from(knownDevices)
      .where(and(eq(knownDevices.user_id, userId), eq(knownDevices.device_hash, deviceHash)))
      .get();
    return Boolean(row?.until && row.until > new Date().toISOString());
  },

  countTrustedDevices(userId: number): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(knownDevices)
      .where(
        and(
          eq(knownDevices.user_id, userId),
          gt(knownDevices.mfa_trusted_until, new Date().toISOString()),
        ),
      )
      .get();
    return row?.n ?? 0;
  },

  /** 記憶した端末をすべて解除する（パスワード変更・二段階のリセット等） */
  clearTrustedDevices(userId: number): void {
    db.update(knownDevices)
      .set({ mfa_trusted_until: null })
      .where(eq(knownDevices.user_id, userId))
      .run();
  },

  /** 端末を記録する。初めての端末なら true */
  rememberDevice(userId: number, deviceHash: string): boolean {
    const now = new Date().toISOString();
    const updated = db
      .update(knownDevices)
      .set({ last_seen_at: now })
      .where(and(eq(knownDevices.user_id, userId), eq(knownDevices.device_hash, deviceHash)))
      .run();
    if (updated.changes > 0) return false;
    db.insert(knownDevices)
      .values({ user_id: userId, device_hash: deviceHash, first_seen_at: now, last_seen_at: now })
      .run();
    return true;
  },
};
