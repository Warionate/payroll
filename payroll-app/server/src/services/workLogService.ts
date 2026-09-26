/**
 * Work Log Service - work log management with encryption
 */
import logger from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { workLogRepository, type WorkLogRow } from '../repositories/workLogRepository.js';

export interface DecryptedWorkLog {
  id: number;
  user_id: number;
  date: string;
  work_type: string;
  schedule_slot_id: number | null;
  student_count: string | null | undefined;
  duration_minutes: string | null | undefined;
  note: string | null | undefined;
  calculated_amount: string | null | undefined;
  status: string;
  period_name?: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

function decryptWorkLog(row: WorkLogRow): DecryptedWorkLog {
  return {
    ...row,
    student_count: decrypt(row.student_count),
    duration_minutes: decrypt(row.duration_minutes),
    note: decrypt(row.note),
    calculated_amount: decrypt(row.calculated_amount),
  };
}

export const workLogService = {
  getByUserAndDateRange(userId: number, startDate?: string, endDate?: string): DecryptedWorkLog[] {
    const rows = workLogRepository.findByUserAndDateRange(userId, startDate, endDate);
    return rows.map(decryptWorkLog);
  },

  create(
    userId: number,
    data: {
      date: string;
      work_type: string;
      schedule_slot_id: number | null;
      student_count?: string | number;
      duration_minutes?: string | number;
      note?: string;
      status?: string;
    },
  ): number | bigint {
    return workLogRepository.create(
      userId,
      data.date,
      data.work_type,
      data.schedule_slot_id,
      encrypt(data.student_count),
      encrypt(data.duration_minutes),
      encrypt(data.note),
      data.status || 'planned',
    );
  },

  update(
    id: string | number,
    userId: number,
    data: {
      date: string;
      work_type: string;
      schedule_slot_id: number | null;
      student_count?: string | number;
      duration_minutes?: string | number;
      note?: string;
      status?: string;
    },
  ): number {
    return workLogRepository.update(
      id,
      userId,
      data.date,
      data.work_type,
      data.schedule_slot_id,
      encrypt(data.student_count),
      encrypt(data.duration_minutes),
      encrypt(data.note),
      data.status || 'planned',
    );
  },

  delete(id: string | number, userId: number): number {
    logger.info('WorkLog delete request', { userId, logId: id });
    const changes = workLogRepository.delete(id, userId);
    logger.info('WorkLog deleted', { userId, logId: id, changes });
    return changes;
  },

  updateStatus(id: string | number, userId: number, status: string): number {
    return workLogRepository.updateStatus(id, userId, status);
  },

  completeAllInRange(userId: number, startDate: string, endDate: string): number {
    const changes = workLogRepository.completeAllInRange(userId, startDate, endDate);
    logger.info('WorkLog bulk complete', { userId, startDate, endDate, changes });
    return changes;
  },

  bulkSave(
    userId: number,
    date: string,
    classes: {
      schedule_slot_id: number;
      student_count: string | number;
      note?: string | null;
      status?: string;
    }[],
    managedSlotIds?: number[],
  ): void {
    const encryptedClasses = classes.map((cls) => ({
      schedule_slot_id: cls.schedule_slot_id,
      student_count: encrypt(cls.student_count),
      note: encrypt(cls.note),
      status: cls.status,
    }));

    workLogRepository.bulkSave(userId, date, managedSlotIds, encryptedClasses);
  },
};
