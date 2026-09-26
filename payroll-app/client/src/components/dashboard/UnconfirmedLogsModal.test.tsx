import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UnconfirmedLogsModal, { type UnconfirmedLog } from './UnconfirmedLogsModal';

const makeLog = (overrides: Partial<UnconfirmedLog>): UnconfirmedLog =>
  ({
    id: 1,
    user_id: 1,
    date: '2026-06-08',
    slot_id: null,
    work_type: 'class',
    student_count: 2,
    duration_minutes: null,
    note: '',
    status: 'planned',
    created_at: '2026-06-08T00:00:00Z',
    period_name: '1限',
    start_time: '17:00',
    end_time: '18:20',
    ...overrides,
  }) as UnconfirmedLog;

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  logs: [
    makeLog({ id: 1 }),
    makeLog({
      id: 2,
      date: '2026-06-05',
      work_type: 'hourly',
      duration_minutes: 90,
      period_name: undefined,
      start_time: undefined,
      end_time: undefined,
    }),
  ],
  onConfirmOne: vi.fn().mockResolvedValue(undefined),
  onConfirmAll: vi.fn().mockResolvedValue(undefined),
  onEdit: vi.fn(),
  isCompletingAll: false,
};

describe('UnconfirmedLogsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen=false のとき何も描画しない', () => {
    const { container } = render(<UnconfirmedLogsModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('件数と日付グループ・内容を表示する（新しい日付が上）', () => {
    render(<UnconfirmedLogsModal {...defaultProps} />);

    expect(screen.getByText('未確定の報告 (2件)')).toBeInTheDocument();
    expect(screen.getByText('6月8日 (月)')).toBeInTheDocument();
    expect(screen.getByText('6月5日 (金)')).toBeInTheDocument();
    expect(screen.getByText('1限 17:00〜18:20 ・ 2名')).toBeInTheDocument();
    expect(screen.getByText('規定外 1時間30分')).toBeInTheDocument();

    const dates = screen.getAllByText(/6月\d+日/).map((el) => el.textContent);
    expect(dates[0]).toContain('6月8日');
  });

  it('「確定」で対象ログの ID を渡して onConfirmOne を呼ぶ', async () => {
    render(<UnconfirmedLogsModal {...defaultProps} />);

    const confirmButtons = screen.getAllByRole('button', { name: /確定$/ });
    // 先頭グループ（6/8, id=1）の確定ボタン
    fireEvent.click(confirmButtons[0]);

    await waitFor(() => {
      expect(defaultProps.onConfirmOne).toHaveBeenCalledWith(1);
    });
  });

  it('「修正」でその日付を渡して onEdit を呼ぶ', () => {
    render(<UnconfirmedLogsModal {...defaultProps} />);

    fireEvent.click(screen.getAllByRole('button', { name: '修正' })[0]);
    expect(defaultProps.onEdit).toHaveBeenCalledWith('2026-06-08');
  });

  it('「すべて確定」で onConfirmAll を呼ぶ', () => {
    render(<UnconfirmedLogsModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /すべて確定/ }));
    expect(defaultProps.onConfirmAll).toHaveBeenCalled();
  });

  it('0 件のときは空メッセージを表示し「すべて確定」を出さない', () => {
    render(<UnconfirmedLogsModal {...defaultProps} logs={[]} />);

    expect(screen.getByText('未確定の報告はありません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /すべて確定/ })).not.toBeInTheDocument();
  });
});
