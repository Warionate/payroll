import { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, Save } from 'lucide-react';
import { DAYS, DAY_INDICES, STUDENT_COUNTS } from './timetableConstants';
import type { SlotInfo } from './timetableConstants';

interface FixedSlotRowProps {
  slot: SlotInfo;
  currentCount: number | undefined;
  onClassChange: (slotId: number, count: number) => void;
  onClassClear: (slotId: number) => void;
}

function FixedSlotRow({ slot, currentCount, onClassChange, onClassClear }: FixedSlotRowProps) {
  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${currentCount ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-gray-700">{slot.period_name}</span>
        <span className="text-xs font-mono text-gray-400">
          {slot.start_time} - {slot.end_time}
        </span>
      </div>
      <div className="flex gap-1">
        {STUDENT_COUNTS.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onClassChange(slot.id, num)}
            className={`flex-1 py-1.5 text-sm font-bold rounded border transition-all
              ${
                currentCount === num
                  ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
          >
            1:{num}
          </button>
        ))}
        {currentCount && (
          <button
            type="button"
            onClick={() => onClassClear(slot.id)}
            className="px-2 text-gray-400 hover:text-red-500"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

interface DayShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayIndex: number | null;
  slots: SlotInfo[];
  dayShiftMap: Record<number, number>;
  onSave: (dayIndex: number, localData: Record<number, number>) => Promise<void>;
  isSaving: boolean;
}

export default function DayShiftModal({
  isOpen,
  onClose,
  dayIndex,
  slots,
  dayShiftMap,
  onSave,
  isSaving,
}: DayShiftModalProps) {
  const [localData, setLocalData] = useState<Record<number, number>>(dayShiftMap);

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

  const handleClassChange = useCallback((slotId: number, count: number) => {
    setLocalData((prev) => {
      if (prev[slotId] === count) {
        const next = { ...prev };
        delete next[slotId];
        return next;
      }
      return { ...prev, [slotId]: count };
    });
  }, []);

  const handleClassClear = useCallback((slotId: number) => {
    setLocalData((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (dayIndex === null) return;
    try {
      await onSave(dayIndex, localData);
      onClose();
    } catch {
      // error handled by parent
    }
  };

  if (!isOpen) return null;

  const dayLabel = dayIndex !== null ? DAYS[DAY_INDICES.indexOf(dayIndex)] : '';
  const registeredCount = Object.keys(localData).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-0">
      <div
        className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden animate-slide-up sm:animate-fade-in h-[85dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] flex flex-col"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b shrink-0">
          <div>
            <h3 className="font-bold text-gray-700 text-lg">
              <span
                className={dayIndex === 6 ? 'text-blue-500' : dayIndex === 0 ? 'text-red-500' : ''}
              >
                {dayLabel}曜日
              </span>
              <span className="text-sm text-gray-400 ml-2">の固定シフト</span>
            </h3>
            {registeredCount > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                {registeredCount}コマ登録中
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full"
            aria-label="閉じる"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-6">
          <section>
            <h4 className="font-bold text-gray-500 text-xs mb-2 flex items-center gap-1">
              <CheckCircle size={14} /> 授業スケジュール
            </h4>
            <div className="space-y-2">
              {slots.map((slot) => (
                <FixedSlotRow
                  key={slot.id}
                  slot={slot}
                  currentCount={localData[slot.id]}
                  onClassChange={handleClassChange}
                  onClassClear={handleClassClear}
                />
              ))}
              {slots.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">時間割設定がありません</p>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full font-bold rounded-xl transition-all flex items-center justify-center gap-2 btn-interactive bg-primary-600 hover:bg-primary-700 text-white shadow-lg px-4 py-3 disabled:opacity-50"
          >
            <Save size={20} />
            {isSaving ? '保存中...' : 'スケジュールを保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
