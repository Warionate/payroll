/**
 * Salary Adjustment Repository - salary_adjustments table (Drizzle ORM)
 */
import { eq, and, desc, like } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { salaryAdjustments } from '../schema.js';

export interface SalaryAdjustmentRow {
  id: number;
  user_id: number;
  year_month: string;
  adjustment_type: 'incentive' | 'correction' | 'other';
  amount: number;
  note: string | null;
  created_at: string;
}

export const salaryAdjustmentRepository = {
  findByUserId(userId: number, year?: string): SalaryAdjustmentRow[] {
    const conditions = [eq(salaryAdjustments.user_id, userId)];
    if (year) {
      conditions.push(like(salaryAdjustments.year_month, `${year}-%`));
    }
    return db
      .select()
      .from(salaryAdjustments)
      .where(and(...conditions))
      .orderBy(desc(salaryAdjustments.year_month), desc(salaryAdjustments.created_at))
      .all() as SalaryAdjustmentRow[];
  },

  create(
    userId: number,
    yearMonth: string,
    adjustmentType: string,
    amount: number,
    note: string | null,
  ): number | bigint {
    const result = db
      .insert(salaryAdjustments)
      .values({
        user_id: userId,
        year_month: yearMonth,
        adjustment_type: adjustmentType,
        amount,
        note,
      })
      .run();
    return result.lastInsertRowid;
  },

  update(
    id: string | number,
    userId: number,
    yearMonth: string,
    adjustmentType: string,
    amount: number,
    note: string | null,
  ): number {
    const result = db
      .update(salaryAdjustments)
      .set({
        year_month: yearMonth,
        adjustment_type: adjustmentType,
        amount,
        note,
      })
      .where(and(eq(salaryAdjustments.id, Number(id)), eq(salaryAdjustments.user_id, userId)))
      .run();
    return result.changes;
  },

  delete(id: string | number, userId: number): number {
    const result = db
      .delete(salaryAdjustments)
      .where(and(eq(salaryAdjustments.id, Number(id)), eq(salaryAdjustments.user_id, userId)))
      .run();
    return result.changes;
  },

  /**
   * Find adjustments for a user in a specific year-month
   */
  findByUserAndMonth(userId: number, yearMonth: string): SalaryAdjustmentRow[] {
    return db
      .select()
      .from(salaryAdjustments)
      .where(
        and(eq(salaryAdjustments.user_id, userId), eq(salaryAdjustments.year_month, yearMonth)),
      )
      .orderBy(salaryAdjustments.created_at)
      .all() as SalaryAdjustmentRow[];
  },
};
