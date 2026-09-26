/**
 * Shared salary calculation logic.
 *
 * This module contains the core salary calculation functions used by both
 * client and server. It is kept dependency-free (no date-fns) so that it
 * can be used in any environment.
 */

import type { Rate } from '../types/rate.js';
import type { WorkLog, LogWithAmount } from '../types/workLog.js';
import type { SalaryResult } from '../types/salary.js';
import { SALARY_PERIOD_START_DAY, SALARY_PERIOD_END_DAY } from '../constants/salary.js';

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Get the applicable rate for a given date.
 * Rates are expected to be sorted by start_date descending (newest first).
 */
export const getRateForDate = (dateStr: string, rates: Rate[]): Rate | undefined => {
  return rates.find((r) => r.start_date <= dateStr) || rates[rates.length - 1];
};

/**
 * Calculate wage based on student count.
 */
export function getWageByStudentCount(count: number, rate: Rate): number {
  if (count === 1) return Number(rate.wage_1_student);
  if (count === 2) return Number(rate.wage_2_students);
  if (count === 3) return Number(rate.wage_3_students);
  if (count >= 4) return Number(rate.wage_4_students);
  return 0;
}

/**
 * Calculate daily allowance based on class count.
 */
export function calculateDayAllowance(classCount: number, rate: Rate): number {
  if (classCount <= 0) return 0;
  let allowance = Number(rate.allowance_day);
  if (classCount > 1) {
    allowance += (classCount - 1) * Number(rate.allowance_gap);
  }
  return allowance;
}

/**
 * Calculate hourly wage for time-based work.
 */
export function calculateHourlyWage(durationMinutes: number, hourlyRate: number): number {
  return Math.ceil((durationMinutes / 60) * hourlyRate);
}

// ── Date range helpers (no date-fns) ───────────────────────────────

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  return dateStr >= startStr && dateStr <= endStr;
}

/**
 * Get salary period date ranges for a given year/month.
 *
 * Class period: 16th of previous month ~ 15th of current month
 * Hourly period: 1st ~ last day of previous month
 */
export function getSalaryPeriod(year: number, month: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastDay = getLastDayOfMonth(prevYear, prevMonth);

  const pad = (n: number) => String(n).padStart(2, '0');

  // 日定数も pad する。現行値(16/15)は 2 桁だが、1 桁に変更しても
  // "YYYY-MM-DD" のゼロ埋めが保たれ文字列比較（isDateInRange）が壊れないようにする。
  const classStartDate = `${prevYear}-${pad(prevMonth)}-${pad(SALARY_PERIOD_START_DAY)}`;
  const classEndDate = `${year}-${pad(month)}-${pad(SALARY_PERIOD_END_DAY)}`;
  const hourlyStartDate = `${prevYear}-${pad(prevMonth)}-01`;
  const hourlyEndDate = `${prevYear}-${pad(prevMonth)}-${pad(lastDay)}`;

  return { classStartDate, classEndDate, hourlyStartDate, hourlyEndDate };
}

// ── Main calculation ───────────────────────────────────────────────

/**
 * Calculate salary for a set of work logs within a given period.
 *
 * Used by the client's salary display and the server's PDF generation.
 */
export function calculateSalary(
  logs: WorkLog[],
  rates: Rate[],
  classStartDate: string,
  classEndDate: string,
  hourlyStartDate: string,
  hourlyEndDate: string,
): SalaryResult {
  let confirmedTotal = 0;
  let estimatedTotal = 0;
  let totalClass = 0;
  let totalHourly = 0;
  let totalAllowance = 0;

  const dailyStats: Record<string, { count: number; rate: Rate; status: string }> = {};
  const logsWithAmounts: LogWithAmount[] = [];

  logs.forEach((log) => {
    const rate = getRateForDate(log.date, rates);
    if (!rate) return;

    let logAmount = 0;
    let isIncluded = false;

    // Class salary
    if (log.work_type === 'class' && isDateInRange(log.date, classStartDate, classEndDate)) {
      const count = Number(log.student_count);
      logAmount = getWageByStudentCount(count, rate);
      totalClass += logAmount;
      isIncluded = true;

      if (!dailyStats[log.date]) dailyStats[log.date] = { count: 0, rate, status: log.status };
      dailyStats[log.date].count++;
    }

    // Hourly salary
    if (log.work_type === 'hourly' && isDateInRange(log.date, hourlyStartDate, hourlyEndDate)) {
      logAmount = calculateHourlyWage(Number(log.duration_minutes), Number(rate.hourly_wage));
      totalHourly += logAmount;
      isIncluded = true;
    }

    if (isIncluded) {
      logsWithAmounts.push({ ...log, amount: logAmount });
      estimatedTotal += logAmount;
      if (log.status === 'completed') {
        confirmedTotal += logAmount;
      }
    }
  });

  // Calculate allowances
  Object.entries(dailyStats).forEach(([date, { count, rate }]) => {
    if (count > 0) {
      // 見込み手当はその日の全コマ数で算出する
      const dayAllowance = calculateDayAllowance(count, rate);
      totalAllowance += dayAllowance;
      estimatedTotal += dayAllowance;

      const dayLogs = logs.filter((l) => l.date === date && l.work_type === 'class');
      const completedCount = dayLogs.filter((l) => l.status === 'completed').length;
      const hasCompleted = completedCount > 0;
      // 確定手当は「完了したコマ数」だけで再計算し、planned 分は含めない。
      // completedCount が 0 なら calculateDayAllowance は 0 を返す。
      confirmedTotal += calculateDayAllowance(completedCount, rate);

      logsWithAmounts.push({
        id: `allowance-${date}`,
        date,
        work_type: 'allowance',
        note: '手当',
        amount: dayAllowance,
        status: hasCompleted ? 'completed' : 'planned',
      });
    }
  });

  // Sort by date
  logsWithAmounts.sort((a, b) => a.date.localeCompare(b.date));

  // Build period text (M月分)
  const monthNum = parseInt(classEndDate.split('-')[1], 10);
  const periodText = `${monthNum}月分`;

  return {
    confirmed: confirmedTotal,
    estimated: estimatedTotal,
    periodText,
    details: { class: totalClass, hourly: totalHourly, allowance: totalAllowance },
    logsWithAmounts,
  };
}

/**
 * Calculate daily earnings for a set of work logs with a single rate.
 */
export function calculateDailyEarnings(logs: WorkLog[], rate: Rate | null): number {
  if (!rate) return 0;

  let total = 0;
  let classCount = 0;

  logs.forEach((log) => {
    if (log.work_type === 'class') {
      const count = Number(log.student_count) || 0;
      total += getWageByStudentCount(count, rate);
      classCount++;
    }

    if (log.work_type === 'hourly') {
      const minutes = Number(log.duration_minutes) || 0;
      total += calculateHourlyWage(minutes, Number(rate.hourly_wage));
    }
  });

  total += calculateDayAllowance(classCount, rate);
  return total;
}
