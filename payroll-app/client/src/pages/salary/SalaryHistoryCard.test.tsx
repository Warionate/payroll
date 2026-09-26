import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SalaryHistoryCard from './SalaryHistoryCard';
import type { HistoryItem, SalaryAdjustmentRecord } from './constants';

const adjustment: SalaryAdjustmentRecord = {
  id: 7,
  user_id: 1,
  year_month: '2026-06',
  adjustment_type: 'incentive',
  amount: 3000,
  note: '目標達成ボーナス',
  created_at: '2026-06-01T00:00:00Z',
} as SalaryAdjustmentRecord;

const baseItem = {
  yearMonth: '2026-06',
  year: 2026,
  month: 6,
  monthLabel: '2026年6月',
  periodText: '6月分',
  confirmed: 40000,
  estimated: 50000,
  finalTotal: 53000,
  adjustmentTotal: 3000,
  details: { class: 42000, hourly: 5000, allowance: 3000 },
  logs: [],
  adjustments: [adjustment],
} as unknown as HistoryItem;

const defaultProps = {
  item: baseItem,
  isAdjustmentExpanded: false,
  onToggleAdjustments: vi.fn(),
  onOpenAdjustmentModal: vi.fn(),
  onDownloadCSV: vi.fn(),
  onPrint: vi.fn(),
};

describe('SalaryHistoryCard', () => {
  it('調整込みの最終金額と内訳を表示する', () => {
    render(<SalaryHistoryCard {...defaultProps} />);

    expect(screen.getByText('2026年6月 支給分')).toBeInTheDocument();
    expect(screen.getByText('¥53,000')).toBeInTheDocument(); // finalTotal
    expect(screen.getByText('¥42,000')).toBeInTheDocument(); // 授業給
    expect(screen.getByText('¥5,000')).toBeInTheDocument(); // 規定外
    expect(screen.getByText('調整: +¥3,000')).toBeInTheDocument();
  });

  it('マイナス調整は符号付きで表示される', () => {
    render(
      <SalaryHistoryCard
        {...defaultProps}
        item={
          {
            ...baseItem,
            adjustmentTotal: -2000,
            finalTotal: 48000,
          } as unknown as HistoryItem
        }
      />,
    );

    expect(screen.getByText('¥48,000')).toBeInTheDocument();
    expect(screen.getByText('調整: ¥-2,000')).toBeInTheDocument();
  });

  it('調整履歴を展開すると各調整の金額とメモが見える', () => {
    render(<SalaryHistoryCard {...defaultProps} isAdjustmentExpanded={true} />);

    expect(screen.getByText('調整履歴 (1件)')).toBeInTheDocument();
    expect(screen.getByText('目標達成ボーナス')).toBeInTheDocument();
    // 内訳グリッドの調整セルと履歴行の 2 箇所に表示される
    expect(screen.getAllByText('+¥3,000')).toHaveLength(2);
  });

  it('調整が無い月は調整履歴セクション自体を表示しない', () => {
    render(
      <SalaryHistoryCard
        {...defaultProps}
        item={{ ...baseItem, adjustments: [], adjustmentTotal: 0 } as unknown as HistoryItem}
      />,
    );

    expect(screen.queryByText(/調整履歴/)).not.toBeInTheDocument();
  });

  it('調整追加は見込み額（estimated）を基準額として渡す', () => {
    const onOpenAdjustmentModal = vi.fn();
    render(<SalaryHistoryCard {...defaultProps} onOpenAdjustmentModal={onOpenAdjustmentModal} />);

    fireEvent.click(screen.getByText('調整を追加'));
    expect(onOpenAdjustmentModal).toHaveBeenCalledWith('2026-06', '2026年6月', 50000);
  });

  it('CSV / PDF ボタンが item を渡してハンドラを呼ぶ', () => {
    render(<SalaryHistoryCard {...defaultProps} />);

    fireEvent.click(screen.getByText('CSV'));
    expect(defaultProps.onDownloadCSV).toHaveBeenCalledWith(baseItem);

    fireEvent.click(screen.getByText('PDF'));
    expect(defaultProps.onPrint).toHaveBeenCalledWith(baseItem);
  });
});
