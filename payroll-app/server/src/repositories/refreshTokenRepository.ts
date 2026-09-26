/**
 * Refresh Token Repository - refresh_tokens table (Drizzle ORM)
 */
import { eq, or, lt, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { refreshTokens } from '../schema.js';

export interface RefreshTokenRow {
  id: number;
  token: string;
  user_id: number;
  expires_at: string;
  revoked: number;
  revoked_at: string | null;
}

export const refreshTokenRepository = {
  create(token: string, userId: number, expiresAt: string): void {
    db.insert(refreshTokens).values({ token, user_id: userId, expires_at: expiresAt }).run();
  },

  findByToken(token: string): RefreshTokenRow | undefined {
    return db.select().from(refreshTokens).where(eq(refreshTokens.token, token)).get() as
      RefreshTokenRow | undefined;
  },

  revoke(token: string): void {
    // revoked_at をセットするのは正常ローテーション時のみ。直後の並行リフレッシュを
    // グレース判定で救済するために使う（authService.refresh 参照）。
    db.update(refreshTokens)
      .set({ revoked: 1, revoked_at: new Date().toISOString() })
      .where(eq(refreshTokens.token, token))
      .run();
  },

  revokeAllForUser(userId: number): void {
    // 全無効化（パスワード変更・盗用検知）はグレース対象にしないため revoked_at は付けない。
    db.update(refreshTokens).set({ revoked: 1 }).where(eq(refreshTokens.user_id, userId)).run();
  },

  deleteByToken(token: string): void {
    db.delete(refreshTokens).where(eq(refreshTokens.token, token)).run();
  },

  cleanupExpired(): number {
    const result = db
      .delete(refreshTokens)
      .where(or(eq(refreshTokens.revoked, 1), lt(refreshTokens.expires_at, sql`datetime('now')`)))
      .run();
    return result.changes;
  },
};
