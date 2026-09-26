import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  default: { invalidatePrefix: vi.fn(), del: vi.fn(), invalidateUser: vi.fn() },
}));

const { mockSalaryAdjustmentRepository } = vi.hoisted(() => ({
  mockSalaryAdjustmentRepository: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/salaryAdjustmentRepository.js', () => ({
  salaryAdjustmentRepository: mockSalaryAdjustmentRepository,
}));

import { salaryAdjustmentService } from '../../../src/services/salaryAdjustmentService.js';
import cache from '../../../src/utils/cache.js';

describe('salaryAdjustmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByUserId', () => {
    it('should fetch adjustments for a user', () => {
      const mockData = [
        {
          id: 1,
          user_id: 1,
          year_month: '2026-01',
          adjustment_type: 'bonus',
          amount: 5000,
          note: null,
        },
      ];
      mockSalaryAdjustmentRepository.findByUserId.mockReturnValue(mockData);

      const result = salaryAdjustmentService.getByUserId(1);

      expect(result).toEqual(mockData);
      expect(mockSalaryAdjustmentRepository.findByUserId).toHaveBeenCalledWith(1, undefined);
    });

    it('should pass year filter when provided', () => {
      mockSalaryAdjustmentRepository.findByUserId.mockReturnValue([]);

      salaryAdjustmentService.getByUserId(1, '2026');

      expect(mockSalaryAdjustmentRepository.findByUserId).toHaveBeenCalledWith(1, '2026');
    });
  });

  describe('create', () => {
    it('should create adjustment and invalidate cache', () => {
      mockSalaryAdjustmentRepository.create.mockReturnValue(1);

      const result = salaryAdjustmentService.create(1, {
        year_month: '2026-01',
        adjustment_type: 'bonus',
        amount: 5000,
        note: 'Performance bonus',
      });

      expect(result).toBe(1);
      expect(mockSalaryAdjustmentRepository.create).toHaveBeenCalledWith(
        1,
        '2026-01',
        'bonus',
        5000,
        'Performance bonus',
      );
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('salary_adjustments:1');
    });

    it('should pass null for note when not provided', () => {
      mockSalaryAdjustmentRepository.create.mockReturnValue(2);

      salaryAdjustmentService.create(1, {
        year_month: '2026-02',
        adjustment_type: 'deduction',
        amount: 1000,
      });

      expect(mockSalaryAdjustmentRepository.create).toHaveBeenCalledWith(
        1,
        '2026-02',
        'deduction',
        1000,
        null,
      );
    });
  });

  describe('update', () => {
    it('should update adjustment and invalidate cache', () => {
      mockSalaryAdjustmentRepository.update.mockReturnValue(1);

      const changes = salaryAdjustmentService.update(5, 1, {
        year_month: '2026-01',
        adjustment_type: 'bonus',
        amount: 6000,
        note: 'Updated',
      });

      expect(changes).toBe(1);
      expect(mockSalaryAdjustmentRepository.update).toHaveBeenCalledWith(
        5,
        1,
        '2026-01',
        'bonus',
        6000,
        'Updated',
      );
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('salary_adjustments:1');
    });

    it('should return 0 when no matching record found', () => {
      mockSalaryAdjustmentRepository.update.mockReturnValue(0);

      const changes = salaryAdjustmentService.update(999, 1, {
        year_month: '2026-01',
        adjustment_type: 'bonus',
        amount: 6000,
      });

      expect(changes).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete adjustment and invalidate cache', () => {
      mockSalaryAdjustmentRepository.delete.mockReturnValue(1);

      const changes = salaryAdjustmentService.delete(5, 1);

      expect(changes).toBe(1);
      expect(mockSalaryAdjustmentRepository.delete).toHaveBeenCalledWith(5, 1);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('salary_adjustments:1');
    });
  });
});
