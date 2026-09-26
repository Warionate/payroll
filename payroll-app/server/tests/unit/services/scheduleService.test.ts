import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  default: { invalidatePrefix: vi.fn(), del: vi.fn(), invalidateUser: vi.fn() },
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: unknown) => (v == null ? v : `enc_${v}`)),
  decrypt: vi.fn((v: unknown) => (v == null ? v : String(v).replace('enc_', ''))),
}));

const {
  mockPatternRepository,
  mockSlotRepository,
  mockPatternAssignmentRepository,
  mockFixedShiftRepository,
  mockWorkLogRepository,
} = vi.hoisted(() => ({
  mockPatternRepository: {
    findAllWithSlots: vi.fn(),
    create: vi.fn(),
    updateName: vi.fn(),
    deleteWithCascade: vi.fn(),
  },
  mockSlotRepository: {
    create: vi.fn(),
    update: vi.fn(),
    bulkCreate: vi.fn(),
    deleteWithCascade: vi.fn(),
  },
  mockPatternAssignmentRepository: {
    findAll: vi.fn(),
    createWithCleanup: vi.fn(),
    delete: vi.fn(),
    findNonDefaultOverlapping: vi.fn(),
  },
  mockFixedShiftRepository: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    bulkReplace: vi.fn(),
    findDefaultForUser: vi.fn(),
  },
  mockWorkLogRepository: {
    findExistingByDateRange: vi.fn(),
    bulkInsertPlanned: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/scheduleRepository.js', () => ({
  patternRepository: mockPatternRepository,
  slotRepository: mockSlotRepository,
  patternAssignmentRepository: mockPatternAssignmentRepository,
  fixedShiftRepository: mockFixedShiftRepository,
}));

vi.mock('../../../src/repositories/workLogRepository.js', () => ({
  workLogRepository: mockWorkLogRepository,
}));

import {
  patternService,
  slotService,
  patternAssignmentService,
  fixedShiftService,
} from '../../../src/services/scheduleService.js';
import cache from '../../../src/utils/cache.js';
import { encrypt } from '../../../src/utils/crypto.js';

describe('patternService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should group patterns with their slots', () => {
      mockPatternRepository.findAllWithSlots.mockReturnValue([
        {
          pattern_id: 1,
          pattern_name: 'A',
          is_default: 1,
          slot_id: 1,
          period_name: '1限',
          start_time: '16:00',
          end_time: '17:20',
        },
        {
          pattern_id: 1,
          pattern_name: 'A',
          is_default: 1,
          slot_id: 2,
          period_name: '2限',
          start_time: '17:30',
          end_time: '18:50',
        },
        {
          pattern_id: 2,
          pattern_name: 'B',
          is_default: 0,
          slot_id: 3,
          period_name: '1限',
          start_time: '15:00',
          end_time: '16:20',
        },
      ]);

      const result = patternService.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
      expect(result[0].slots).toHaveLength(2);
      expect(result[1].name).toBe('B');
      expect(result[1].slots).toHaveLength(1);
    });

    it('should handle pattern with no slots', () => {
      mockPatternRepository.findAllWithSlots.mockReturnValue([
        {
          pattern_id: 1,
          pattern_name: 'Empty',
          is_default: 0,
          slot_id: null,
          period_name: null,
          start_time: null,
          end_time: null,
        },
      ]);

      const result = patternService.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].slots).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('should create pattern and invalidate cache', () => {
      mockPatternRepository.create.mockReturnValue(1);

      const result = patternService.create('New Pattern', 'admin');

      expect(result).toBe(1);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('patterns:');
    });
  });

  describe('updateName', () => {
    it('should update pattern name and invalidate cache', () => {
      mockPatternRepository.updateName.mockReturnValue(1);

      const changes = patternService.updateName(1, 'Renamed', 'admin');

      expect(changes).toBe(1);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('patterns:');
    });
  });

  describe('delete', () => {
    it('should delete with cascade and invalidate cache', () => {
      mockPatternRepository.deleteWithCascade.mockReturnValue(1);

      const changes = patternService.delete(1, 'admin');

      expect(changes).toBe(1);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('patterns:');
    });
  });
});

describe('slotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a slot', () => {
      mockSlotRepository.create.mockReturnValue(1);

      const result = slotService.create(1, '1限', '16:00', '17:20');

      expect(result).toBe(1);
      expect(mockSlotRepository.create).toHaveBeenCalledWith(1, '1限', '16:00', '17:20');
    });
  });

  describe('update', () => {
    it('should update slot and invalidate cache', () => {
      mockSlotRepository.update.mockReturnValue(1);

      const changes = slotService.update(1, '2限', '17:30', '18:50', 'admin');

      expect(changes).toBe(1);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('patterns:');
    });
  });

  describe('bulkCreate', () => {
    it('should create multiple slots', () => {
      mockSlotRepository.bulkCreate.mockReturnValue([1, 2, 3]);

      const slots = [
        { period_name: '1限', start_time: '16:00', end_time: '17:20' },
        { period_name: '2限', start_time: '17:30', end_time: '18:50' },
        { period_name: '3限', start_time: '19:00', end_time: '20:20' },
      ];

      const result = slotService.bulkCreate(1, slots, 'admin');

      expect(result).toEqual([1, 2, 3]);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('patterns:');
    });
  });

  describe('delete', () => {
    it('should delete slot with cascade', () => {
      mockSlotRepository.deleteWithCascade.mockReturnValue(1);

      const changes = slotService.delete(1);

      expect(changes).toBe(1);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('patterns:');
    });
  });
});

describe('patternAssignmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should delegate to repository', () => {
      const mockData = [{ id: 1, user_id: 1, pattern_id: 1 }];
      mockPatternAssignmentRepository.findAll.mockReturnValue(mockData);

      const result = patternAssignmentService.getAll(1, 'user');

      expect(result).toEqual(mockData);
      expect(mockPatternAssignmentRepository.findAll).toHaveBeenCalledWith(1, 'user', undefined);
    });
  });

  describe('create', () => {
    it('should create assignment for admin with specified user', () => {
      mockPatternAssignmentRepository.createWithCleanup.mockReturnValue({ id: 1, deletedCount: 0 });

      const result = patternAssignmentService.create(1, 'admin', {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        pattern_id: 1,
        user_id: 2,
      });

      expect(result).toEqual({ id: 1, deletedCount: 0 });
      expect(mockPatternAssignmentRepository.createWithCleanup).toHaveBeenCalledWith(
        2,
        '2026-01-01',
        '2026-01-31',
        1,
      );
    });

    it('should use own userId for non-admin', () => {
      mockPatternAssignmentRepository.createWithCleanup.mockReturnValue({ id: 1, deletedCount: 0 });

      patternAssignmentService.create(5, 'user', {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        pattern_id: 1,
      });

      expect(mockPatternAssignmentRepository.createWithCleanup).toHaveBeenCalledWith(
        5,
        '2026-01-01',
        '2026-01-31',
        1,
      );
    });
  });

  describe('delete', () => {
    it('should delegate to repository', () => {
      mockPatternAssignmentRepository.delete.mockReturnValue(1);

      const changes = patternAssignmentService.delete(1, 1, 'user');

      expect(changes).toBe(1);
    });
  });
});

describe('fixedShiftService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByUserId', () => {
    it('should return decrypted fixed shifts', () => {
      mockFixedShiftRepository.findByUserId.mockReturnValue([
        { id: 1, user_id: 1, day_of_week: 1, schedule_slot_id: 1, student_count: 'enc_2' },
      ]);

      const result = fixedShiftService.getByUserId(1);

      expect(result).toHaveLength(1);
      expect(result[0].student_count).toBe('2');
    });
  });

  describe('create', () => {
    it('should encrypt student count and create', () => {
      mockFixedShiftRepository.create.mockReturnValue(1);

      const result = fixedShiftService.create(1, 1, 1, 2);

      expect(result).toBe(1);
      expect(encrypt).toHaveBeenCalledWith(2);
    });
  });

  describe('delete', () => {
    it('should delete fixed shift', () => {
      mockFixedShiftRepository.delete.mockReturnValue(1);

      const changes = fixedShiftService.delete(1);

      expect(changes).toBe(1);
    });
  });

  describe('bulkReplace', () => {
    it('should encrypt and replace shifts', () => {
      fixedShiftService.bulkReplace(1, [
        { day_of_week: 1, schedule_slot_id: 1, student_count: 2 },
        { day_of_week: 3, schedule_slot_id: 2, student_count: 3 },
      ]);

      expect(mockFixedShiftRepository.bulkReplace).toHaveBeenCalledWith(1, [
        { day_of_week: 1, schedule_slot_id: 1, student_count: 'enc_2' },
        { day_of_week: 3, schedule_slot_id: 2, student_count: 'enc_3' },
      ]);
    });
  });

  describe('applyForMonth', () => {
    it('should return 0 when user has no fixed shifts', () => {
      mockFixedShiftRepository.findDefaultForUser.mockReturnValue([]);

      const count = fixedShiftService.applyForMonth(1, 2026, 3);

      expect(count).toBe(0);
    });

    it('should create work logs for days matching fixed shifts', () => {
      // Monday = day_of_week 1
      mockFixedShiftRepository.findDefaultForUser.mockReturnValue([
        { day_of_week: 1, schedule_slot_id: 1, student_count: 'enc_2' },
      ]);
      mockPatternAssignmentRepository.findNonDefaultOverlapping = vi.fn().mockReturnValue([]);
      mockWorkLogRepository.findExistingByDateRange.mockReturnValue([]);
      mockWorkLogRepository.bulkInsertPlanned.mockReturnValue(4);

      const count = fixedShiftService.applyForMonth(1, 2026, 3); // March 2026

      expect(count).toBe(4); // 4 Mondays in March 2026
      expect(mockWorkLogRepository.bulkInsertPlanned).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([expect.objectContaining({ scheduleSlotId: 1 })]),
      );
    });

    it('should skip dates that already have existing logs', () => {
      mockFixedShiftRepository.findDefaultForUser.mockReturnValue([
        { day_of_week: 1, schedule_slot_id: 1, student_count: 'enc_2' },
      ]);
      mockPatternAssignmentRepository.findNonDefaultOverlapping = vi.fn().mockReturnValue([]);
      mockWorkLogRepository.findExistingByDateRange.mockReturnValue([
        { date: '2026-03-02', schedule_slot_id: 1 },
      ]);
      mockWorkLogRepository.bulkInsertPlanned.mockReturnValue(3);

      const count = fixedShiftService.applyForMonth(1, 2026, 3);

      expect(count).toBe(3); // 4 Mondays minus 1 existing
    });

    it('should skip dates blocked by non-default pattern assignments', () => {
      mockFixedShiftRepository.findDefaultForUser.mockReturnValue([
        { day_of_week: 1, schedule_slot_id: 1, student_count: 'enc_2' },
      ]);
      mockPatternAssignmentRepository.findNonDefaultOverlapping = vi
        .fn()
        .mockReturnValue([{ start_date: '2026-03-01', end_date: '2026-03-07' }]);
      mockWorkLogRepository.findExistingByDateRange.mockReturnValue([]);
      mockWorkLogRepository.bulkInsertPlanned.mockReturnValue(3);

      const count = fixedShiftService.applyForMonth(1, 2026, 3);

      expect(count).toBe(3); // One Monday (2026-03-02) is blocked
    });

    it('should return 0 when all days are covered', () => {
      mockFixedShiftRepository.findDefaultForUser.mockReturnValue([
        { day_of_week: 1, schedule_slot_id: 1, student_count: 'enc_2' },
      ]);
      mockPatternAssignmentRepository.findNonDefaultOverlapping = vi
        .fn()
        .mockReturnValue([{ start_date: '2026-03-01', end_date: '2026-03-31' }]);
      mockWorkLogRepository.findExistingByDateRange.mockReturnValue([]);

      const count = fixedShiftService.applyForMonth(1, 2026, 3);

      expect(count).toBe(0);
    });
  });
});
