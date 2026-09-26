import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Minus,
  Gift,
  Calculator,
  MoreHorizontal,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatApiError } from '../../utils/apiError';
import LoadingButton from '../common/LoadingButton';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

const ADJUSTMENT_TYPES = [
  { value: 'incentive', label: 'インセンティブ', icon: Gift, color: 'text-green-600 bg-green-50' },
  {
    value: 'correction',
    label: '計算誤差修正',
    icon: Calculator,
    color: 'text-blue-600 bg-blue-50',
  },
  { value: 'other', label: 'その他', icon: MoreHorizontal, color: 'text-gray-600 bg-gray-50' },
];

const INPUT_MODES = [
  { value: 'adjustment', label: '調整額' },
  { value: 'final', label: '最終金額' },
];

interface ExistingAdjustment {
  id: number;
  adjustment_type: string;
  amount: number;
  note?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  yearMonth: string;
  monthLabel: string;
  baseAmount?: number;
  existingAdjustment?: ExistingAdjustment;
  onSave: (data: Record<string, unknown>, id?: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function SalaryAdjustmentModal({
  isOpen,
  onClose,
  yearMonth,
  monthLabel,
  baseAmount = 0,
  existingAdjustment,
  onSave,
  onDelete,
}: Props) {
  const [adjustmentType, setAdjustmentType] = useState('incentive');
  const [inputMode, setInputMode] = useState('adjustment'); // 'adjustment' or 'final'
  const [isPositive, setIsPositive] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { modalRef } = useModalAccessibility({ isOpen, onClose });

  const isEditMode = !!existingAdjustment;

  // Calculate the actual adjustment amount based on input mode
  const calculatedAdjustment = useMemo(() => {
    const numAmount = parseInt(amount, 10) || 0;
    if (inputMode === 'final') {
      // Final amount mode: calculate difference from base
      return numAmount - baseAmount;
    } else {
      // Adjustment mode: use entered value with sign
      return isPositive ? numAmount : -numAmount;
    }
  }, [amount, inputMode, isPositive, baseAmount]);

  // Preview of final amount
  const previewFinalAmount = useMemo(() => {
    if (inputMode === 'final') {
      return parseInt(amount, 10) || 0;
    } else {
      return baseAmount + calculatedAdjustment;
    }
  }, [inputMode, amount, baseAmount, calculatedAdjustment]);

  // Initialize form when editing
  useEffect(() => {
    if (isOpen && existingAdjustment) {
      // 編集対象 prop からのフォーム初期化。本来は key で再マウントすべきだが挙動変更を避けて抑制
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdjustmentType(existingAdjustment.adjustment_type);
      setInputMode('adjustment'); // Always use adjustment mode when editing
      setIsPositive(existingAdjustment.amount >= 0);
      setAmount(Math.abs(existingAdjustment.amount).toString());
      setNote(existingAdjustment.note || '');
    } else if (isOpen) {
      // Reset form for new adjustment
      setAdjustmentType('incentive');
      setInputMode('adjustment');
      setIsPositive(true);
      setAmount('');
      setNote('');
    }
  }, [isOpen, existingAdjustment]);

  // Scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (calculatedAdjustment === 0) {
      toast.error('調整額を入力してください');
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        year_month: yearMonth,
        adjustment_type: adjustmentType,
        amount: calculatedAdjustment,
        note: note.trim() || null,
      };

      await onSave(data, existingAdjustment?.id);
      toast.success(isEditMode ? '更新しました' : '追加しました');
      onClose();
    } catch (error: unknown) {
      toast.error(formatApiError(error, '保存に失敗しました'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingAdjustment) return;

    setIsDeleting(true);
    try {
      await onDelete(existingAdjustment.id);
      toast.success('削除しました');
      onClose();
    } catch {
      toast.error('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="salary-adj-modal-title"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden animate-slide-up sm:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b">
          <div>
            <h3 className="font-bold text-gray-700 text-lg" id="salary-adj-modal-title">
              {isEditMode ? '調整を編集' : '給与調整を追加'}
            </h3>
            <span className="text-sm text-gray-500">{monthLabel}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full"
            aria-label="閉じる"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Adjustment Type */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">調整タイプ</label>
            <div className="grid grid-cols-3 gap-2">
              {ADJUSTMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setAdjustmentType(type.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    adjustmentType === type.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <type.icon
                    size={20}
                    className={adjustmentType === type.value ? 'text-blue-600' : 'text-gray-400'}
                  />
                  <span
                    className={`text-xs font-medium ${adjustmentType === type.value ? 'text-blue-700' : 'text-gray-600'}`}
                  >
                    {type.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Input Mode Toggle */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">入力方式</label>
            <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden">
              {INPUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => {
                    setInputMode(mode.value);
                    setAmount('');
                  }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    inputMode === mode.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">
              {inputMode === 'final' ? '最終金額' : '調整額'}
            </label>
            <div className="flex gap-2">
              {inputMode === 'adjustment' && (
                <button
                  onClick={() => setIsPositive(!isPositive)}
                  className={`px-4 py-3 rounded-lg border-2 font-bold transition-all ${
                    isPositive
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-red-500 bg-red-50 text-red-700'
                  }`}
                >
                  {isPositive ? <Plus size={20} /> : <Minus size={20} />}
                </button>
              )}
              <div className="flex-1 relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={inputMode === 'final' ? baseAmount.toString() : '0'}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-right text-xl font-bold focus:border-blue-500 focus:outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                  円
                </span>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-2 p-2 bg-gray-50 rounded-lg text-sm">
              {inputMode === 'adjustment' ? (
                <div className="flex justify-between text-gray-600">
                  <span>予想最終金額:</span>
                  <span className="font-bold">¥{previewFinalAmount.toLocaleString()}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-gray-600">
                  <span>調整額:</span>
                  <span
                    className={`font-bold ${calculatedAdjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {calculatedAdjustment >= 0 ? '+' : ''}¥{calculatedAdjustment.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>調整前:</span>
                <span>¥{baseAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">メモ（任意）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 12月目標達成ボーナス"
              rows={2}
              maxLength={500}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {isEditMode && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            キャンセル
          </button>
          <LoadingButton
            onClick={handleSubmit}
            loading={isSaving}
            className="flex-1"
            loadingText="保存中..."
          >
            {isEditMode ? '更新' : '追加'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
