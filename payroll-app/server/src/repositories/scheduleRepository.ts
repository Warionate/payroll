/**
 * Schedule Repository - schedule_patterns, schedule_slots, pattern_assignments, fixed_shifts (Drizzle ORM)
 */
import { eq, and, sql, inArray, isNotNull, between, desc, type SQL } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import {
  schedulePatterns,
  scheduleSlots,
  fixedShifts,
  workLogs,
  patternAssignments,
  users,
} from '../schema.js';

// --- Types ---

export interface PatternRow {
  pattern_id: number;
  pattern_name: string;
  is_default: number;
  is_archived: number;
  slot_id: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface SlotRow {
  id: number;
  pattern_id: number;
  period_name: string;
  start_time: string;
  end_time: string;
}

export interface PatternAssignmentRow {
  id: number;
  user_id: number | null;
  start_date: string;
  end_date: string;
  pattern_id: number;
  pattern_name?: string;
  username?: string;
}

export interface FixedShiftRow {
  id: number;
  user_id: number;
  day_of_week: number;
  schedule_slot_id: number;
  student_count: string;
}

// --- Patterns ---

export const patternRepository = {
  findAllWithSlots(): PatternRow[] {
    return db
      .select({
        pattern_id: schedulePatterns.id,
        pattern_name: schedulePatterns.name,
        is_default: schedulePatterns.is_default,
        is_archived: schedulePatterns.is_archived,
        slot_id: scheduleSlots.id,
        period_name: scheduleSlots.period_name,
        start_time: scheduleSlots.start_time,
        end_time: scheduleSlots.end_time,
      })
      .from(schedulePatterns)
      .leftJoin(scheduleSlots, eq(schedulePatterns.id, scheduleSlots.pattern_id))
      .orderBy(schedulePatterns.id, scheduleSlots.start_time)
      .all() as PatternRow[];
  },

  create(name: string): number | bigint {
    const result = db
      .insert(schedulePatterns)
      .values({ name, is_default: 0, is_archived: 0 })
      .run();
    return result.lastInsertRowid;
  },

  updateName(id: string | number, name: string): number {
    const result = db
      .update(schedulePatterns)
      .set({ name })
      .where(eq(schedulePatterns.id, Number(id)))
      .run();
    return result.changes;
  },

  setArchived(id: string | number, archived: boolean): number {
    const result = db
      .update(schedulePatterns)
      .set({ is_archived: archived ? 1 : 0 })
      .where(eq(schedulePatterns.id, Number(id)))
      .run();
    return result.changes;
  },

  deleteWithCascade(patternId: string | number): number {
    return db.transaction((tx) => {
      const slots = tx
        .select({ id: scheduleSlots.id })
        .from(scheduleSlots)
        .where(eq(scheduleSlots.pattern_id, Number(patternId)))
        .all();
      const slotIds = slots.map((s) => s.id);

      if (slotIds.length > 0) {
        tx.delete(fixedShifts).where(inArray(fixedShifts.schedule_slot_id, slotIds)).run();
        tx.update(workLogs)
          .set({ schedule_slot_id: sql`NULL` })
          .where(inArray(workLogs.schedule_slot_id, slotIds))
          .run();
      }

      tx.delete(patternAssignments)
        .where(eq(patternAssignments.pattern_id, Number(patternId)))
        .run();
      tx.delete(scheduleSlots)
        .where(eq(scheduleSlots.pattern_id, Number(patternId)))
        .run();
      const result = tx
        .delete(schedulePatterns)
        .where(eq(schedulePatterns.id, Number(patternId)))
        .run();
      return result.changes;
    });
  },
};

// --- Slots ---

export const slotRepository = {
  create(
    patternId: number,
    periodName: string,
    startTime: string,
    endTime: string,
  ): number | bigint {
    const result = db
      .insert(scheduleSlots)
      .values({
        pattern_id: patternId,
        period_name: periodName,
        start_time: startTime,
        end_time: endTime,
      })
      .run();
    return result.lastInsertRowid;
  },

  update(id: string | number, periodName: string, startTime: string, endTime: string): number {
    const result = db
      .update(scheduleSlots)
      .set({
        period_name: periodName,
        start_time: startTime,
        end_time: endTime,
      })
      .where(eq(scheduleSlots.id, Number(id)))
      .run();
    return result.changes;
  },

  bulkCreate(
    patternId: number,
    slots: { period_name: string; start_time: string; end_time: string }[],
  ): (number | bigint)[] {
    return db.transaction((tx) => {
      const ids: (number | bigint)[] = [];
      for (const slot of slots) {
        const result = tx
          .insert(scheduleSlots)
          .values({
            pattern_id: patternId,
            period_name: slot.period_name,
            start_time: slot.start_time,
            end_time: slot.end_time,
          })
          .run();
        ids.push(result.lastInsertRowid);
      }
      return ids;
    });
  },

  deleteWithCascade(slotId: string | number): number {
    return db.transaction((tx) => {
      tx.delete(fixedShifts)
        .where(eq(fixedShifts.schedule_slot_id, Number(slotId)))
        .run();
      tx.update(workLogs)
        .set({ schedule_slot_id: sql`NULL` })
        .where(eq(workLogs.schedule_slot_id, Number(slotId)))
        .run();
      const result = tx
        .delete(scheduleSlots)
        .where(eq(scheduleSlots.id, Number(slotId)))
        .run();
      return result.changes;
    });
  },

  findByPatternId(patternId: number): { id: number }[] {
    return db
      .select({ id: scheduleSlots.id })
      .from(scheduleSlots)
      .where(eq(scheduleSlots.pattern_id, patternId))
      .all();
  },
};

// --- Pattern Assignments ---

export const patternAssignmentRepository = {
  findAll(userId: number, role: string, filterUserId?: string): PatternAssignmentRow[] {
    const conditions: SQL[] = [];

    if (role !== 'admin') {
      conditions.push(
        sql`(${patternAssignments.user_id} = ${userId} OR ${patternAssignments.user_id} IS NULL)`,
      );
    } else if (filterUserId) {
      conditions.push(eq(patternAssignments.user_id, Number(filterUserId)));
    }

    return db
      .select({
        id: patternAssignments.id,
        user_id: patternAssignments.user_id,
        start_date: patternAssignments.start_date,
        end_date: patternAssignments.end_date,
        pattern_id: patternAssignments.pattern_id,
        pattern_name: schedulePatterns.name,
        username: sql<string>`coalesce(${users.display_name}, ${users.username})`,
      })
      .from(patternAssignments)
      .innerJoin(schedulePatterns, eq(patternAssignments.pattern_id, schedulePatterns.id))
      .leftJoin(users, eq(patternAssignments.user_id, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`(${patternAssignments.user_id} IS NOT NULL) DESC`,
        desc(patternAssignments.start_date),
      )
      .all() as PatternAssignmentRow[];
  },

  createWithCleanup(
    targetUserId: number | null,
    startDate: string,
    endDate: string,
    patternId: number,
  ): { id: number | bigint; deletedCount: number } {
    return db.transaction((tx) => {
      const result = tx
        .insert(patternAssignments)
        .values({
          user_id: targetUserId,
          start_date: startDate,
          end_date: endDate,
          pattern_id: patternId,
        })
        .run();

      const newPatternSlots = tx
        .select({ id: scheduleSlots.id })
        .from(scheduleSlots)
        .where(eq(scheduleSlots.pattern_id, patternId))
        .all();
      const newSlotIds = newPatternSlots.map((s) => s.id);

      // Build conditions for work_logs cleanup
      const delConditions: SQL[] = [
        between(workLogs.date, startDate, endDate),
        eq(workLogs.work_type, 'class'),
        eq(workLogs.status, 'planned'),
        isNotNull(workLogs.schedule_slot_id),
      ];

      if (targetUserId !== null) {
        delConditions.push(eq(workLogs.user_id, targetUserId));
      }

      if (newSlotIds.length > 0) {
        delConditions.push(
          sql`${workLogs.schedule_slot_id} NOT IN (${sql.join(
            newSlotIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      }

      const deleteResult = tx
        .delete(workLogs)
        .where(and(...delConditions))
        .run();
      return { id: result.lastInsertRowid, deletedCount: deleteResult.changes };
    });
  },

  delete(id: string | number, userId: number, role: string): number {
    if (role === 'admin') {
      return db
        .delete(patternAssignments)
        .where(eq(patternAssignments.id, Number(id)))
        .run().changes;
    }
    return db
      .delete(patternAssignments)
      .where(and(eq(patternAssignments.id, Number(id)), eq(patternAssignments.user_id, userId)))
      .run().changes;
  },

  /**
   * Find non-default pattern assignments that overlap a date range for a user
   */
  findNonDefaultOverlapping(
    userId: number,
    startDate: string,
    endDate: string,
  ): { start_date: string; end_date: string }[] {
    return db
      .select({
        start_date: patternAssignments.start_date,
        end_date: patternAssignments.end_date,
      })
      .from(patternAssignments)
      .innerJoin(schedulePatterns, eq(patternAssignments.pattern_id, schedulePatterns.id))
      .where(
        and(
          eq(schedulePatterns.is_default, 0),
          sql`(${patternAssignments.user_id} = ${userId} OR ${patternAssignments.user_id} IS NULL)`,
          sql`${patternAssignments.end_date} >= ${startDate}`,
          sql`${patternAssignments.start_date} <= ${endDate}`,
        ),
      )
      .all() as { start_date: string; end_date: string }[];
  },
};

// --- Fixed Shifts ---

export const fixedShiftRepository = {
  findByUserId(userId: number): FixedShiftRow[] {
    return db
      .select()
      .from(fixedShifts)
      .where(eq(fixedShifts.user_id, userId))
      .orderBy(fixedShifts.day_of_week, fixedShifts.schedule_slot_id)
      .all() as FixedShiftRow[];
  },

  create(
    userId: number,
    dayOfWeek: number,
    scheduleSlotId: number,
    studentCount: string | null | undefined,
  ): number | bigint {
    const result = db
      .insert(fixedShifts)
      .values({
        user_id: userId,
        day_of_week: dayOfWeek,
        schedule_slot_id: scheduleSlotId,
        student_count: studentCount ?? null,
      })
      .run();
    return result.lastInsertRowid;
  },

  delete(id: string | number, userId: number): number {
    return db
      .delete(fixedShifts)
      .where(and(eq(fixedShifts.id, Number(id)), eq(fixedShifts.user_id, userId)))
      .run().changes;
  },

  bulkReplace(
    userId: number,
    shifts: {
      day_of_week: number;
      schedule_slot_id: number;
      student_count: string | null | undefined;
    }[],
  ): void {
    db.transaction((tx) => {
      tx.delete(fixedShifts).where(eq(fixedShifts.user_id, userId)).run();
      for (const s of shifts) {
        tx.insert(fixedShifts)
          .values({
            user_id: userId,
            day_of_week: s.day_of_week,
            schedule_slot_id: s.schedule_slot_id,
            student_count: s.student_count ?? null,
          })
          .run();
      }
    });
  },

  /**
   * Find fixed shifts for default pattern for a user
   */
  findDefaultForUser(userId: number): FixedShiftRow[] {
    return db
      .select({
        id: fixedShifts.id,
        user_id: fixedShifts.user_id,
        day_of_week: fixedShifts.day_of_week,
        schedule_slot_id: fixedShifts.schedule_slot_id,
        student_count: fixedShifts.student_count,
      })
      .from(fixedShifts)
      .innerJoin(scheduleSlots, eq(fixedShifts.schedule_slot_id, scheduleSlots.id))
      .innerJoin(schedulePatterns, eq(scheduleSlots.pattern_id, schedulePatterns.id))
      .where(and(eq(schedulePatterns.is_default, 1), eq(fixedShifts.user_id, userId)))
      .all() as FixedShiftRow[];
  },

  deleteBySlotIds(slotIds: number[]): void {
    if (slotIds.length === 0) return;
    db.delete(fixedShifts).where(inArray(fixedShifts.schedule_slot_id, slotIds)).run();
  },
};
