// --- Salary ---

import type { LogWithAmount } from './workLog.js';

export type AdjustmentType = 'bonus' | 'deduction' | 'correction' | 'incentive' | 'other';

export interface SalaryAdjustment {
  id: number;
  user_id: number;
  year: number;
  month: number;
  amount: number;
  reason: string;
  type: AdjustmentType;
  created_at: string;
}

export interface SalaryResult {
  confirmed: number;
  estimated: number;
  periodText: string;
  details: {
    class: number;
    hourly: number;
    allowance: number;
  };
  logsWithAmounts: LogWithAmount[];
}
