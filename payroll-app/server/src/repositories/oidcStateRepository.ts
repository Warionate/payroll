/**
 * OIDC State Repository - oidc_states table (Drizzle ORM)
 */
import { eq, lt } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { oidcStates } from '../schema.js';

export type OidcPurpose = 'login' | 'link' | 'reauth';

export interface OidcStateRow {
  state: string;
  code_verifier: string;
  nonce: string;
  purpose: OidcPurpose;
  user_id: number | null;
  session_id: string | null;
  created_at: string;
}

// Authentik へ送り出してから戻ってくるまでの猶予
const STATE_TTL_MS = 10 * 60 * 1000;

export const oidcStateRepository = {
  create(row: Omit<OidcStateRow, 'created_at'>): void {
    db.insert(oidcStates)
      .values({ ...row, created_at: new Date().toISOString() })
      .run();
  },

  /**
   * state を1回だけ取り出す（取り出したら消す）。期限切れは無いものとして扱う。
   * ついでに期限切れの行を掃除する。
   */
  take(state: string): OidcStateRow | undefined {
    const cutoff = new Date(Date.now() - STATE_TTL_MS).toISOString();
    db.delete(oidcStates).where(lt(oidcStates.created_at, cutoff)).run();
    const row = db.select().from(oidcStates).where(eq(oidcStates.state, state)).get() as
      OidcStateRow | undefined;
    if (row) db.delete(oidcStates).where(eq(oidcStates.state, state)).run();
    return row;
  },
};
