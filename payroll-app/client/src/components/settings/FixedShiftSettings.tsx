import { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { useFixedShifts, useFixedShiftMutation, usePatterns } from '../../hooks/usePatterns';
import WeeklyTimetable from './WeeklyTimetable';
import type { SchedulePattern } from '../../types';

export default function FixedShiftSettings() {
  const { data: fixedShifts = [], isLoading: shiftsLoading } = useFixedShifts();
  const { bulkSyncMutation } = useFixedShiftMutation();
  const { data: patterns = [], isLoading: patternsLoading } = usePatterns();

  // 通常パターンのスロットを取得
  const availableSlots = useMemo(
    () =>
      patterns
        .filter((p: SchedulePattern) => p.name === '通常' || p.name === '通常期')
        .flatMap((p: SchedulePattern) => p.slots),
    [patterns],
  );

  const handleBulkSave = async (
    shifts: { day_of_week: number; schedule_slot_id: number; student_count: number }[],
  ) => {
    try {
      await bulkSyncMutation.mutateAsync(shifts);
    } catch (error) {
      console.error('Failed to sync fixed shifts:', error);
      throw error;
    }
  };

  const isLoading = shiftsLoading || patternsLoading;

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Calendar className="text-green-600" />
        固定シフト設定
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        毎週決まった時間の授業を登録しておくと、一括入力時に自動で反映されます。
      </p>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
        ) : availableSlots.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-2">時間割パターン (通常) が設定されていません</p>
            <p className="text-gray-400 text-xs">管理者に時間割パターンの設定を依頼してください</p>
          </div>
        ) : (
          <WeeklyTimetable
            slots={availableSlots}
            fixedShifts={fixedShifts}
            onSave={handleBulkSave}
            isSaving={bulkSyncMutation.isPending}
          />
        )}
      </div>
    </section>
  );
}
