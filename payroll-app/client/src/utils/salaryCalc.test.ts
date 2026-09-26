import { describe, it, expect } from 'vitest';
import { calculateSalary, getRateForDate, calculateDailyEarnings } from './salaryCalc';
import type { Rate, WorkLog } from '../types';

const mockRates = [
  {
    start_date: '2023-01-01',
    wage_1_student: 1500,
    wage_2_students: 2500,
    wage_3_students: 3500,
    wage_4_students: 4500,
    hourly_wage: 1000,
    allowance_day: 500,
    allowance_gap: 100,
  },
  {
    start_date: '2024-01-01',
    wage_1_student: 1600,
    wage_2_students: 2600,
    wage_3_students: 3600,
    wage_4_students: 4600,
    hourly_wage: 1100,
    allowance_day: 600,
    allowance_gap: 200,
  },
] as Rate[];

describe('salaryCalc', () => {
  describe('getRateForDate', () => {
    const sortedRates = [...mockRates].sort((a, b) => b.start_date.localeCompare(a.start_date));

    it('should return the correct rate for a date', () => {
      const rate2023 = getRateForDate('2023-05-01', sortedRates);
      expect(rate2023!.wage_1_student).toBe(1500);

      const rate2024 = getRateForDate('2024-05-01', sortedRates);
      expect(rate2024!.wage_1_student).toBe(1600);
    });

    it('should return the newest rate for future dates', () => {
      const rate = getRateForDate('2025-01-01', sortedRates);
      expect(rate!.wage_1_student).toBe(1600);
    });

    it('should fall back to the oldest rate for dates before any rate started', () => {
      // 詳細な仕様テストは packages/shared/src/utils/salaryCalc.test.ts を参照
      const rate = getRateForDate('2022-06-15', sortedRates);
      expect(rate!.wage_1_student).toBe(1500);
    });
  });

  describe('calculateSalary', () => {
    // Target: May 2023 Payment
    // Class: Apr 16 - May 15
    // Hourly: Apr 1 - Apr 30
    const classStart = new Date('2023-04-16');
    const classEnd = new Date('2023-05-15');
    const hourlyStart = new Date('2023-04-01');
    const hourlyEnd = new Date('2023-04-30');

    // Use 2023 rates (sorted descending for the function to work as expected usually,
    // but the function just takes currentRates. The caller usually sorts them.)
    const sortedRates = [...mockRates].sort((a, b) => b.start_date.localeCompare(a.start_date));

    it('should calculate class salary correctly', () => {
      const logs = [
        { date: '2023-04-20', work_type: 'class', student_count: 1, status: 'completed' },
        { date: '2023-04-21', work_type: 'class', student_count: 2, status: 'completed' },
      ] as WorkLog[];
      const result = calculateSalary(
        logs,
        sortedRates,
        classStart,
        classEnd,
        hourlyStart,
        hourlyEnd,
      );

      // Class: 1500 + 2500 = 4000
      // Allowance: 500 + 500 = 1000
      // Total: 5000
      expect(result.details.class).toBe(4000);
      expect(result.details.allowance).toBe(1000);
      expect(result.confirmed).toBe(5000);
    });

    it('should calculate hourly salary correctly', () => {
      const logs = [
        { date: '2023-04-10', work_type: 'hourly', duration_minutes: 60, status: 'completed' }, // In range
        { date: '2023-05-01', work_type: 'hourly', duration_minutes: 60, status: 'completed' }, // Out of range (May 1 is outside Apr 1-30)
      ] as WorkLog[];
      const result = calculateSalary(
        logs,
        sortedRates,
        classStart,
        classEnd,
        hourlyStart,
        hourlyEnd,
      );

      // Hourly: 1000 (only Apr 10)
      expect(result.details.hourly).toBe(1000);
      expect(result.confirmed).toBe(1000);
    });

    it('should calculate allowance gap correctly', () => {
      const logs = [
        { date: '2023-04-20', work_type: 'class', student_count: 1, status: 'completed' },
        { date: '2023-04-20', work_type: 'class', student_count: 1, status: 'completed' },
      ] as WorkLog[];
      // Same day, 2 classes.
      // Allowance: 500 (base) + 100 (gap) = 600
      // Class: 1500 + 1500 = 3000
      // Total: 3600

      const result = calculateSalary(
        logs,
        sortedRates,
        classStart,
        classEnd,
        hourlyStart,
        hourlyEnd,
      );
      expect(result.details.allowance).toBe(600);
      expect(result.details.class).toBe(3000);
      expect(result.confirmed).toBe(3600);
    });

    it('should separate confirmed and estimated totals', () => {
      const logs = [
        { date: '2023-04-20', work_type: 'class', student_count: 1, status: 'completed' },
        { date: '2023-04-21', work_type: 'class', student_count: 1, status: 'planned' },
      ] as WorkLog[];
      // Confirmed: 1500 (class) + 500 (allowance) = 2000
      // Estimated: 1500 + 1500 (class) + 500 + 500 (allowance) = 4000

      const result = calculateSalary(
        logs,
        sortedRates,
        classStart,
        classEnd,
        hourlyStart,
        hourlyEnd,
      );
      expect(result.confirmed).toBe(2000);
      expect(result.estimated).toBe(4000);
    });
  });

  describe('calculateDailyEarnings', () => {
    const rate = mockRates[0]; // 2023 rate: wage_1=1500, wage_2=2500, hourly=1000, allowance_day=500, allowance_gap=100

    it('should return 0 if no rate provided', () => {
      expect(calculateDailyEarnings([] as WorkLog[], null)).toBe(0);
    });

    it('should calculate single class correctly', () => {
      const logs = [{ work_type: 'class', student_count: 1 }] as WorkLog[];
      // wage(1500) + allowance(500) = 2000
      expect(calculateDailyEarnings(logs, rate)).toBe(2000);
    });

    it('should calculate multiple classes with gap allowance', () => {
      const logs = [
        { work_type: 'class', student_count: 1 },
        { work_type: 'class', student_count: 2 }, // wage=2500
      ] as WorkLog[];
      // Class 1: 1500
      // Class 2: 2500
      // Allowance: 500 (base) + 100 (gap) = 600
      // Total: 1500 + 2500 + 600 = 4600
      expect(calculateDailyEarnings(logs, rate)).toBe(4600);
    });

    it('should calculate hourly work correctly', () => {
      const logs = [{ work_type: 'hourly', duration_minutes: 90 }] as WorkLog[];
      // 90min = 1.5h. 1.5 * 1000 = 1500. No fractional part.
      // 90/60 * 1000 = 1500
      expect(calculateDailyEarnings(logs, rate)).toBe(1500);
    });

    it('should ceil fractional hourly wages (not floor)', () => {
      const fractionalRate = { ...rate, hourly_wage: 1180 };
      const logs = [
        { work_type: 'hourly', duration_minutes: 65 },
        { work_type: 'hourly', duration_minutes: 105 },
      ] as WorkLog[];
      // 65/60 * 1180 = 1278.333... → ceil = 1279
      // 105/60 * 1180 = 2065.0 → ceil = 2065
      // Total: 1279 + 2065 = 3344
      expect(calculateDailyEarnings(logs, fractionalRate)).toBe(3344);
    });

    it('should calculate combination of class and hourly', () => {
      const logs = [
        { work_type: 'class', student_count: 1 },
        { work_type: 'hourly', duration_minutes: 60 },
      ] as unknown as WorkLog[];
      // Class: 1500 + 500 (allowance) = 2000
      // Hourly: 1000
      // Total: 3000
      expect(calculateDailyEarnings(logs, rate)).toBe(3000);
    });

    it('should handle zero duration hourly logs', () => {
      const logs = [{ work_type: 'hourly', duration_minutes: 0 }] as WorkLog[];
      expect(calculateDailyEarnings(logs, rate)).toBe(0);
    });

    it('should handle string inputs safely', () => {
      const logs = [
        { work_type: 'class', student_count: '1' },
        { work_type: 'hourly', duration_minutes: '60' },
      ] as unknown as WorkLog[];
      // Same as combination test: 3000
      expect(calculateDailyEarnings(logs, rate)).toBe(3000);
    });
  });
});
