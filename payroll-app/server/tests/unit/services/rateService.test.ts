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

const { mockRateRepository } = vi.hoisted(() => ({
  mockRateRepository: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/rateRepository.js', () => ({
  rateRepository: mockRateRepository,
}));

import { rateService } from '../../../src/services/rateService.js';
import { encrypt } from '../../../src/utils/crypto.js';
import cache from '../../../src/utils/cache.js';

describe('rateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByUserId', () => {
    it('should return decrypted rates', () => {
      mockRateRepository.findByUserId.mockReturnValue([
        {
          id: 1,
          user_id: 1,
          start_date: '2026-01-01',
          wage_1_student: 'enc_1500',
          wage_2_students: 'enc_1800',
          wage_3_students: 'enc_2000',
          wage_4_students: 'enc_2200',
          hourly_wage: 'enc_1200',
          allowance_day: 'enc_500',
          allowance_gap: 'enc_200',
          is_active: 1,
        },
      ]);

      const result = rateService.getByUserId(1);

      expect(result).toHaveLength(1);
      expect(result[0].wage_1_student).toBe('1500');
      expect(result[0].wage_2_students).toBe('1800');
      expect(result[0].wage_3_students).toBe('2000');
      expect(result[0].wage_4_students).toBe('2200');
      expect(result[0].hourly_wage).toBe('1200');
      expect(result[0].allowance_day).toBe('500');
      expect(result[0].allowance_gap).toBe('200');
    });

    it('should handle empty rate list', () => {
      mockRateRepository.findByUserId.mockReturnValue([]);

      const result = rateService.getByUserId(999);

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should encrypt all wage fields and create rate', () => {
      mockRateRepository.create.mockReturnValue(1);

      const data = {
        start_date: '2026-01-01',
        wage_1_student: 1500,
        wage_2_students: 1800,
        wage_3_students: 2000,
        wage_4_students: 2200,
        hourly_wage: 1200,
        allowance_day: 500,
        allowance_gap: 200,
      };

      const result = rateService.create(1, data);

      expect(result).toBe(1);
      expect(encrypt).toHaveBeenCalledTimes(7);
      expect(mockRateRepository.create).toHaveBeenCalledWith(
        1,
        '2026-01-01',
        'enc_1500',
        'enc_1800',
        'enc_2000',
        'enc_2200',
        'enc_1200',
        'enc_500',
        'enc_200',
      );
      expect(cache.invalidateUser).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should encrypt fields and update rate', () => {
      mockRateRepository.update.mockReturnValue(1);

      const data = {
        start_date: '2026-02-01',
        wage_1_student: 1600,
        wage_2_students: 1900,
        wage_3_students: 2100,
        wage_4_students: 2300,
        hourly_wage: 1300,
        allowance_day: 600,
        allowance_gap: 250,
      };

      const changes = rateService.update(1, 1, data);

      expect(changes).toBe(1);
      expect(cache.invalidateUser).toHaveBeenCalledWith(1);
    });

    it('should return 0 when no matching rate found', () => {
      mockRateRepository.update.mockReturnValue(0);

      const data = {
        start_date: '2026-02-01',
        wage_1_student: 1600,
        wage_2_students: 1900,
        wage_3_students: 2100,
        wage_4_students: 2300,
        hourly_wage: 1300,
        allowance_day: 600,
        allowance_gap: 250,
      };

      const changes = rateService.update(999, 1, data);

      expect(changes).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete rate and invalidate cache', () => {
      mockRateRepository.delete.mockReturnValue(1);

      const changes = rateService.delete(1, 1);

      expect(changes).toBe(1);
      expect(mockRateRepository.delete).toHaveBeenCalledWith(1, 1);
      expect(cache.invalidateUser).toHaveBeenCalledWith(1);
    });
  });
});
