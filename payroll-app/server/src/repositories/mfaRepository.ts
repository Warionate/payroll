/**
 * MFA Repository - users の TOTP 列と recovery_codes table (Drizzle ORM)
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { recoveryCodes, users, webauthnCredentials } from '../schema.js';

export const mfaRepository = {
  /** 登録の途中の secret を置く（確認するまで有効にしない） */
  setPendingTotp(userId: number, encryptedSecret: string): void {
    db.update(users)
      .set({ totp_secret: encryptedSecret, totp_enabled_at: null, totp_last_step: null })
      .where(eq(users.id, userId))
      .run();
  },

  enableTotp(userId: number, step: number): void {
    db.update(users)
      .set({ totp_enabled_at: new Date().toISOString(), totp_last_step: step })
      .where(eq(users.id, userId))
      .run();
  },

  /** 通したコードの時間枠を進める。他のリクエストが先に進めていたら false（同じコードの二重使用） */
  advanceTotpStep(userId: number, step: number): boolean {
    const result = db
      .update(users)
      .set({ totp_last_step: step })
      .where(
        and(
          eq(users.id, userId),
          sql`(${users.totp_last_step} IS NULL OR ${users.totp_last_step} < ${step})`,
        ),
      )
      .run();
    return result.changes > 0;
  },

  disableTotp(userId: number): void {
    db.transaction((tx) => {
      tx.update(users)
        .set({ totp_secret: null, totp_enabled_at: null, totp_last_step: null })
        .where(eq(users.id, userId))
        .run();
      tx.delete(recoveryCodes).where(eq(recoveryCodes.user_id, userId)).run();
    });
  },

  countPasskeys(userId: number): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.user_id, userId))
      .get();
    return row?.n ?? 0;
  },

  replaceRecoveryCodes(userId: number, hashes: string[]): void {
    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.delete(recoveryCodes).where(eq(recoveryCodes.user_id, userId)).run();
      for (const code_hash of hashes) {
        tx.insert(recoveryCodes).values({ user_id: userId, code_hash, created_at: now }).run();
      }
    });
  },

  /** 未使用のコードなら使用済みにして true */
  useRecoveryCode(userId: number, hash: string): boolean {
    const result = db
      .update(recoveryCodes)
      .set({ used_at: new Date().toISOString() })
      .where(
        and(
          eq(recoveryCodes.user_id, userId),
          eq(recoveryCodes.code_hash, hash),
          isNull(recoveryCodes.used_at),
        ),
      )
      .run();
    return result.changes > 0;
  },

  countUnusedRecoveryCodes(userId: number): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.user_id, userId), isNull(recoveryCodes.used_at)))
      .get();
    return row?.n ?? 0;
  },
};
