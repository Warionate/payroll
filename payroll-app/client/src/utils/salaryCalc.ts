/**
 * Salary calculation utilities.
 *
 * Core logic now lives in @payroll/shared. This module provides
 * a thin wrapper that converts Date-based period params to the
 * string-based API expected by the shared implementation, plus
 * re-exports for backwards compatibility.
 */
import { format } from 'date-fns';
import type { Rate, WorkLog, SalaryResult } from '../types';
import {
  calculateSalary as sharedCalculateSalary,
  calculateDailyEarnings,
  getRateForDate,
  SALARY_PERIOD_START_DAY,
  SALARY_PERIOD_END_DAY,
} from '@payroll/shared';

// Re-export shared functions and constants
export { calculateDailyEarnings, getRateForDate, SALARY_PERIOD_START_DAY, SALARY_PERIOD_END_DAY };

/**
 * Client-compatible calculateSalary that accepts Date objects for period bounds.
 * Delegates to the shared implementation using string-based date ranges.
 */
export const calculateSalary = (
  logs: WorkLog[],
  currentRates: Rate[],
  classStart: Date,
  classEnd: Date,
  hourlyStart: Date,
  hourlyEnd: Date,
): SalaryResult => {
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  return sharedCalculateSalary(
    logs,
    currentRates,
    fmt(classStart),
    fmt(classEnd),
    fmt(hourlyStart),
    fmt(hourlyEnd),
  );
};
