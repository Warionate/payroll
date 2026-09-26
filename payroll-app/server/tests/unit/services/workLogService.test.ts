import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: unknown) => (v == null ? v : `enc_${v}`)),
  decrypt: vi.fn((v: unknown) => (v == null ? v : String(v).replace('enc_', ''))),
}));

const { mockWorkLogRepository } = vi.hoisted(() => ({
  mockWorkLogRepository: {
    findByUserAndDateRange: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    bulkSave: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/workLogRepository.js', () => ({
  workLogRepository: mockWorkLogRepository,
}));

import { workLogService } from '../../../src/services/workLogService.js';
import { encrypt } from '../../../src/utils/crypto.js';

describe('workLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByUserAndDateRange', () => {
    it('should return decrypted work logs', () => {
      mockWorkLogRepository.findByUserAndDateRange.mockReturnValue([
        {
          id: 1,
          user_id: 1,
          date: '2026-01-15',
          work_type: 'class',
          schedule_slot_id: 1,
          student_count: 'enc_2',
          duration_minutes: 'enc_90',
          note: 'enc_test note',
          calculated_amount: 'enc_1500',
          status: 'confirmed',
        },
      ]);

      const result = workLogService.getByUserAndDateRange(1, '2026-01-01', '2026-01-31');

      expect(result).toHaveLength(1);
      expect(result[0].student_count).toBe('2');
      expect(result[0].duration_minutes).toBe('90');
      expect(result[0].note).toBe('test note');
      expect(result[0].calculated_amount).toBe('1500');
    });

    it('should pass date range parameters to repository', () => {
      mockWorkLogRepository.findByUserAndDateRange.mockReturnValue([]);

      workLogService.getByUserAndDateRange(1, '2026-03-01', '2026-03-31');

      expect(mockWorkLogRepository.findByUserAndDateRange).toHaveBeenCalledWith(
        1,
        '2026-03-01',
        '2026-03-31',
      );
    });

    it('should handle null/undefined encrypted fields', () => {
      mockWorkLogRepository.findByUserAndDateRange.mockReturnValue([
        {
          id: 1,
          user_id: 1,
          date: '2026-01-15',
          work_type: 'class',
          schedule_slot_id: null,
          student_count: null,
          duration_minutes: null,
          note: null,
          calculated_amount: null,
          status: 'planned',
        },
      ]);

      const result = workLogService.getByUserAndDateRange(1);

      expect(result[0].student_count).toBeNull();
      expect(result[0].duration_minutes).toBeNull();
    });
  });

  describe('create', () => {
    it('should encrypt sensitive fields and create work log', () => {
      mockWorkLogRepository.create.mockReturnValue(1);

      const result = workLogService.create(1, {
        date: '2026-01-15',
        work_type: 'class',
        schedule_slot_id: 1,
        student_count: 2,
        duration_minutes: 90,
        note: 'test',
      });

      expect(result).toBe(1);
      expect(encrypt).toHaveBeenCalledWith(2);
      expect(encrypt).toHaveBeenCalledWith(90);
      expect(encrypt).toHaveBeenCalledWith('test');
      expect(mockWorkLogRepository.create).toHaveBeenCalledWith(
        1,
        '2026-01-15',
        'class',
        1,
        'enc_2',
        'enc_90',
        'enc_test',
        'planned',
      );
    });

    it('should use default status "planned" when not provided', () => {
      mockWorkLogRepository.create.mockReturnValue(1);

      workLogService.create(1, {
        date: '2026-01-15',
        work_type: 'class',
        schedule_slot_id: null,
      });

      expect(mockWorkLogRepository.create).toHaveBeenCalledWith(
        1,
        '2026-01-15',
        'class',
        null,
        undefined,
        undefined,
        undefined,
        'planned',
      );
    });

    it('should use provided status when given', () => {
      mockWorkLogRepository.create.mockReturnValue(1);

      workLogService.create(1, {
        date: '2026-01-15',
        work_type: 'class',
        schedule_slot_id: null,
        status: 'confirmed',
      });

      expect(mockWorkLogRepository.create).toHaveBeenCalledWith(
        1,
        '2026-01-15',
        'class',
        null,
        undefined,
        undefined,
        undefined,
        'confirmed',
      );
    });
  });

  describe('update', () => {
    it('should encrypt fields and update work log', () => {
      mockWorkLogRepository.update.mockReturnValue(1);

      const changes = workLogService.update(5, 1, {
        date: '2026-01-16',
        work_type: 'class',
        schedule_slot_id: 2,
        student_count: 3,
        duration_minutes: 60,
        note: 'updated',
        status: 'confirmed',
      });

      expect(changes).toBe(1);
      expect(mockWorkLogRepository.update).toHaveBeenCalledWith(
        5,
        1,
        '2026-01-16',
        'class',
        2,
        'enc_3',
        'enc_60',
        'enc_updated',
        'confirmed',
      );
    });
  });

  describe('delete', () => {
    it('should delete work log and return changes count', () => {
      mockWorkLogRepository.delete.mockReturnValue(1);

      const result = workLogService.delete(5, 1);

      expect(result).toBe(1);
      expect(mockWorkLogRepository.delete).toHaveBeenCalledWith(5, 1);
    });

    it('should return 0 when no matching log found', () => {
      mockWorkLogRepository.delete.mockReturnValue(0);

      const result = workLogService.delete(999, 1);

      expect(result).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('should delegate status update to repository', () => {
      mockWorkLogRepository.updateStatus.mockReturnValue(1);

      const result = workLogService.updateStatus(5, 1, 'confirmed');

      expect(result).toBe(1);
      expect(mockWorkLogRepository.updateStatus).toHaveBeenCalledWith(5, 1, 'confirmed');
    });
  });

  describe('bulkSave', () => {
    it('should encrypt student counts and save in bulk', () => {
      workLogService.bulkSave(
        1,
        '2026-01-15',
        [
          { schedule_slot_id: 1, student_count: 2 },
          { schedule_slot_id: 2, student_count: 3 },
        ],
        [1, 2, 3],
      );

      expect(mockWorkLogRepository.bulkSave).toHaveBeenCalledWith(
        1,
        '2026-01-15',
        [1, 2, 3],
        [
          { schedule_slot_id: 1, student_count: 'enc_2', note: undefined, status: undefined },
          { schedule_slot_id: 2, student_count: 'enc_3', note: undefined, status: undefined },
        ],
      );
    });

    it('should encrypt notes when provided', () => {
      workLogService.bulkSave(
        1,
        '2026-01-15',
        [
          { schedule_slot_id: 1, student_count: 2, note: '数II 二次関数' },
          { schedule_slot_id: 2, student_count: 3, note: null },
        ],
        [1, 2],
      );

      expect(mockWorkLogRepository.bulkSave).toHaveBeenCalledWith(
        1,
        '2026-01-15',
        [1, 2],
        [
          {
            schedule_slot_id: 1,
            student_count: 'enc_2',
            note: 'enc_数II 二次関数',
            status: undefined,
          },
          { schedule_slot_id: 2, student_count: 'enc_3', note: null, status: undefined },
        ],
      );
    });

    it('should handle empty classes array', () => {
      workLogService.bulkSave(1, '2026-01-15', []);

      expect(mockWorkLogRepository.bulkSave).toHaveBeenCalledWith(1, '2026-01-15', undefined, []);
    });
  });
});
