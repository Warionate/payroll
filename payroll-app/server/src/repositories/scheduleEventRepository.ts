/**
 * Schedule Event Repository - schedule_events table (Drizzle ORM)
 */
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { drizzleDb as db } from '../db.js';
import { scheduleEvents, users } from '../schema.js';

export type ScheduleEventType = 'schedule' | 'cancel' | 'other';

export interface ScheduleEventRow {
  id: number;
  title: string;
  description: string | null;
  event_type: ScheduleEventType;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  created_by: number | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ScheduleEventInput {
  title: string;
  description: string | null;
  event_type: ScheduleEventType;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
}

export const scheduleEventRepository = {
  findInRange(startDate?: string, endDate?: string): ScheduleEventRow[] {
    const conditions = [];
    // Events that overlap with [startDate, endDate]
    if (endDate) {
      conditions.push(lte(scheduleEvents.start_date, endDate));
    }
    if (startDate) {
      conditions.push(gte(scheduleEvents.end_date, startDate));
    }

    const query = db
      .select({
        id: scheduleEvents.id,
        title: scheduleEvents.title,
        description: scheduleEvents.description,
        event_type: scheduleEvents.event_type,
        start_date: scheduleEvents.start_date,
        end_date: scheduleEvents.end_date,
        start_time: scheduleEvents.start_time,
        end_time: scheduleEvents.end_time,
        created_by: scheduleEvents.created_by,
        creator_name: sql<string>`coalesce(${users.display_name}, ${users.username})`,
        created_at: scheduleEvents.created_at,
        updated_at: scheduleEvents.updated_at,
      })
      .from(scheduleEvents)
      .leftJoin(users, eq(scheduleEvents.created_by, users.id));

    const finalQuery = conditions.length > 0 ? query.where(and(...conditions)) : query;

    return finalQuery
      .orderBy(scheduleEvents.start_date, scheduleEvents.start_time)
      .all() as ScheduleEventRow[];
  },

  findById(id: number): ScheduleEventRow | undefined {
    return db
      .select({
        id: scheduleEvents.id,
        title: scheduleEvents.title,
        description: scheduleEvents.description,
        event_type: scheduleEvents.event_type,
        start_date: scheduleEvents.start_date,
        end_date: scheduleEvents.end_date,
        start_time: scheduleEvents.start_time,
        end_time: scheduleEvents.end_time,
        created_by: scheduleEvents.created_by,
        creator_name: sql<string>`coalesce(${users.display_name}, ${users.username})`,
        created_at: scheduleEvents.created_at,
        updated_at: scheduleEvents.updated_at,
      })
      .from(scheduleEvents)
      .leftJoin(users, eq(scheduleEvents.created_by, users.id))
      .where(eq(scheduleEvents.id, id))
      .get() as ScheduleEventRow | undefined;
  },

  create(createdBy: number, input: ScheduleEventInput): number | bigint {
    const result = db
      .insert(scheduleEvents)
      .values({
        title: input.title,
        description: input.description,
        event_type: input.event_type,
        start_date: input.start_date,
        end_date: input.end_date,
        start_time: input.start_time,
        end_time: input.end_time,
        created_by: createdBy,
      })
      .run();
    return result.lastInsertRowid;
  },

  update(id: number, input: ScheduleEventInput): number {
    const result = db
      .update(scheduleEvents)
      .set({
        title: input.title,
        description: input.description,
        event_type: input.event_type,
        start_date: input.start_date,
        end_date: input.end_date,
        start_time: input.start_time,
        end_time: input.end_time,
        updated_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(scheduleEvents.id, id))
      .run();
    return result.changes;
  },

  delete(id: number): number {
    const result = db.delete(scheduleEvents).where(eq(scheduleEvents.id, id)).run();
    return result.changes;
  },
};
