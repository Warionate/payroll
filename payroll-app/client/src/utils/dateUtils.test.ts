import { describe, it, expect } from 'vitest';
import { parseSQLDate } from './dateUtils';

describe('dateUtils', () => {
  describe('parseSQLDate', () => {
    it('should parse SQLite UTC string correctly', () => {
      const sqlDate = '2023-01-01 12:00:00'; // Noon UTC
      const result = parseSQLDate(sqlDate);

      // Should be treated as UTC
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2023-01-01T12:00:00.000Z');
    });

    it('should handle ISO string with Z', () => {
      const isoDate = '2023-01-01T12:00:00Z';
      const result = parseSQLDate(isoDate);
      expect(result.toISOString()).toBe('2023-01-01T12:00:00.000Z');
    });

    it('should return current date for null/undefined', () => {
      const result = parseSQLDate(null);
      expect(result).toBeInstanceOf(Date);

      // Close to now
      const now = new Date();
      expect(Math.abs(result.getTime() - now.getTime())).toBeLessThan(1000);
    });

    it('should return the same Date object if passed a Date', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      const result = parseSQLDate(date);
      expect(result).toBe(date);
    });
  });
});
