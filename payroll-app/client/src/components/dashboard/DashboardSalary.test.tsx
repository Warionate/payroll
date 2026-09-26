import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DashboardSalary from './DashboardSalary';

const defaultProps = {
  salaryData: {
    confirmed: 2100,
    estimated: 6400,
    periodText: '6月分',
  },
  targetDate: new Date(2026, 5, 11), // 2026-06-11
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
};

describe('DashboardSalary', () => {
  it('確定給与と見込み給与をカンマ区切りで表示する', () => {
    render(<DashboardSalary {...defaultProps} />);

    expect(screen.getByText('¥2,100')).toBeInTheDocument();
    expect(screen.getByText('¥6,400')).toBeInTheDocument();
    expect(screen.getByText('確定給与')).toBeInTheDocument();
    expect(screen.getByText('支給見込 (全予定)')).toBeInTheDocument();
  });

  it('支給月と給与期間を表示する', () => {
    render(<DashboardSalary {...defaultProps} />);

    expect(screen.getByText('2026年6月支給')).toBeInTheDocument();
    expect(screen.getByText('期間: 6月分')).toBeInTheDocument();
  });

  it('0 円でも表示が崩れない', () => {
    render(
      <DashboardSalary
        {...defaultProps}
        salaryData={{ confirmed: 0, estimated: 0, periodText: '6月分' }}
      />,
    );

    expect(screen.getAllByText('¥0')).toHaveLength(2);
  });

  it('月送りボタンがハンドラを呼ぶ', () => {
    const onPrevMonth = vi.fn();
    const onNextMonth = vi.fn();
    render(
      <DashboardSalary {...defaultProps} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} />,
    );

    fireEvent.click(screen.getByLabelText('前の月'));
    expect(onPrevMonth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('次の月'));
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });
});
