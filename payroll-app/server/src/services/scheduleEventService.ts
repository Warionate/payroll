/**
 * Schedule Event Service - 塾内予定 CRUD
 */
import {
  scheduleEventRepository,
  type ScheduleEventInput,
  type ScheduleEventRow,
} from '../repositories/scheduleEventRepository.js';

function normalize(input: {
  title: string;
  description?: string | null;
  event_type?: 'schedule' | 'cancel' | 'other';
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
}): ScheduleEventInput {
  return {
    title: input.title,
    description: input.description ?? null,
    event_type: input.event_type ?? 'other',
    start_date: input.start_date,
    end_date: input.end_date,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
  };
}

export const scheduleEventService = {
  getAll(startDate?: string, endDate?: string): ScheduleEventRow[] {
    return scheduleEventRepository.findInRange(startDate, endDate);
  },

  create(createdBy: number, input: Parameters<typeof normalize>[0]): ScheduleEventRow | undefined {
    const id = scheduleEventRepository.create(createdBy, normalize(input));
    return scheduleEventRepository.findById(Number(id));
  },

  update(id: number, input: Parameters<typeof normalize>[0]): ScheduleEventRow | undefined {
    const changes = scheduleEventRepository.update(id, normalize(input));
    if (changes === 0) return undefined;
    return scheduleEventRepository.findById(id);
  },

  delete(id: number): number {
    return scheduleEventRepository.delete(id);
  },
};
