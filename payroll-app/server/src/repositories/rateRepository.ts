/**
 * Rate Repository - rates table CRUD operations (Drizzle ORM)
 * Note: encryption/decryption is handled at the service layer
 */
import { eq, and, lte, desc } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { rates } from '../schema.js';

export interface RateRow {
  id: number;
  user_id: number;
  start_date: string;
  wage_1_student: string;
  wage_2_students: string;
  wage_3_students: string;
  wage_4_students: string;
  hourly_wage: string;
  allowance_day: string;
  allowance_gap: string;
  is_active: number;
}

export const rateRepository = {
  findByUserId(userId: number): RateRow[] {
    return db
      .select()
      .from(rates)
      .where(eq(rates.user_id, userId))
      .orderBy(desc(rates.start_date))
      .all() as RateRow[];
  },

  create(
    userId: number | bigint,
    startDate: string,
    wage1: string | null | undefined,
    wage2: string | null | undefined,
    wage3: string | null | undefined,
    wage4: string | null | undefined,
    hourlyWage: string | null | undefined,
    allowanceDay: string | null | undefined,
    allowanceGap: string | null | undefined,
  ): number | bigint {
    const result = db
      .insert(rates)
      .values({
        user_id: Number(userId),
        start_date: startDate,
        wage_1_student: wage1 ?? null,
        wage_2_students: wage2 ?? null,
        wage_3_students: wage3 ?? null,
        wage_4_students: wage4 ?? null,
        hourly_wage: hourlyWage ?? null,
        allowance_day: allowanceDay ?? null,
        allowance_gap: allowanceGap ?? null,
      })
      .run();
    return result.lastInsertRowid;
  },

  update(
    id: string | number,
    userId: number,
    startDate: string,
    wage1: string | null | undefined,
    wage2: string | null | undefined,
    wage3: string | null | undefined,
    wage4: string | null | undefined,
    hourlyWage: string | null | undefined,
    allowanceDay: string | null | undefined,
    allowanceGap: string | null | undefined,
  ): number {
    const result = db
      .update(rates)
      .set({
        start_date: startDate,
        wage_1_student: wage1 ?? null,
        wage_2_students: wage2 ?? null,
        wage_3_students: wage3 ?? null,
        wage_4_students: wage4 ?? null,
        hourly_wage: hourlyWage ?? null,
        allowance_day: allowanceDay ?? null,
        allowance_gap: allowanceGap ?? null,
      })
      .where(and(eq(rates.id, Number(id)), eq(rates.user_id, userId)))
      .run();
    return result.changes;
  },

  delete(id: string | number, userId: number): number {
    const result = db
      .delete(rates)
      .where(and(eq(rates.id, Number(id)), eq(rates.user_id, userId)))
      .run();
    return result.changes;
  },

  /**
   * Find the applicable rate for a user on a given date
   * Returns the rate with the latest start_date that is <= the given date
   */
  findApplicable(userId: number, date: string): RateRow | undefined {
    return db
      .select()
      .from(rates)
      .where(and(eq(rates.user_id, userId), lte(rates.start_date, date)))
      .orderBy(desc(rates.start_date))
      .limit(1)
      .get() as RateRow | undefined;
  },
};
