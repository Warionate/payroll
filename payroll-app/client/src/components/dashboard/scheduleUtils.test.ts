import { describe, it, expect } from 'vitest';
import { getDayOfWeekColor } from './scheduleUtils';

describe('scheduleUtils', () => {
  describe('getDayOfWeekColor', () => {
    it('returns red for Sunday', () => {
      // 2024-01-07 is a Sunday
      const sunday = new Date(2024, 0, 7);
      expect(getDayOfWeekColor(sunday)).toBe('text-red-400');
    });

    it('returns blue for Saturday', () => {
      // 2024-01-06 is a Saturday
      const saturday = new Date(2024, 0, 6);
      expect(getDayOfWeekColor(saturday)).toBe('text-blue-400');
    });

    it('returns gray for weekdays', () => {
      // 2024-01-08 is a Monday
      const monday = new Date(2024, 0, 8);
      expect(getDayOfWeekColor(monday)).toBe('text-gray-400');

      // 2024-01-10 is a Wednesday
      const wednesday = new Date(2024, 0, 10);
      expect(getDayOfWeekColor(wednesday)).toBe('text-gray-400');

      // 2024-01-12 is a Friday
      const friday = new Date(2024, 0, 12);
      expect(getDayOfWeekColor(friday)).toBe('text-gray-400');
    });
  });
});
