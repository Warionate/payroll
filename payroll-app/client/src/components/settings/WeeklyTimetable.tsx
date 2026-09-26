import { useState, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { DAYS, DAY_INDICES, STUDENT_COUNTS, CELL_COLORS } from './timetableConstants';
import type { SlotInfo } from './timetableConstants';
import DayShiftModal from './DayShiftModal';

interface FixedShiftData {
  day_of_week: number;
  schedule_slot_id: number;
  student_count: number;
}

interface WeeklyTimetableProps {
  slots: SlotInfo[];
  fixedShifts: FixedShiftData[];
  onSave: (
    shifts: { day_of_week: number; schedule_slot_id: number; student_count: number }[],
  ) => Promise<void>;
  isSaving: boolean;
}

// --- メインコンポーネント ---
export default function WeeklyTimetable({
  slots,
  fixedShifts,
  onSave,
  isSaving,
}: WeeklyTimetableProps) {
  // fixedShifts からローカル状態を計算 (派生状態なので useMemo)
  const shiftMap = useMemo(() => {
    const map: Record<string, number> = {};
    fixedShifts.forEach((shift) => {
      const key = `${shift.day_of_week}_${shift.schedule_slot_id}`;
      map[key] = Number(shift.student_count);
    });
    return map;
  }, [fixedShifts]);

  // モーダル状態
  const [modalDayIndex, setModalDayIndex] = useState<number | null>(null);
  // ホバー中の曜日
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // 曜日ヘッダーまたはセルのクリック → モーダルを開く
  const handleDayClick = useCallback((dayIndex: number) => {
    setModalDayIndex(dayIndex);
  }, []);

  const closeModal = useCallback(() => {
    setModalDayIndex(null);
  }, []);

  // モーダルから保存 (曜日のデータを適用 + サーバー保存)
  const handleDaySave = useCallback(
    async (dayIndex: number, localData: Record<number, number>) => {
      // shiftMap をマージ
      const next: Record<string, number> = { ...shiftMap };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${dayIndex}_`)) delete next[key];
      });
      Object.entries(localData).forEach(([slotId, count]) => {
        next[`${dayIndex}_${slotId}`] = count;
      });

      const shifts = Object.entries(next).map(([key, count]) => {
        const [dayOfWeek, slotId] = key.split('_').map(Number);
        return { day_of_week: dayOfWeek, schedule_slot_id: slotId, student_count: count };
      });

      try {
        await onSave(shifts);
        toast.success('固定シフトを保存しました');
      } catch (error) {
        toast.error('固定シフトの保存に失敗しました');
        throw error; // Re-throw so DayShiftModal can detect the failure if needed
      }
    },
    [shiftMap, onSave],
  );

  // モーダルに渡す曜日別のシフトデータ { slotId: count }
  const getDayShiftMap = useCallback(
    (dayIndex: number) => {
      const map: Record<number, number> = {};
      Object.entries(shiftMap).forEach(([key, count]) => {
        const [day, slotId] = key.split('_').map(Number);
        if (day === dayIndex) map[slotId] = count;
      });
      return map;
    },
    [shiftMap],
  );

  const registeredCount = Object.keys(shiftMap).length;

  // 曜日ごとの登録数
  const getDayCount = (dayIndex: number) => {
    return Object.keys(shiftMap).filter((k) => k.startsWith(`${dayIndex}_`)).length;
  };

  return (
    <div>
      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <span className="text-gray-400">曜日をタップして授業を登録</span>
        <div className="flex gap-2 ml-auto">
          {STUDENT_COUNTS.map((n) => (
            <span
              key={n}
              className={`px-2 py-0.5 rounded border font-bold ${CELL_COLORS[n].bg} ${CELL_COLORS[n].border} ${CELL_COLORS[n].text}`}
            >
              1:{n}
            </span>
          ))}
        </div>
      </div>

      {/* 時間割グリッド */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '60px' }} />
            {DAY_INDICES.map((dayIdx) => (
              <col key={dayIdx} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="p-1 text-xs font-bold text-gray-400 border border-gray-200"></th>
              {DAY_INDICES.map((dayIdx, i) => {
                const dayCount = getDayCount(dayIdx);
                const isHovered = hoveredDay === dayIdx;
                return (
                  <th
                    key={dayIdx}
                    onClick={() => handleDayClick(dayIdx)}
                    onMouseEnter={() => setHoveredDay(dayIdx)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={`p-1.5 text-center border border-gray-200 cursor-pointer select-none transition-colors
                      ${isHovered ? 'bg-blue-50' : dayCount > 0 ? 'bg-orange-50' : 'bg-gray-50'}
                    `}
                  >
                    <div
                      className={`text-xs font-bold ${dayIdx === 6 ? 'text-blue-500' : 'text-gray-700'}`}
                    >
                      {DAYS[i]}
                    </div>
                    <span
                      className={`inline-block mt-0.5 text-[10px] rounded-full px-1.5 font-bold ${
                        dayCount > 0 ? 'bg-orange-200 text-orange-700' : 'invisible'
                      }`}
                    >
                      {dayCount > 0 ? `${dayCount}コマ` : '\u00A0'}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id}>
                {/* 時限ラベル */}
                <td className="p-1 text-xs text-gray-500 border border-gray-200 whitespace-nowrap">
                  <div className="font-bold text-gray-700">{slot.period_name}</div>
                  <div className="text-[10px] text-gray-400">{slot.start_time?.slice(0, 5)}</div>
                </td>
                {/* 各曜日のセル — クリックで曜日モーダルを開く */}
                {DAY_INDICES.map((dayIdx) => {
                  const key = `${dayIdx}_${slot.id}`;
                  const count = shiftMap[key];
                  const color = count ? CELL_COLORS[count] : null;
                  const dayCount = getDayCount(dayIdx);

                  const isHovered = hoveredDay === dayIdx;
                  return (
                    <td
                      key={dayIdx}
                      onClick={() => handleDayClick(dayIdx)}
                      onMouseEnter={() => setHoveredDay(dayIdx)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={`border border-gray-200 cursor-pointer transition-colors text-center
                        ${isHovered ? 'bg-blue-50' : count ? (color?.bg ?? '') : dayCount > 0 ? 'bg-orange-50/40' : ''}
                      `}
                    >
                      {count && (
                        <span className={`text-xs sm:text-sm font-bold ${color?.text ?? ''}`}>
                          1:{count}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 登録数 */}
      {registeredCount > 0 && (
        <div className="mt-2 text-xs text-gray-400">
          登録数: <span className="font-bold text-gray-600">{registeredCount}</span> コマ
        </div>
      )}

      {/* 曜日モーダル */}
      <DayShiftModal
        key={modalDayIndex}
        isOpen={modalDayIndex !== null}
        onClose={closeModal}
        dayIndex={modalDayIndex}
        slots={slots}
        dayShiftMap={modalDayIndex !== null ? getDayShiftMap(modalDayIndex) : {}}
        onSave={handleDaySave}
        isSaving={isSaving}
      />
    </div>
  );
}
