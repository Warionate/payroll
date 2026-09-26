import { Gift, Calculator, MoreHorizontal } from 'lucide-react';
import type { SalaryResult, LogWithAmount } from '../../types';

export const ADJUSTMENT_TYPE_INFO: Record<
  string,
  { label: string; icon: typeof MoreHorizontal; color: string }
> = {
  incentive: { label: 'インセンティブ', icon: Gift, color: 'text-green-600' },
  correction: { label: '計算誤差修正', icon: Calculator, color: 'text-blue-600' },
  other: { label: 'その他', icon: MoreHorizontal, color: 'text-gray-600' },
};

export interface SalaryAdjustmentRecord {
  id: number;
  year_month: string;
  adjustment_type: string;
  amount: number;
  note?: string;
}

export type SalaryLogEntry = LogWithAmount & { period_name?: string; schedule_slot_id?: number };

export interface HistoryItem extends SalaryResult {
  yearMonth: string;
  year: number;
  month: number;
  monthLabel: string;
  logs: SalaryLogEntry[];
  adjustments: SalaryAdjustmentRecord[];
  adjustmentTotal: number;
  finalTotal: number;
}
