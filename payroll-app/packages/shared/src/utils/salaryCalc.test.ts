import { describe, it, expect } from 'vitest';
import {
  getRateForDate,
  getWageByStudentCount,
  calculateDayAllowance,
  calculateHourlyWage,
  getSalaryPeriod,
  calculateSalary,
  calculateDailyEarnings,
} from './salaryCalc.js';
import type { Rate } from '../types/rate.js';
import type { WorkLog } from '../types/workLog.js';

const baseRate = {
  id: 1,
  user_id: 1,
  is_active: 1,
};

const rate2023: Rate = {
  ...baseRate,
  id: 1,
  start_date: '2023-01-01',
  wage_1_student: 1500,
  wage_2_students: 2500,
  wage_3_students: 3500,
  wage_4_students: 4500,
  hourly_wage: 1000,
  allowance_day: 500,
  allowance_gap: 100,
};

const rate2024: Rate = {
  ...baseRate,
  id: 2,
  start_date: '2024-01-01',
  wage_1_student: 1600,
  wage_2_students: 2600,
  wage_3_students: 3600,
  wage_4_students: 4600,
  hourly_wage: 1100,
  allowance_day: 600,
  allowance_gap: 200,
};

/** Rates sorted newest-first, as expected by getRateForDate / calculateSalary */
const sortedRates: Rate[] = [rate2024, rate2023];

const makeLog = (overrides: Partial<WorkLog>): WorkLog => ({
  id: 1,
  user_id: 1,
  date: '2024-05-01',
  slot_id: null,
  work_type: 'class',
  student_count: 1,
  duration_minutes: null,
  note: '',
  status: 'planned',
  created_at: '2024-05-01T00:00:00Z',
  ...overrides,
});

describe('getRateForDate', () => {
  it('returns the rate whose start_date is the latest one on or before the given date', () => {
    expect(getRateForDate('2023-05-01', sortedRates)).toBe(rate2023);
    expect(getRateForDate('2024-05-01', sortedRates)).toBe(rate2024);
  });

  it('returns the rate starting exactly on the given date', () => {
    expect(getRateForDate('2024-01-01', sortedRates)).toBe(rate2024);
  });

  it('returns the newest rate for future dates', () => {
    expect(getRateForDate('2030-01-01', sortedRates)).toBe(rate2024);
  });

  it('falls back to the oldest rate for dates before any rate started', () => {
    // 仕様: 最古の単価の開始日より前の日付（入社前の研修日を後から記録した場合など）には
    // 最古の単価をそのまま適用する。日付に対応する単価が「無い」ことを表現する手段は
    // 現状なく、警告も出ない。挙動を変える場合はこのテストを意図的に更新すること。
    expect(getRateForDate('2022-06-15', sortedRates)).toBe(rate2023);
  });

  it('returns undefined when no rates exist', () => {
    expect(getRateForDate('2024-05-01', [])).toBeUndefined();
  });
});

describe('getWageByStudentCount', () => {
  it('maps student counts 1-3 to their wage tiers', () => {
    expect(getWageByStudentCount(1, rate2024)).toBe(1600);
    expect(getWageByStudentCount(2, rate2024)).toBe(2600);
    expect(getWageByStudentCount(3, rate2024)).toBe(3600);
  });

  it('uses the 4-student wage for 4 or more students', () => {
    expect(getWageByStudentCount(4, rate2024)).toBe(4600);
    expect(getWageByStudentCount(7, rate2024)).toBe(4600);
  });

  it('returns 0 for zero or negative counts', () => {
    expect(getWageByStudentCount(0, rate2024)).toBe(0);
    expect(getWageByStudentCount(-1, rate2024)).toBe(0);
  });
});

describe('calculateDayAllowance', () => {
  it('returns 0 when no classes were taught', () => {
    expect(calculateDayAllowance(0, rate2024)).toBe(0);
  });

  it('returns the base day allowance for a single class', () => {
    expect(calculateDayAllowance(1, rate2024)).toBe(600);
  });

  it('adds the gap allowance per additional class', () => {
    // 600 + (3 - 1) * 200
    expect(calculateDayAllowance(3, rate2024)).toBe(1000);
  });
});

describe('calculateHourlyWage', () => {
  it('computes pro-rated wage by minutes', () => {
    expect(calculateHourlyWage(60, 1100)).toBe(1100);
    expect(calculateHourlyWage(90, 1000)).toBe(1500);
  });

  it('rounds up fractional yen', () => {
    // 50/60 * 1000 = 833.33... → 834
    expect(calculateHourlyWage(50, 1000)).toBe(834);
  });
});

describe('getSalaryPeriod', () => {
  it('returns class period 16th of prev month – 15th of current month', () => {
    const p = getSalaryPeriod(2024, 5);
    expect(p.classStartDate).toBe('2024-04-16');
    expect(p.classEndDate).toBe('2024-05-15');
    expect(p.hourlyStartDate).toBe('2024-04-01');
    expect(p.hourlyEndDate).toBe('2024-04-30');
  });

  it('rolls over the year for January', () => {
    const p = getSalaryPeriod(2024, 1);
    expect(p.classStartDate).toBe('2023-12-16');
    expect(p.classEndDate).toBe('2024-01-15');
    expect(p.hourlyStartDate).toBe('2023-12-01');
    expect(p.hourlyEndDate).toBe('2023-12-31');
  });

  it('handles leap-year February as the hourly month', () => {
    const p = getSalaryPeriod(2024, 3);
    expect(p.hourlyEndDate).toBe('2024-02-29');
  });
});

describe('calculateSalary', () => {
  // 2024年5月分: 授業給 4/16〜5/15, 規定外 4/1〜4/30
  const period = getSalaryPeriod(2024, 5);
  const args = [
    period.classStartDate,
    period.classEndDate,
    period.hourlyStartDate,
    period.hourlyEndDate,
  ] as const;

  it('sums class wages within the class period and excludes outside dates', () => {
    const logs = [
      makeLog({ id: 1, date: '2024-04-16', student_count: 1 }), // 期間初日: 含む
      makeLog({ id: 2, date: '2024-05-15', student_count: 2 }), // 期間末日: 含む
      makeLog({ id: 3, date: '2024-04-15', student_count: 3 }), // 前日: 含まない
      makeLog({ id: 4, date: '2024-05-16', student_count: 3 }), // 翌日: 含まない
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    expect(result.details.class).toBe(1600 + 2600);
    // 手当: 4/16 と 5/15 の 2 日分 (各 1 コマ → 600)
    expect(result.details.allowance).toBe(1200);
    expect(result.estimated).toBe(1600 + 2600 + 1200);
  });

  it('sums hourly wages within the hourly period (previous month)', () => {
    const logs = [
      makeLog({ id: 1, work_type: 'hourly', date: '2024-04-10', duration_minutes: 90 }),
      makeLog({ id: 2, work_type: 'hourly', date: '2024-05-10', duration_minutes: 90 }), // 当月: 含まない
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    expect(result.details.hourly).toBe(Math.ceil((90 / 60) * 1100));
    expect(result.details.class).toBe(0);
    expect(result.details.allowance).toBe(0);
  });

  it('splits confirmed vs estimated by log status', () => {
    const logs = [
      makeLog({ id: 1, date: '2024-05-01', student_count: 1, status: 'completed' }),
      makeLog({ id: 2, date: '2024-05-02', student_count: 1, status: 'planned' }),
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    // 確定: 5/1 の授業給 1600 + 5/1 の手当 600
    expect(result.confirmed).toBe(2200);
    // 見込み: 両日の授業給 + 両日の手当
    expect(result.estimated).toBe(1600 * 2 + 600 * 2);
  });

  it('confirms only the completed classes portion of the day allowance', () => {
    const logs = [
      makeLog({ id: 1, date: '2024-05-01', student_count: 1, status: 'completed' }),
      makeLog({ id: 2, date: '2024-05-01', student_count: 1, status: 'planned' }),
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    // 見込み手当は全2コマ分: 600 + (2-1)*200 = 800
    expect(result.details.allowance).toBe(800);
    // 確定手当は完了1コマ分のみ: 600。planned の 1 コマ分(gap 200)は確定に含めない。
    // 確定授業給 1600 と合わせて 2200
    expect(result.confirmed).toBe(1600 + 600);
  });

  it('scales the confirmed allowance by the number of completed classes (partial day)', () => {
    // 3 コマ中 2 コマ完了。見込み手当は 3 コマ分、確定手当は 2 コマ分。
    const logs = [
      makeLog({ id: 1, date: '2024-05-01', student_count: 1, status: 'completed' }),
      makeLog({ id: 2, date: '2024-05-01', student_count: 1, status: 'completed' }),
      makeLog({ id: 3, date: '2024-05-01', student_count: 1, status: 'planned' }),
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    // 見込み手当: 600 + (3-1)*200 = 1000
    expect(result.details.allowance).toBe(1000);
    // 確定: 授業給 1600*2 + 手当(2コマ分) 600 + (2-1)*200 = 800
    expect(result.confirmed).toBe(1600 * 2 + 800);
  });

  it('confirms no allowance when the day has no completed classes', () => {
    const logs = [
      makeLog({ id: 1, date: '2024-05-01', student_count: 1, status: 'planned' }),
      makeLog({ id: 2, date: '2024-05-01', student_count: 1, status: 'planned' }),
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    expect(result.details.allowance).toBe(800); // 見込みは全コマ分
    expect(result.confirmed).toBe(0); // 確定はゼロ
  });

  it('applies the rate effective at each log date (rate change mid-period)', () => {
    // 2024年1月分: 授業給 2023-12-16〜2024-01-15。期間中に単価改定をまたぐ
    const p = getSalaryPeriod(2024, 1);
    const logs = [
      makeLog({ id: 1, date: '2023-12-20', student_count: 1 }), // 旧単価 1500
      makeLog({ id: 2, date: '2024-01-10', student_count: 1 }), // 新単価 1600
    ];
    const result = calculateSalary(
      logs,
      sortedRates,
      p.classStartDate,
      p.classEndDate,
      p.hourlyStartDate,
      p.hourlyEndDate,
    );
    expect(result.details.class).toBe(1500 + 1600);
    // 手当も各日の単価に従う: 500 + 600
    expect(result.details.allowance).toBe(1100);
  });

  it('returns logsWithAmounts sorted by date with allowance rows injected', () => {
    const logs = [
      makeLog({ id: 1, date: '2024-05-02', student_count: 1 }),
      makeLog({ id: 2, date: '2024-05-01', student_count: 1 }),
    ];
    const result = calculateSalary(logs, sortedRates, ...args);
    expect(result.logsWithAmounts.map((l) => l.date)).toEqual([
      '2024-05-01',
      '2024-05-01',
      '2024-05-02',
      '2024-05-02',
    ]);
    expect(result.logsWithAmounts.filter((l) => l.work_type === 'allowance')).toHaveLength(2);
  });

  it('labels the period after the class end month', () => {
    const result = calculateSalary([], sortedRates, ...args);
    expect(result.periodText).toBe('5月分');
  });

  it('returns zeros when no rates exist', () => {
    const logs = [makeLog({ id: 1, date: '2024-05-01', student_count: 1 })];
    const result = calculateSalary(logs, [], ...args);
    expect(result.estimated).toBe(0);
    expect(result.confirmed).toBe(0);
    expect(result.logsWithAmounts).toHaveLength(0);
  });
});

describe('calculateDailyEarnings', () => {
  it('returns 0 when rate is null', () => {
    expect(calculateDailyEarnings([makeLog({})], null)).toBe(0);
  });

  it('sums class, hourly and allowance for a single day', () => {
    const logs = [
      makeLog({ id: 1, work_type: 'class', student_count: 2 }),
      makeLog({ id: 2, work_type: 'class', student_count: 1 }),
      makeLog({ id: 3, work_type: 'hourly', duration_minutes: 30 }),
    ];
    // 授業 2600 + 1600、規定外 ceil(0.5*1100)=550、手当 600 + 200
    expect(calculateDailyEarnings(logs, rate2024)).toBe(2600 + 1600 + 550 + 800);
  });
});
