import { memo } from 'react';
import { CheckCircle, X } from 'lucide-react';

interface ScheduleSlotInfo {
  id: number;
  period_name: string;
  start_time: string;
  end_time: string;
}

interface Props {
  slot: ScheduleSlotInfo;
  currentCount?: number;
  currentStatus?: string;
  currentNote?: string;
  onClassChange: (slotId: number, count: number) => void;
  onClassClear: (slotId: number) => void;
  onToggleStatus: (slotId: number) => void;
  onNoteChange: (slotId: number, note: string) => void;
}

const TimeSlotRow = memo(
  ({
    slot,
    currentCount,
    currentStatus,
    currentNote,
    onClassChange,
    onClassClear,
    onToggleStatus,
    onNoteChange,
  }: Props) => {
    const isCompleted = currentStatus === 'completed';

    return (
      <div
        className={`p-3 rounded-lg border transition-colors ${currentCount ? (isCompleted ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200') : 'bg-white border-gray-100'}`}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-gray-700">{slot.period_name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400">
              {slot.start_time} - {slot.end_time}
            </span>
            {currentCount && (
              <button
                onClick={() => onToggleStatus(slot.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${
                  isCompleted
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                }`}
              >
                <CheckCircle size={12} />
                {isCompleted ? '完了' : '確定'}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {[1, 2, 3, 4].map((num) => (
            <button
              key={num}
              onClick={() => onClassChange(slot.id, num)}
              className={`flex-1 py-1.5 text-sm font-bold rounded border transition-all
                            ${
                              currentCount === num
                                ? isCompleted
                                  ? 'bg-blue-500 text-white border-blue-600 shadow-sm'
                                  : 'bg-orange-500 text-white border-orange-600 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                            }`}
            >
              1:{num}
            </button>
          ))}
          {currentCount && (
            <button
              onClick={() => onClassClear(slot.id)}
              className="px-2 text-gray-400 hover:text-red-500"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {currentCount && (
          <input
            type="text"
            value={currentNote ?? ''}
            onChange={(e) => onNoteChange(slot.id, e.target.value)}
            placeholder="メモ (任意)"
            maxLength={500}
            className="mt-2 w-full p-1 text-xs border rounded bg-white text-gray-700 placeholder:text-gray-300"
          />
        )}
      </div>
    );
  },
);

TimeSlotRow.displayName = 'TimeSlotRow';
export default TimeSlotRow;
