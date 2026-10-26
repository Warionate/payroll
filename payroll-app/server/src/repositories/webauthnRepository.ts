/**
 * WebAuthn Repository - webauthn_credentials / webauthn_challenges tables (Drizzle ORM)
 */
import { and, eq, lt } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { webauthnChallenges, webauthnCredentials } from '../schema.js';

export interface WebauthnCredentialRow {
  id: string;
  user_id: number;
  public_key: string;
  counter: number;
  transports: string | null;
  device_type: string | null;
  backed_up: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export type WebauthnPurpose = 'register' | 'login' | 'reauth';

export interface WebauthnChallengeRow {
  id: string;
  challenge: string;
  purpose: WebauthnPurpose;
  user_id: number | null;
  created_at: string;
}

// ブラウザでパスキーを操作するまでの猶予
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const webauthnRepository = {
  findCredential(id: string): WebauthnCredentialRow | undefined {
    return db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, id)).get() as
      WebauthnCredentialRow | undefined;
  },

  listByUser(userId: number): WebauthnCredentialRow[] {
    return db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.user_id, userId))
      .all() as WebauthnCredentialRow[];
  },

  createCredential(row: Omit<WebauthnCredentialRow, 'created_at' | 'last_used_at'>): void {
    db.insert(webauthnCredentials)
      .values({ ...row, created_at: new Date().toISOString() })
      .run();
  },

  markUsed(id: string, counter: number): void {
    db.update(webauthnCredentials)
      .set({ counter, last_used_at: new Date().toISOString() })
      .where(eq(webauthnCredentials.id, id))
      .run();
  },

  /** 本人のものだけ消す。消えたら true */
  deleteForUser(id: string, userId: number): boolean {
    const result = db
      .delete(webauthnCredentials)
      .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.user_id, userId)))
      .run();
    return result.changes > 0;
  },

  /** その人のパスキーを全部消す（管理者による二段階認証のリセット） */
  deleteAllForUser(userId: number): number {
    return db.delete(webauthnCredentials).where(eq(webauthnCredentials.user_id, userId)).run()
      .changes;
  },

  createChallenge(row: Omit<WebauthnChallengeRow, 'created_at'>): void {
    db.insert(webauthnChallenges)
      .values({ ...row, created_at: new Date().toISOString() })
      .run();
  },

  /** challenge を1回だけ取り出す（取り出したら消す）。期限切れは無いものとして扱う */
  takeChallenge(id: string): WebauthnChallengeRow | undefined {
    const cutoff = new Date(Date.now() - CHALLENGE_TTL_MS).toISOString();
    db.delete(webauthnChallenges).where(lt(webauthnChallenges.created_at, cutoff)).run();
    const row = db.select().from(webauthnChallenges).where(eq(webauthnChallenges.id, id)).get() as
      WebauthnChallengeRow | undefined;
    if (row) db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id)).run();
    return row;
  },
};
