/**
 * Email Token Repository - email_tokens table (Drizzle ORM)
 */
import { and, eq, gt, lt } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { emailTokens } from '../schema.js';

export type EmailTokenPurpose = 'verify' | 'reset';

export interface EmailTokenRow {
  token_hash: string;
  user_id: number;
  purpose: EmailTokenPurpose;
  email: string;
  expires_at: string;
  created_at: string;
}

export const emailTokenRepository = {
  create(row: Omit<EmailTokenRow, 'created_at'>): void {
    db.insert(emailTokens)
      .values({ ...row, created_at: new Date().toISOString() })
      .run();
  },

  /** 1回だけ取り出す（取り出したら消す）。期限切れは無いものとして扱い、ついでに掃除する */
  take(tokenHash: string, purpose: EmailTokenPurpose): EmailTokenRow | undefined {
    const now = new Date().toISOString();
    db.delete(emailTokens).where(lt(emailTokens.expires_at, now)).run();
    const row = db
      .select()
      .from(emailTokens)
      .where(and(eq(emailTokens.token_hash, tokenHash), eq(emailTokens.purpose, purpose)))
      .get() as EmailTokenRow | undefined;
    if (row) db.delete(emailTokens).where(eq(emailTokens.token_hash, tokenHash)).run();
    return row;
  },

  /** 有効な確認待ち（最新）。設定画面に「確認待ち」を出すため */
  pendingVerify(userId: number): EmailTokenRow | undefined {
    return db
      .select()
      .from(emailTokens)
      .where(
        and(
          eq(emailTokens.user_id, userId),
          eq(emailTokens.purpose, 'verify'),
          gt(emailTokens.expires_at, new Date().toISOString()),
        ),
      )
      .get() as EmailTokenRow | undefined;
  },

  /** 直近 windowMs に作った数（メールの連打を防ぐ） */
  countRecent(userId: number, purpose: EmailTokenPurpose, windowMs: number): number {
    const since = new Date(Date.now() - windowMs).toISOString();
    return db
      .select()
      .from(emailTokens)
      .where(
        and(
          eq(emailTokens.user_id, userId),
          eq(emailTokens.purpose, purpose),
          gt(emailTokens.created_at, since),
        ),
      )
      .all().length;
  },

  deleteForUser(userId: number, purpose: EmailTokenPurpose): void {
    db.delete(emailTokens)
      .where(and(eq(emailTokens.user_id, userId), eq(emailTokens.purpose, purpose)))
      .run();
  },
};
