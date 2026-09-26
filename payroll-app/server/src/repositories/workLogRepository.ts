/**
 * Work Log Repository - work_logs table CRUD operations (Drizzle ORM)
 */
import { eq, and, between, inArray, isNotNull, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { workLogs, scheduleSlots } from '../schema.js';

export interface WorkLogRow {
  id: number;
  user_id: number;
  date: string;
  work_type: string;
  schedule_slot_id: number | null;
  student_count: string;
  duration_minutes: string;
  note: string;
  calculated_amount: string;
  status: string;
  period_name?: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

export const workLogRepository = {
  findByUserAndDateRange(userId: number, startDate?: string, endDate?: string): WorkLogRow[] {
    const conditions = [eq(workLogs.user_id, userId)];
    if (startDate && endDate) {
      conditions.push(between(workLogs.date, startDate, endDate));
    }

    return db
      .select({
        id: workLogs.id,
        user_id: workLogs.user_id,
        date: workLogs.date,
        work_type: workLogs.work_type,
        schedule_slot_id: workLogs.schedule_slot_id,
        student_count: workLogs.student_count,
        duration_minutes: workLogs.duration_minutes,
        note: workLogs.note,
        calculated_amount: workLogs.calculated_amount,
        status: workLogs.status,
        created_at: workLogs.created_at,
        period_name: scheduleSlots.period_name,
        start_time: scheduleSlots.start_time,
        end_time: scheduleSlots.end_time,
      })
      .from(workLogs)
      .leftJoin(scheduleSlots, eq(workLogs.schedule_slot_id, scheduleSlots.id))
      .where(and(...conditions))
      .orderBy(workLogs.date, scheduleSlots.start_time)
      .all() as WorkLogRow[];
  },

  create(
    userId: number,
    date: string,
    workType: string,
    scheduleSlotId: number | null,
    studentCount: string | null | undefined,
    durationMinutes: string | null | undefined,
    note: string | null | undefined,
    status: string,
  ): number | bigint {
    const result = db
      .insert(workLogs)
      .values({
        user_id: userId,
        date,
        work_type: workType,
        schedule_slot_id: scheduleSlotId,
        student_count: studentCount ?? null,
        duration_minutes: durationMinutes ?? null,
        note: note ?? null,
        status,
      })
      .run();
    return result.lastInsertRowid;
  },

  update(
    id: string | number,
    userId: number,
    date: string,
    workType: string,
    scheduleSlotId: number | null,
    studentCount: string | null | undefined,
    durationMinutes: string | null | undefined,
    note: string | null | undefined,
    status: string,
  ): number {
    const result = db
      .update(workLogs)
      .set({
        date,
        work_type: workType,
        schedule_slot_id: scheduleSlotId,
        student_count: studentCount ?? null,
        duration_minutes: durationMinutes ?? null,
        note: note ?? null,
        status,
      })
      .where(and(eq(workLogs.id, Number(id)), eq(workLogs.user_id, userId)))
      .run();
    return result.changes;
  },

  delete(id: string | number, userId: number): number {
    const result = db
      .delete(workLogs)
      .where(and(eq(workLogs.id, Number(id)), eq(workLogs.user_id, userId)))
      .run();
    return result.changes;
  },

  updateStatus(id: string | number, userId: number, status: string): number {
    const result = db
      .update(workLogs)
      .set({ status })
      .where(and(eq(workLogs.id, Number(id)), eq(workLogs.user_id, userId)))
      .run();
    return result.changes;
  },

  /** 期間内の未完了ログ（status != 'completed'）を一括で完了にする */
  completeAllInRange(userId: number, startDate: string, endDate: string): number {
    const result = db
      .update(workLogs)
      .set({ status: 'completed' })
      .where(
        and(
          eq(workLogs.user_id, userId),
          between(workLogs.date, startDate, endDate),
          sql`${workLogs.status} != 'completed'`,
        ),
      )
      .run();
    return result.changes;
  },

  bulkSave(
    userId: number,
    date: string,
    managedSlotIds: number[] | undefined,
    classes: {
      schedule_slot_id: number;
      student_count: string | null | undefined;
      note?: string | null;
      status?: string;
    }[],
  ): void {
    db.transaction((tx) => {
      if (managedSlotIds && managedSlotIds.length > 0) {
        tx.delete(workLogs)
          .where(
            and(
              eq(workLogs.user_id, userId),
              eq(workLogs.date, date),
              inArray(workLogs.schedule_slot_id, managedSlotIds),
            ),
          )
          .run();
      }

      for (const cls of classes) {
        tx.insert(workLogs)
          .values({
            user_id: userId,
            date,
            work_type: 'class',
            schedule_slot_id: cls.schedule_slot_id,
            student_count: cls.student_count ?? null,
            note: cls.note ?? null,
            status: cls.status || 'planned',
          })
          .run();
      }
    });
  },

  /**
   * Find work logs with slot info for calendar feed
   */
  findWithSlotsForCalendar(userId: number, startDate?: string, endDate?: string): WorkLogRow[] {
    const conditions = [eq(workLogs.user_id, userId)];
    if (startDate && endDate) {
      conditions.push(between(workLogs.date, startDate, endDate));
    }

    return db
      .select({
        id: workLogs.id,
        user_id: workLogs.user_id,
        date: workLogs.date,
        work_type: workLogs.work_type,
        schedule_slot_id: workLogs.schedule_slot_id,
        student_count: workLogs.student_count,
        duration_minutes: workLogs.duration_minutes,
        note: workLogs.note,
        calculated_amount: workLogs.calculated_amount,
        status: workLogs.status,
        created_at: workLogs.created_at,
        period_name: scheduleSlots.period_name,
        start_time: scheduleSlots.start_time,
        end_time: scheduleSlots.end_time,
      })
      .from(workLogs)
      .leftJoin(scheduleSlots, eq(workLogs.schedule_slot_id, scheduleSlots.id))
      .where(and(...conditions))
      .orderBy(workLogs.date, scheduleSlots.start_time)
      .all() as WorkLogRow[];
  },

  /**
   * Find existing logs by user and date range for duplicate prevention
   */
  findExistingByDateRange(
    userId: number,
    startDate: string,
    endDate: string,
  ): { date: string; schedule_slot_id: number }[] {
    return db
      .select({
        date: workLogs.date,
        schedule_slot_id: workLogs.schedule_slot_id,
      })
      .from(workLogs)
      .where(and(eq(workLogs.user_id, userId), between(workLogs.date, startDate, endDate)))
      .all() as { date: string; schedule_slot_id: number }[];
  },

  /**
   * Delete planned class work logs with slot IDs not in the given set
   */
  deletePlannedNotInSlots(
    userId: number | null,
    startDate: string,
    endDate: string,
    slotIds: number[],
  ): number {
    const conditions = [
      between(workLogs.date, startDate, endDate),
      eq(workLogs.work_type, 'class'),
      eq(workLogs.status, 'planned'),
      isNotNull(workLogs.schedule_slot_id),
    ];
    if (userId !== null) {
      conditions.push(eq(workLogs.user_id, userId));
    }
    if (slotIds.length > 0) {
      conditions.push(
        sql`${workLogs.schedule_slot_id} NOT IN (${sql.join(
          slotIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    const result = db
      .delete(workLogs)
      .where(and(...conditions))
      .run();
    return result.changes;
  },

  /**
   * Bulk insert work logs for fixed shift application
   */
  bulkInsertPlanned(
    userId: number,
    entries: { date: string; scheduleSlotId: number; studentCount: string }[],
  ): number {
    return db.transaction((tx) => {
      let count = 0;
      for (const entry of entries) {
        tx.insert(workLogs)
          .values({
            user_id: userId,
            date: entry.date,
            work_type: 'class',
            schedule_slot_id: entry.scheduleSlotId,
            student_count: entry.studentCount,
            status: 'planned',
          })
          .run();
        count++;
      }
      return count;
    });
  },

  /**
   * Nullify schedule_slot_id for work logs referencing given slot IDs
   */
  nullifySlotIds(slotIds: number[]): void {
    if (slotIds.length === 0) return;
    db.update(workLogs)
      .set({ schedule_slot_id: null })
      .where(inArray(workLogs.schedule_slot_id, slotIds))
      .run();
  },

  /**
   * Find unconfirmed work logs for a specific date (for push notifications)
   */
  findUnconfirmedByDate(date: string): { user_id: number; count: number }[] {
    return db
      .select({
        user_id: workLogs.user_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(workLogs)
      .where(and(eq(workLogs.date, date), eq(workLogs.status, 'planned')))
      .groupBy(workLogs.user_id)
      .all() as { user_id: number; count: number }[];
  },
  /**
   * Find user IDs with unconfirmed (non-completed) work logs in a date range
   */
  findUnconfirmedUserIds(beforeDate: string, afterDate: string): number[] {
    const rows = db
      .select({ user_id: workLogs.user_id })
      .from(workLogs)
      .where(
        and(
          sql`${workLogs.date} < ${beforeDate}`,
          sql`${workLogs.date} >= ${afterDate}`,
          sql`${workLogs.status} != 'completed'`,
          isNotNull(workLogs.schedule_slot_id),
        ),
      )
      .groupBy(workLogs.user_id)
      .all();
    return rows.map((r) => r.user_id).filter((id): id is number => id !== null);
  },
};
