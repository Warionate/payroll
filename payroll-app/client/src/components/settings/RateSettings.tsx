import { useState, useMemo } from 'react';
import { DollarSign, Trash2, Plus } from 'lucide-react';
import { useRates, useRateMutation } from '../../hooks/useRates';
import { useConfirm } from '../../hooks/useConfirm';
import { toast } from 'react-hot-toast';
import { DEFAULT_RATES, STUDENT_LABELS, STUDENT_FIELDS } from '../../utils/rateConstants';
import type { Rate } from '../../types';

interface NumberInputProps {
  label: string;
  value: number | string;
  field: string;
  onChange: (field: string, value: number | string) => void;
}

const NumberInput = ({ label, value, field, onChange }: NumberInputProps) => (
  <div>
    <label className="block text-[10px] text-gray-500 mb-1">{label}</label>
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">¥</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const nextValue = e.target.value;
          const parsed = parseInt(nextValue, 10);
          onChange(field, nextValue === '' || Number.isNaN(parsed) ? '' : parsed);
        }}
        className="w-full pl-5 p-1 border rounded text-sm font-bold text-gray-700"
      />
    </div>
  </div>
);

interface RateCardProps {
  rate: number;
  label: string;
}

const RateCard = ({ rate, label }: RateCardProps) => (
  <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm">
    <p className="text-xs text-blue-100 mb-1">{label}</p>
    <p className="text-xl font-bold">¥{rate.toLocaleString()}</p>
  </div>
);

interface RateRowProps {
  label: string;
  value: number;
}

const RateRow = ({ label, value }: RateRowProps) => (
  <div className="flex justify-between text-sm border-b border-white/20 pb-1 last:border-b-0">
    <span className="text-blue-100">{label}</span>
    <span className="font-bold">¥{value.toLocaleString()}</span>
  </div>
);

export default function RateSettings() {
  const confirm = useConfirm();
  const { data: rates = [] } = useRates();
  const { createMutation, updateMutation, deleteMutation } = useRateMutation();

  const [showRateForm, setShowRateForm] = useState(false);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [rateFormData, setRateFormData] = useState({ start_date: '', ...DEFAULT_RATES });

  const handleRateChange = (field: string, value: number | string) => {
    setRateFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (editingRateId) {
        await updateMutation.mutateAsync({ id: editingRateId, data: rateFormData });
        toast.success('更新しました');
      } else {
        await createMutation.mutateAsync(rateFormData);
        toast.success('保存しました');
      }
      setShowRateForm(false);
      setEditingRateId(null);
    } catch (error: unknown) {
      console.error('Rate save failed:', error);
      toast.error('保存に失敗しました');
    }
  };

  const handleRateEdit = (rate: Rate) => {
    setRateFormData({
      start_date: rate.start_date,
      wage_1_student: rate.wage_1_student,
      wage_2_students: rate.wage_2_students,
      wage_3_students: rate.wage_3_students,
      wage_4_students: rate.wage_4_students,
      hourly_wage: rate.hourly_wage,
      allowance_day: rate.allowance_day,
      allowance_gap: rate.allowance_gap,
    });
    setEditingRateId(rate.id);
    setShowRateForm(true);
  };

  const handleRateDelete = async (id: number) => {
    if (
      await confirm({ title: '削除確認', message: '本当に削除しますか？', isDestructive: true })
    ) {
      try {
        await deleteMutation.mutateAsync(id);
        toast.success('削除しました');
      } catch (error: unknown) {
        console.error('Rate delete failed:', error);
        toast.error('削除に失敗しました');
      }
    }
  };

  const openNewRateForm = () => {
    setRateFormData({ start_date: '', ...DEFAULT_RATES });
    setEditingRateId(null);
    setShowRateForm(true);
  };

  const { sortedRates, currentRate } = useMemo(() => {
    const sorted = [...rates].sort(
      (a: Rate, b: Rate) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
    );
    const today = new Date().toISOString().split('T')[0];
    return { sortedRates: sorted, currentRate: sorted.find((r: Rate) => r.start_date <= today) };
  }, [rates]);

  const formatDate = (dateStr: string) => dateStr.replace(/-/g, '/');

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <DollarSign className="text-blue-600" />
        給与単価設定
      </h2>
      <p className="text-xs text-gray-500 mb-4">自分の給与計算に使用する単価を設定します。</p>

      {/* 現在適用中の単価カード */}
      {currentRate ? (
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign size={100} />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-sm font-bold text-blue-100 mb-1">現在適用中の単価</h3>
                <p className="text-2xl font-bold">{formatDate(currentRate.start_date)} 〜</p>
              </div>
              <span className="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded-full">
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {STUDENT_LABELS.map((label, i) => (
                <RateCard
                  key={label}
                  rate={currentRate[STUDENT_FIELDS[i] as keyof Rate] as number}
                  label={label}
                />
              ))}
            </div>

            <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm space-y-2">
              <RateRow label="規定外時給" value={currentRate.hourly_wage} />
              <RateRow label="日額手当" value={currentRate.allowance_day} />
              <RateRow label="授業間手当" value={currentRate.allowance_gap} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 p-6 rounded-xl text-center text-gray-500 mb-8">
          適用中の単価設定がありません
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-700">設定履歴 / 予約</h3>
        {!showRateForm && (
          <button
            onClick={openNewRateForm}
            className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:bg-blue-50 px-3 py-1 rounded-lg transition-colors"
          >
            <Plus size={16} /> 新しい期間を追加
          </button>
        )}
      </div>

      {showRateForm && (
        <div className="bg-white p-5 rounded-xl shadow-md mb-6 border border-blue-100 animate-fade-in">
          <form onSubmit={handleRateSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">適用開始日</label>
              <input
                type="date"
                required
                value={rateFormData.start_date}
                onChange={(e) => setRateFormData({ ...rateFormData, start_date: e.target.value })}
                className="w-full p-2 border rounded-lg font-bold text-gray-700"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                ※この日付以降、新しい単価が適用されます
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg">
              {STUDENT_LABELS.map((label, i) => (
                <NumberInput
                  key={label}
                  label={label}
                  value={(rateFormData as Record<string, number | string>)[STUDENT_FIELDS[i]]}
                  field={STUDENT_FIELDS[i]}
                  onChange={handleRateChange}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 bg-green-50 p-3 rounded-lg">
              <NumberInput
                label="規定外時給"
                value={rateFormData.hourly_wage}
                field="hourly_wage"
                onChange={handleRateChange}
              />
              <NumberInput
                label="日額手当"
                value={rateFormData.allowance_day}
                field="allowance_day"
                onChange={handleRateChange}
              />
              <NumberInput
                label="授業間"
                value={rateFormData.allowance_gap}
                field="allowance_gap"
                onChange={handleRateChange}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRateForm(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700"
              >
                {editingRateId ? '更新' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {sortedRates.map((rate, index) => {
          const isCurrent = rate.id === currentRate?.id;
          const nextRate = sortedRates[index - 1];
          const endDate = nextRate
            ? formatDate(
                new Date(
                  new Date(nextRate.start_date).setDate(
                    new Date(nextRate.start_date).getDate() - 1,
                  ),
                )
                  .toISOString()
                  .split('T')[0],
              )
            : '継続';

          return (
            <div
              key={rate.id}
              className={`p-4 rounded-xl border relative transition-all ${isCurrent ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' : 'bg-white border-gray-100 hover:border-gray-300'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500' : 'bg-gray-300'}`}
                  />
                  <p className="font-bold text-gray-800 text-sm">
                    {formatDate(rate.start_date)} 〜 {endDate}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRateEdit(rate)}
                    className="text-gray-400 hover:text-blue-500 transition-colors text-xs font-bold border border-gray-200 px-2 py-1 rounded hover:bg-blue-50"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleRateDelete(rate.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    aria-label="削除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 pl-5">
                {STUDENT_FIELDS.map((field, i) => (
                  <span key={field} className="bg-gray-50 px-2 py-1 rounded">
                    {i + 1}名: ¥{(rate as unknown as Record<string, number>)[field]}
                  </span>
                ))}
                <span className="bg-gray-50 px-2 py-1 rounded">時給: ¥{rate.hourly_wage}</span>
                <span className="bg-gray-50 px-2 py-1 rounded">手当: ¥{rate.allowance_day}</span>
                <span className="bg-gray-50 px-2 py-1 rounded">授業間: ¥{rate.allowance_gap}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
