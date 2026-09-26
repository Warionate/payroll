/**
 * User Repository - users table CRUD operations (Drizzle ORM)
 */
import { eq, ne, asc, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
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

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'user' | 'admin';
  calendar_token: string | null;
  calendar_token_created_at: string | null;
  created_at: string;
  oidc_sub: string | null;
  email: string | null;
}

export interface UserPublic {
  id: number;
  username: string;
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

  create(username: string, passwordHash: string, calendarToken: string): number | bigint {
    const result = db
      .insert(users)
      .values({
        username,
        password_hash: passwordHash,
        calendar_token: calendarToken,
      })
      .run();
    return result.lastInsertRowid;
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
    return row?.calendar_token ?? null;
  },

  updateCalendarToken(id: number, token: string): void {
    db.update(users)
      .set({
        calendar_token: token,
        calendar_token_created_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, id))
      .run();
  },

  findByCalendarToken(token: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.calendar_token, token)).get() as
      UserRow | undefined;
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
