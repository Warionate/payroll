import { useState, useMemo } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import SkeletonRow from '../loading/SkeletonRow';
import type { SchedulePattern, PatternAssignment } from '../../types';

interface Props {
  assignments: PatternAssignment[];
  patterns: SchedulePattern[];
  isLoading: boolean;
  onAssign: (data: { start_date: string; end_date: string; pattern_id: string }) => void;
  onDeleteAssignment: (id: number) => void;
}

export default function GlobalAssignment({
  assignments,
  patterns,
  isLoading,
  onAssign,
  onDeleteAssignment,
}: Props) {
  const [assignmentFormData, setAssignmentFormData] = useState({
    start_date: '',
    end_date: '',
    pattern_id: '',
  });

  const activePatterns = useMemo(() => patterns.filter((p) => !p.is_archived), [patterns]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = assignments.filter((a) => a.end_date == null || a.end_date >= todayStr);
  const past = assignments.filter((a) => a.end_date != null && a.end_date < todayStr);

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !assignmentFormData.pattern_id ||
      !assignmentFormData.start_date ||
      !assignmentFormData.end_date
    )
      return;

    onAssign(assignmentFormData);
    setAssignmentFormData({ start_date: '', end_date: '', pattern_id: '' });
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-700">
        <Clock size={20} className="text-orange-600" />
        時間割適用期間設定 (全ユーザー共通)
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        特定の日付範囲に対して、適用する時間割パターンを設定します。 設定は
        <span className="font-bold text-red-500">全てのユーザー</span>に適用されます。
      </p>

      <form
        onSubmit={handleAssign}
        className="bg-orange-50 p-4 rounded-xl border border-orange-100 mb-6 flex flex-col md:flex-row gap-4 items-end"
      >
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-gray-500 mb-1">開始日</label>
          <input
            type="date"
            className="w-full p-2 border rounded-lg font-bold"
            value={assignmentFormData.start_date}
            onChange={(e) =>
              setAssignmentFormData({ ...assignmentFormData, start_date: e.target.value })
            }
            required
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-gray-500 mb-1">終了日</label>
          <input
            type="date"
            className="w-full p-2 border rounded-lg font-bold"
            value={assignmentFormData.end_date}
            onChange={(e) =>
              setAssignmentFormData({ ...assignmentFormData, end_date: e.target.value })
            }
            required
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-gray-500 mb-1">適用パターン</label>
          <select
            className="w-full p-2 border rounded-lg font-bold"
            value={assignmentFormData.pattern_id}
            onChange={(e) =>
              setAssignmentFormData({ ...assignmentFormData, pattern_id: e.target.value })
            }
            required
          >
            <option value="">パターンを選択</option>
            {activePatterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="w-full md:w-auto bg-orange-500 text-white py-2 px-6 rounded-lg font-bold hover:bg-orange-600 shadow-sm btn-interactive"
        >
          適用
        </button>
      </form>

      {isLoading ? (
        <div className="py-2">
          <SkeletonRow count={3} height="h-10" />
        </div>
      ) : (
        <div className="space-y-4">
          <AssignmentList title="今後の適用" assignments={upcoming} onDelete={onDeleteAssignment} />
          {past.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-700">
                過去の適用 ({past.length}件)
              </summary>
              <div className="mt-2">
                <AssignmentList title="" assignments={past} onDelete={onDeleteAssignment} />
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function AssignmentList({
  title,
  assignments,
  onDelete,
}: {
  title: string;
  assignments: PatternAssignment[];
  onDelete: (id: number) => void;
}) {
  if (assignments.length === 0) {
    return (
      <>
        {title && <h3 className="text-sm font-bold text-gray-600 mb-2">{title}</h3>}
        <p className="text-center text-sm text-gray-400 py-4">設定された期間はありません</p>
      </>
    );
  }

  return (
    <>
      {title && <h3 className="text-sm font-bold text-gray-600 mb-2">{title}</h3>}
      <div className="space-y-2">
        {assignments.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-gray-600">
                {a.start_date} ~ {a.end_date}
              </span>
              <span className="font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded text-xs">
                {a.pattern_name}
              </span>
            </div>
            <button
              onClick={() => onDelete(a.id)}
              className="text-gray-400 hover:text-red-600 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label="期間設定を削除"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
