/**
 * User Repository - users table CRUD operations (Drizzle ORM)
 */
import { and, eq, isNull, ne, asc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { drizzleDb as db } from '../db.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import {
  users,
  rates as ratesTable,
  fixedShifts,
  workLogs,
  patternAssignments,
  chatMessages,
  chatRoomMembers,
  chatRooms,
  broadcastReads,
  broadcasts,
  pushSubscriptions,
  salaryAdjustments,
} from '../schema.js';

/** カレンダー連携の URL のトークンのハッシュ（DB にはこれで照合する） */
function hashCalendarToken(token: string): string {
  return crypto.createHash('sha256').update(`calendar:${token}`).digest('hex');
}

/** 保存されているトークンを読む。暗号化前（平文の 64 桁の 16 進）のものはそのまま返す */
function readCalendarToken(stored: string): string {
  return /^[0-9a-f]{64}$/.test(stored) ? stored : (decrypt(stored) as string);
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'user' | 'admin';
  calendar_token: string | null;
  calendar_token_created_at: string | null;
  calendar_token_hash: string | null;
  created_at: string;
  oidc_sub: string | null;
  oidc_mfa_at: string | null;
  email: string | null;
  totp_secret: string | null;
  totp_enabled_at: string | null;
  totp_last_step: number | null;
  display_name: string | null;
  setup_deadline: string | null;
}

export interface UserPublic {
  id: number;
  username: string;
  display_name: string | null;
  setup_deadline: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

export const userRepository = {
  findById(id: number): UserRow | undefined {
    return db.select().from(users).where(eq(users.id, id)).get() as UserRow | undefined;
  },

  findByUsername(username: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.username, username)).get() as UserRow | undefined;
  },

  /** 確認済みのメールアドレスで探す（小文字で比較） */
  findByEmail(email: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get() as
      UserRow | undefined;
  },

  /** そのメールアドレスと同じ文字列のユーザー名があるか（大文字小文字を区別しない） */
  usernameTakenAsEmail(email: string): boolean {
    return (
      db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = ${email.trim().toLowerCase()}`)
        .get() !== undefined
    );
  },

  setEmail(id: number, email: string | null): void {
    db.update(users).set({ email }).where(eq(users.id, id)).run();
  },

  findByOidcSub(sub: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.oidc_sub, sub)).get() as UserRow | undefined;
  },

  /** Authentik との連携を設定・解除する（null で解除） */
  setOidcSub(id: number, sub: string | null): void {
    db.update(users).set({ oidc_sub: sub }).where(eq(users.id, id)).run();
  },

  findAll(): UserPublic[] {
    return db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.display_name,
        setup_deadline: users.setup_deadline,
        role: users.role,
        created_at: users.created_at,
      })
      .from(users)
      .all() as UserPublic[];
  },

  findAllExcept(userId: number): { id: number; username: string; role: string }[] {
    return db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
      })
      .from(users)
      .where(ne(users.id, userId))
      .orderBy(asc(users.username))
      .all() as { id: number; username: string; role: string }[];
  },

  create(
    username: string,
    passwordHash: string,
    calendarToken: string,
    displayName: string,
  ): number | bigint {
    const result = db
      .insert(users)
      .values({
        username,
        display_name: displayName,
        password_hash: passwordHash,
        calendar_token: encrypt(calendarToken) as string,
        calendar_token_hash: hashCalendarToken(calendarToken),
      })
      .run();
    return result.lastInsertRowid;
  },

  setSetupDeadline(id: number, deadline: string | null): void {
    db.update(users).set({ setup_deadline: deadline }).where(eq(users.id, id)).run();
  },

  /** 最初の設定の期限を過ぎた利用者 */
  findPastSetupDeadline(nowIso: string): UserRow[] {
    return db
      .select()
      .from(users)
      .where(sql`${users.setup_deadline} IS NOT NULL AND ${users.setup_deadline} < ${nowIso}`)
      .all() as UserRow[];
  },

  /** Authentik で二段階を済ませてログインした時刻（済ませていなければ null に戻す） */
  setOidcMfaAt(id: number, at: string | null): void {
    db.update(users).set({ oidc_mfa_at: at }).where(eq(users.id, id)).run();
  },

  updateDisplayName(id: number | string, displayName: string): number {
    return db
      .update(users)
      .set({ display_name: displayName })
      .where(eq(users.id, Number(id)))
      .run().changes;
  },

  updateUsername(id: number | string, username: string): number {
    const result = db
      .update(users)
      .set({ username })
      .where(eq(users.id, Number(id)))
      .run();
    return result.changes;
  },

  updatePassword(id: number | string, passwordHash: string): number {
    const result = db
      .update(users)
      .set({ password_hash: passwordHash })
      .where(eq(users.id, Number(id)))
      .run();
    return result.changes;
  },

  updateRole(id: number | string, role: string): number {
    const result = db
      .update(users)
      .set({ role })
      .where(eq(users.id, Number(id)))
      .run();
    return result.changes;
  },

  getCalendarToken(id: number): string | null {
    const row = db
      .select({ calendar_token: users.calendar_token })
      .from(users)
      .where(eq(users.id, id))
      .get();
    return row?.calendar_token ? readCalendarToken(row.calendar_token) : null;
  },

  updateCalendarToken(id: number, token: string): void {
    db.update(users)
      .set({
        calendar_token: encrypt(token) as string,
        calendar_token_hash: hashCalendarToken(token),
        calendar_token_created_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, id))
      .run();
  },

  /** カレンダー連携の URL のトークンで探す（ハッシュで照合する） */
  findByCalendarToken(token: string): UserRow | undefined {
    return (db
      .select()
      .from(users)
      .where(eq(users.calendar_token_hash, hashCalendarToken(token)))
      .get() ??
      // 起動時の移し替え（migrateLegacyCalendarTokens）が済む前の、平文のままの古い行
      db
        .select()
        .from(users)
        .where(and(eq(users.calendar_token, token), isNull(users.calendar_token_hash)))
        .get()) as UserRow | undefined;
  },

  /**
   * 平文のまま保存されている古いトークンを、暗号化 + ハッシュに移す（起動時に 1 回）。
   * 移した数を返す
   */
  migrateLegacyCalendarTokens(): number {
    const rows = db
      .select({ id: users.id, token: users.calendar_token })
      .from(users)
      .where(sql`${users.calendar_token} IS NOT NULL AND ${users.calendar_token_hash} IS NULL`)
      .all();
    for (const row of rows) {
      const plain = readCalendarToken(row.token!);
      db.update(users)
        .set({
          calendar_token: encrypt(plain) as string,
          calendar_token_hash: hashCalendarToken(plain),
        })
        .where(eq(users.id, row.id))
        .run();
    }
    return rows.length;
  },

  getRole(id: number): string | undefined {
    const row = db.select({ role: users.role }).from(users).where(eq(users.id, id)).get();
    return row?.role ?? undefined;
  },

  deleteWithCascade(userId: number): void {
    db.transaction((tx) => {
      tx.delete(ratesTable).where(eq(ratesTable.user_id, userId)).run();
      tx.delete(fixedShifts).where(eq(fixedShifts.user_id, userId)).run();
      tx.delete(workLogs).where(eq(workLogs.user_id, userId)).run();
      tx.delete(patternAssignments).where(eq(patternAssignments.user_id, userId)).run();
      tx.delete(chatMessages).where(eq(chatMessages.sender_id, userId)).run();
      tx.delete(chatRoomMembers).where(eq(chatRoomMembers.user_id, userId)).run();
      tx.update(chatRooms)
        .set({ created_by: sql`NULL` })
        .where(eq(chatRooms.created_by, userId))
        .run();
      tx.delete(broadcastReads).where(eq(broadcastReads.user_id, userId)).run();
      tx.update(broadcasts)
        .set({ sender_id: sql`NULL` })
        .where(eq(broadcasts.sender_id, userId))
        .run();
      tx.delete(pushSubscriptions).where(eq(pushSubscriptions.user_id, userId)).run();
      tx.delete(salaryAdjustments).where(eq(salaryAdjustments.user_id, userId)).run();
      tx.delete(users).where(eq(users.id, userId)).run();
    });
  },
};
