import React, { useMemo, useState } from 'react';
import { Calendar, Plus, Clock, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import SkeletonCard from '../loading/SkeletonCard';
import PatternHeader from './PatternHeader';
import SlotRow from './SlotRow';
import BulkAddForm from './BulkAddForm';
import SingleSlotForm from './SingleSlotForm';
import type { SchedulePattern, ScheduleSlot } from '../../types';
import type { GeneratedSlot } from './patternUtils';

interface PatternWithSlots extends SchedulePattern {
  slots: ScheduleSlot[];
}

interface Props {
  patterns: PatternWithSlots[];
  isLoading: boolean;
  onCreatePattern: (name: string) => void;
  onUpdatePattern: (id: number, name: string) => void;
  onDeletePattern: (id: number) => void;
  onArchivePattern: (id: number, archived: boolean) => void;
  onCreateSlot: (data: {
    period_name: string;
    start_time: string;
    end_time: string;
    pattern_id: number;
  }) => void;
  onCreateBulkSlots: (data: { pattern_id: number; slots: GeneratedSlot[] }) => void;
  onUpdateSlot: (
    id: number,
    data: { period_name: string; start_time: string; end_time: string },
  ) => void;
  onDeleteSlot: (id: number) => void;
}

export default function PatternManagement({
  patterns,
  isLoading,
  onCreatePattern,
  onUpdatePattern,
  onDeletePattern,
  onArchivePattern,
  onCreateSlot,
  onCreateBulkSlots,
  onUpdateSlot,
  onDeleteSlot,
}: Props) {
  const [newPatternName, setNewPatternName] = useState('');
  const [expandedBulk, setExpandedBulk] = useState<Record<number, boolean>>({});

  const { activePatterns, archivedPatterns } = useMemo(() => {
    const active: PatternWithSlots[] = [];
    const archived: PatternWithSlots[] = [];
    for (const p of patterns) {
      if (p.is_archived) archived.push(p);
      else active.push(p);
    }
    return { activePatterns: active, archivedPatterns: archived };
  }, [patterns]);

  const handleCreatePattern = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatternName) return;
    onCreatePattern(newPatternName);
    setNewPatternName('');
  };

  const toggleBulk = (patternId: number) => {
    setExpandedBulk((prev) => ({ ...prev, [patternId]: !prev[patternId] }));
  };

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-700">
        <Calendar size={20} className="text-purple-600" />
        時間割パターン管理
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        通常授業や講習期間などの時間割パターンを作成・編集します。
        <span className="ml-1 text-purple-500 font-bold">授業80分 + 休憩10分</span>{' '}
        を基本として一括登録できます。
      </p>

      {/* Create Pattern */}
      <form onSubmit={handleCreatePattern} className="flex gap-2 mb-8">
        <input
          type="text"
          value={newPatternName}
          onChange={(e) => setNewPatternName(e.target.value)}
          placeholder="新しいパターン名 (例: 夏期講習)"
          className="flex-1 p-3 border rounded-lg font-bold shadow-sm"
        />
        <button
          type="submit"
          className="bg-purple-600 text-white px-6 rounded-lg font-bold shadow hover:bg-purple-700 flex items-center gap-2 btn-interactive"
        >
          <Plus size={18} /> 追加
        </button>
      </form>

      {/* Pattern List */}
      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <SkeletonCard count={2} />
        ) : (
          <>
            {activePatterns.map((pattern) => (
              <div
                key={pattern.id}
                className="bg-white p-5 rounded-xl shadow-sm border border-gray-200"
              >
                <PatternHeader
                  pattern={pattern}
                  onUpdatePattern={onUpdatePattern}
                  onDeletePattern={onDeletePattern}
                  onArchivePattern={onArchivePattern}
                />

                {/* Slot List */}
                <div className="space-y-2 mb-4">
                  {pattern.slots.map((slot) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      onUpdateSlot={onUpdateSlot}
                      onDeleteSlot={onDeleteSlot}
                    />
                  ))}
                  {pattern.slots.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      登録されたコマはありません
                    </p>
                  )}
                </div>

                {/* Bulk Add Toggle */}
                <button
                  type="button"
                  onClick={() => toggleBulk(pattern.id)}
                  className="w-full flex items-center justify-center gap-2 text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg py-2 mb-3 transition-colors btn-interactive border border-purple-100"
                >
                  <Zap size={14} />
                  一括追加
                  {expandedBulk[pattern.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {/* Bulk Add Panel */}
                {expandedBulk[pattern.id] && (
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-100 mb-3">
                    <BulkAddForm patternId={pattern.id} onCreateBulkSlots={onCreateBulkSlots} />
                  </div>
                )}

                {/* Single Add Form */}
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                    <Clock size={12} />
                    個別追加 (開始時刻を入れると終了は自動で+80分)
                  </p>
                  <SingleSlotForm patternId={pattern.id} onCreateSlot={onCreateSlot} />
                </div>
              </div>
            ))}

            {archivedPatterns.length > 0 && (
              <details className="bg-gray-50 rounded-xl border border-gray-200">
                <summary className="cursor-pointer p-4 text-sm font-bold text-gray-600 hover:text-gray-800 select-none">
                  アーカイブ済みパターン ({archivedPatterns.length}件)
                </summary>
                <div className="p-4 pt-0 space-y-4">
                  {archivedPatterns.map((pattern) => (
                    <div
                      key={pattern.id}
                      className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 opacity-80"
                    >
                      <PatternHeader
                        pattern={pattern}
                        onUpdatePattern={onUpdatePattern}
                        onDeletePattern={onDeletePattern}
                        onArchivePattern={onArchivePattern}
                      />
                      <div className="space-y-2">
                        {pattern.slots.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600"
                          >
                            <span className="font-bold text-gray-700 min-w-[60px]">
                              {slot.period_name}
                            </span>
                            <span className="font-mono">
                              {slot.start_time} 〜 {slot.end_time}
                            </span>
                          </div>
                        ))}
                        {pattern.slots.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-2">
                            登録されたコマはありません
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
