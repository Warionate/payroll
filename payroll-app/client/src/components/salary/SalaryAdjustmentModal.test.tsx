import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'react-hot-toast';
import SalaryAdjustmentModal from './SalaryAdjustmentModal';

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  yearMonth: '2026-06',
  monthLabel: '2026年6月',
  baseAmount: 50000,
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
};

/** 金額入力欄（type=number は spinbutton ロール） */
const amountInput = () => screen.getByRole('spinbutton');

describe('SalaryAdjustmentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen=false のとき何も描画しない', () => {
    const { container } = render(<SalaryAdjustmentModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('調整額モード', () => {
    it('入力額から予想最終金額を計算して表示する', () => {
      render(<SalaryAdjustmentModal {...defaultProps} />);

      fireEvent.change(amountInput(), { target: { value: '1000' } });

      // 50000 + 1000
      expect(screen.getByText('¥51,000')).toBeInTheDocument();
      expect(screen.getByText('¥50,000')).toBeInTheDocument(); // 調整前
    });

    it('符号トグルでマイナス調整になる', async () => {
      render(<SalaryAdjustmentModal {...defaultProps} />);

      fireEvent.change(amountInput(), { target: { value: '1000' } });
      // +/- トグルはアイコンのみのボタン（アクセシブルネームが空なのはこれだけ）
      const [signToggle] = screen.getAllByRole('button', { name: '' });
      fireEvent.click(signToggle);

      // 50000 - 1000
      expect(screen.getByText('¥49,000')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          {
            year_month: '2026-06',
            adjustment_type: 'incentive',
            amount: -1000,
            note: null,
          },
          undefined,
        );
      });
    });

    it('調整額 0 のまま保存するとエラートーストを出し onSave を呼ばない', async () => {
      render(<SalaryAdjustmentModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '追加' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('調整額を入力してください');
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('最終金額モード', () => {
    it('最終金額から差額を自動計算して onSave に渡す', async () => {
      render(<SalaryAdjustmentModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '最終金額' }));
      fireEvent.change(amountInput(), { target: { value: '48000' } });

      // 差額: 48000 - 50000 = -2000
      expect(screen.getByText('¥-2,000')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({ amount: -2000, year_month: '2026-06' }),
          undefined,
        );
      });
    });

    it('調整タイプとメモも保存データに反映される', async () => {
      render(<SalaryAdjustmentModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '計算誤差修正' }));
      fireEvent.click(screen.getByRole('button', { name: '最終金額' }));
      fireEvent.change(amountInput(), { target: { value: '50500' } });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '端数修正' } });

      fireEvent.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          {
            year_month: '2026-06',
            adjustment_type: 'correction',
            amount: 500,
            note: '端数修正',
          },
          undefined,
        );
      });
    });
  });

  describe('編集モード', () => {
    const existing = {
      id: 5,
      adjustment_type: 'correction',
      amount: -300,
      note: '誤差訂正',
    };

    it('既存の調整値（絶対値と符号）で初期化される', () => {
      render(<SalaryAdjustmentModal {...defaultProps} existingAdjustment={existing} />);

      expect(screen.getByText('調整を編集')).toBeInTheDocument();
      expect(amountInput()).toHaveValue(300);
      expect(screen.getByRole('textbox')).toHaveValue('誤差訂正');
      // 符号はマイナスで初期化 → 予想最終金額 = 50000 - 300
      expect(screen.getByText('¥49,700')).toBeInTheDocument();
    });

    it('更新時は既存 ID 付きで onSave を呼ぶ', async () => {
      render(<SalaryAdjustmentModal {...defaultProps} existingAdjustment={existing} />);

      fireEvent.click(screen.getByRole('button', { name: '更新' }));
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({ amount: -300, adjustment_type: 'correction' }),
          5,
        );
      });
    });

    it('削除ボタンで onDelete を呼ぶ', async () => {
      render(<SalaryAdjustmentModal {...defaultProps} existingAdjustment={existing} />);

      // アイコンのみのボタンは符号トグルと削除ボタンの 2 つ。削除はフッター側（後）
      const iconButtons = screen.getAllByRole('button', { name: '' });
      fireEvent.click(iconButtons[iconButtons.length - 1]);

      await waitFor(() => {
        expect(defaultProps.onDelete).toHaveBeenCalledWith(5);
      });
    });
  });
});
