/**
 * Schedule Service - patterns, slots, assignments, and fixed shift management
 */
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import {
  patternRepository,
  slotRepository,
  patternAssignmentRepository,
  fixedShiftRepository,
} from '../repositories/scheduleRepository.js';
import { workLogRepository } from '../repositories/workLogRepository.js';

// --- Patterns ---

interface PatternSlot {
  id: number;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface PatternGroup {
  id: number;
  name: string;
  is_default: number;
  is_archived: number;
  slots: PatternSlot[];
}

export const patternService = {
  getAll(): PatternGroup[] {
    const rows = patternRepository.findAllWithSlots();
    const patterns: Record<number, PatternGroup> = {};

    rows.forEach((row) => {
      if (!patterns[row.pattern_id]) {
        patterns[row.pattern_id] = {
          id: row.pattern_id,
          name: row.pattern_name,
          is_default: row.is_default,
          is_archived: row.is_archived ?? 0,
          slots: [],
        };
      }
      if (row.slot_id) {
        patterns[row.pattern_id].slots.push({
          id: row.slot_id,
          period_name: row.period_name,
          start_time: row.start_time,
          end_time: row.end_time,
        });
      }
    });

    return Object.values(patterns);
  },

  create(name: string, username: string): number | bigint {
    const id = patternRepository.create(name);
    cache.invalidatePrefix('patterns:');
    logger.info(`Pattern created: ${name} by ${username}`);
    return id;
  },

  updateName(id: string | number, name: string, username: string): number {
    const changes = patternRepository.updateName(id, name);
    cache.invalidatePrefix('patterns:');
    logger.info(`Pattern ${id} renamed to '${name}' by ${username}`);
    return changes;
  },

  setArchived(id: string | number, archived: boolean, username: string): number {
    const changes = patternRepository.setArchived(id, archived);
    cache.invalidatePrefix('patterns:');
    logger.info(`Pattern ${id} ${archived ? 'archived' : 'unarchived'} by ${username}`);
    return changes;
  },

  delete(id: string | number, username: string): number {
    const changes = patternRepository.deleteWithCascade(id);
    cache.invalidatePrefix('patterns:');
    logger.info(`Pattern deleted: ${id} by ${username}`);
    return changes;
  },
};

// --- Slots ---

export const slotService = {
  create(
    patternId: number,
    periodName: string,
    startTime: string,
    endTime: string,
  ): number | bigint {
    return slotRepository.create(patternId, periodName, startTime, endTime);
  },

  update(
    id: string | number,
    periodName: string,
    startTime: string,
    endTime: string,
    username: string,
  ): number {
    const changes = slotRepository.update(id, periodName, startTime, endTime);
    cache.invalidatePrefix('patterns:');
    logger.info(`Slot ${id} updated by ${username}`);
    return changes;
  },

  bulkCreate(
    patternId: number,
    slots: { period_name: string; start_time: string; end_time: string }[],
    username: string,
  ): (number | bigint)[] {
    const ids = slotRepository.bulkCreate(patternId, slots);
    cache.invalidatePrefix('patterns:');
    logger.info(`Bulk created ${ids.length} slots for pattern ${patternId} by ${username}`);
    return ids;
  },

  delete(id: string | number): number {
    const changes = slotRepository.deleteWithCascade(id);
    cache.invalidatePrefix('patterns:');
    return changes;
  },
};

// --- Pattern Assignments ---

export const patternAssignmentService = {
  getAll(userId: number, role: string, filterUserId?: string) {
    return patternAssignmentRepository.findAll(userId, role, filterUserId);
  },

  create(
    userId: number,
    role: string,
    data: { start_date: string; end_date: string; pattern_id: number; user_id?: number },
  ): { id: number | bigint; deletedCount: number } {
    let targetUserId: number | null = userId;
    if (role === 'admin') {
      targetUserId = data.user_id || null;
    }

    const result = patternAssignmentRepository.createWithCleanup(
      targetUserId,
      data.start_date,
      data.end_date,
      data.pattern_id,
    );

    if (result.deletedCount > 0) {
      logger.info(
        `Pattern assignment created: pattern=${data.pattern_id}, dates=${data.start_date}~${data.end_date}, user=${targetUserId ?? 'global'}. Deleted ${result.deletedCount} conflicting planned work_logs.`,
      );
    }

    return result;
  },

  delete(id: string | number, userId: number, role: string): number {
    return patternAssignmentRepository.delete(id, userId, role);
  },
};

// --- Fixed Shifts ---

export interface DecryptedFixedShift {
  id: number;
  user_id: number;
  day_of_week: number;
  schedule_slot_id: number;
  student_count: string | null | undefined;
}

export const fixedShiftService = {
  getByUserId(userId: number): DecryptedFixedShift[] {
    const rows = fixedShiftRepository.findByUserId(userId);
    return rows.map((row) => ({
      ...row,
      student_count: decrypt(row.student_count),
    }));
  },

  create(
    userId: number,
    dayOfWeek: number,
    scheduleSlotId: number,
    studentCount: number,
  ): number | bigint {
    return fixedShiftRepository.create(userId, dayOfWeek, scheduleSlotId, encrypt(studentCount));
  },

  delete(id: string | number, userId: number): number {
    return fixedShiftRepository.delete(id, userId);
  },

  bulkReplace(
    userId: number,
    shifts: { day_of_week: number; schedule_slot_id: number; student_count: number }[],
  ): void {
    const encryptedShifts = shifts.map((s) => ({
      day_of_week: s.day_of_week,
      schedule_slot_id: s.schedule_slot_id,
      student_count: encrypt(String(s.student_count)),
    }));
    fixedShiftRepository.bulkReplace(userId, encryptedShifts);
  },

  /**
   * Apply fixed shifts for a month
   */
  applyForMonth(userId: number, year: number, month: number): number {
    const shifts = fixedShiftRepository.findDefaultForUser(userId);
    if (!shifts.length) return 0;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const assignments = patternAssignmentRepository.findNonDefaultOverlapping(
      userId,
      startStr,
      endStr,
    );
    const existingLogs = workLogRepository.findExistingByDateRange(userId, startStr, endStr);

    const existingSet = new Set(existingLogs.map((l) => `${l.date}_${l.schedule_slot_id}`));

    const entries: { date: string; scheduleSlotId: number; studentCount: string }[] = [];

    for (
      let d = new Date(startDate);
      d.getTime() <= endDate.getTime();
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const isBlocked = assignments.some((a) => dateStr >= a.start_date && dateStr <= a.end_date);
      if (isBlocked) continue;

      const dayOfWeek = d.getDay();
      const dayShifts = shifts.filter((s) => s.day_of_week === dayOfWeek);

      for (const shift of dayShifts) {
        if (!existingSet.has(`${dateStr}_${shift.schedule_slot_id}`)) {
          entries.push({
            date: dateStr,
            scheduleSlotId: shift.schedule_slot_id,
            studentCount: shift.student_count,
          });
        }
      }
    }

    if (entries.length === 0) return 0;

    const count = workLogRepository.bulkInsertPlanned(userId, entries);
    cache.invalidatePrefix(`work_logs:${userId}`);
    return count;
  },
};
