import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, CheckCircle, Save } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { saveDailyClasses } from '../../api';
import { toast } from 'react-hot-toast';
import { formatApiError } from '../../utils/apiError';
import TimeSlotRow from './TimeSlotRow';
import HourlyWorkSection from './HourlyWorkSection';
import LoadingButton from '../common/LoadingButton';
import { useRates } from '../../hooks/useRates';
import { calculateDailyEarnings, getRateForDate } from '../../utils/salaryCalc';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { usePatterns, usePatternAssignments } from '../../hooks/usePatterns';
import type { Rate, WorkLog, CreateWorkLogInput } from '../../types';

interface EntryLog {
  id: number;
  work_type: string;
  schedule_slot_id?: number;
  student_count?: number;
  duration_minutes?: number;
  status?: string;
  note?: string;
  date?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  existingLogs: EntryLog[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onUpdateStatus: (id: number, status: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onUpdateLog: (id: number, data: Record<string, unknown>) => Promise<void>;
  onRefresh: () => void | Promise<void>;
}

export default function EntryModal({
  isOpen,
  onClose,
  date,
  existingLogs,
  onSave,
  onUpdateStatus,
  onDelete,
  onUpdateLog,
  onRefresh,
}: Props) {
  // Accessibility
  const { modalRef } = useModalAccessibility({ isOpen, onClose });
  // UI State
  const [activePattern, setActivePattern] = useState<{
    id: number;
    name: string;
    is_default?: boolean;
    slots: {
      id: number;
      period: number;
      day_of_week: number;
      start_time: string;
      end_time: string;
      label: string;
      period_name: string;
    }[];
  } | null>(null);
  const [classData, setClassData] = useState<Record<number, number>>({});
  const [classStatus, setClassStatus] = useState<Record<number, string>>({});
  const [classNotes, setClassNotes] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const isInitialized = useRef<boolean>(false);
  const [pendingHourlyStatus, setPendingHourlyStatus] = useState<Record<number, string>>({});

  const EMPTY_RATES: Rate[] = [];
  const { data: ratesData } = useRates();
  const rates = (ratesData ?? EMPTY_RATES) as Rate[];
  const hourlyLogs = existingLogs.filter((l) => l.work_type !== 'class');

  const estimatedEarnings = useMemo(() => {
    if (!date || !rates.length) return 0;
    const currentRate = getRateForDate(format(date, 'yyyy-MM-dd'), rates);
    if (!currentRate) return 0;

    const tempClassLogs = Object.entries(classData).map(([slotId, count]) => ({
      work_type: 'class' as const,
      student_count: count,
      status: classStatus[Number(slotId)] || 'planned',
    }));

    // Use hourlyLogs defined above
    const allLogsForCalc = [...tempClassLogs, ...hourlyLogs] as WorkLog[];
    return calculateDailyEarnings(allLogsForCalc, currentRate);
  }, [date, rates, classData, classStatus, hourlyLogs]);

  // Scroll Locking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      isInitialized.current = false;
      // 閉じたときのフォーム初期化。本来は key で再マウントすべきだが挙動変更を避けて抑制
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingHourlyStatus({});
      setActivePattern(null);
      setClassData({});
      setClassStatus({});
      setClassNotes({});
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const { data: pData = [] } = usePatterns();
  const { data: aData = [] } = usePatternAssignments();

  // Load Data
  useEffect(() => {
    const determineActivePattern = (
      pData: Array<{
        id: number;
        name: string;
        is_default?: boolean;
        slots: {
          id: number;
          period: number;
          day_of_week: number;
          start_time: string;
          end_time: string;
          label: string;
          period_name: string;
        }[];
      }>,
      aData: Array<{ start_date: string; end_date: string; pattern_id: number }>,
    ) => {
      if (!date) return;
      const dateStr = format(date, 'yyyy-MM-dd');

      const assignment = aData.find((a) =>
        isWithinInterval(parseISO(dateStr), {
          start: parseISO(a.start_date),
          end: parseISO(a.end_date),
        }),
      );

      let pattern: (typeof pData)[number] | null | undefined;
      if (assignment) {
        pattern = pData.find((p) => p.id === assignment.pattern_id);
      } else {
        pattern = pData.find((p) => p.is_default);
      }

      if (!pattern && pData.length > 0) pattern = pData[0];
      setActivePattern(pattern ?? null);
    };

    if (isOpen && date && pData.length > 0) {
      determineActivePattern(
        pData as Parameters<typeof determineActivePattern>[0],
        aData as Parameters<typeof determineActivePattern>[1],
      );
    }
  }, [isOpen, date, pData, aData]);

  // Initialize Class Data from Existing Logs
  useEffect(() => {
    if (isOpen && activePattern && !isInitialized.current) {
      const initialData: Record<number, number> = {};
      const initialStatus: Record<number, string> = {};
      const initialNotes: Record<number, string> = {};
      existingLogs.forEach((log) => {
        if (log.work_type === 'class' && log.schedule_slot_id) {
          initialData[log.schedule_slot_id] = Number(log.student_count);
          initialStatus[log.schedule_slot_id] = log.status || 'planned';
          if (log.note) initialNotes[log.schedule_slot_id] = log.note;
        }
      });
      setClassData(initialData);
      setClassStatus(initialStatus);
      setClassNotes(initialNotes);
      isInitialized.current = true;
    }
  }, [isOpen, existingLogs, activePattern]);

  const handleClassChange = useCallback((slotId: number, count: number) => {
    setClassData((prev) => {
      const isToggleOff = prev[slotId] === count;

      // Update classStatus based on current (not stale) classData
      setClassStatus((statusPrev) => {
        if (isToggleOff) {
          const next = { ...statusPrev };
          delete next[slotId];
          return next;
        }
        // If new entry, set to 'planned'
        if (!statusPrev[slotId]) return { ...statusPrev, [slotId]: 'planned' };
        return statusPrev;
      });

      if (isToggleOff) {
        setClassNotes((notesPrev) => {
          const next = { ...notesPrev };
          delete next[slotId];
          return next;
        });
        const next = { ...prev };
        delete next[slotId];
        return next;
      }
      return { ...prev, [slotId]: count };
    });
  }, []);

  const handleClassClear = useCallback((slotId: number) => {
    setClassData((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setClassStatus((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setClassNotes((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const handleClassNoteChange = useCallback((slotId: number, note: string) => {
    setClassNotes((prev) => ({ ...prev, [slotId]: note }));
  }, []);

  const toggleClassStatus = useCallback((slotId: number) => {
    // Note: We deliberately skip checking classData[slotId] here to avoid dependency
    // The UI ensures this is only called when valid.
    setClassStatus((prev) => ({
      ...prev,
      [slotId]: prev[slotId] === 'completed' ? 'planned' : 'completed',
    }));
  }, []);

  const handleBulkSave = async () => {
    if (!activePattern) return;
    setIsSaving(true);

    const classes: CreateWorkLogInput[] = Object.entries(classData).map(([slotId, count]) => {
      const id = Number(slotId);
      const note = classNotes[id]?.trim();
      return {
        schedule_slot_id: id,
        student_count: count,
        status: (classStatus[id] || 'planned') as 'planned' | 'completed',
        date: format(date, 'yyyy-MM-dd'),
        work_type: 'class' as const,
        ...(note ? { note } : {}),
      };
    });

    const patternSlotIds = activePattern.slots.map((s) => s.id);
    const existingSlotIds = existingLogs
      .filter((l) => l.work_type === 'class' && l.schedule_slot_id)
      .map((l) => l.schedule_slot_id);

    const managedSlotIds = [...new Set([...patternSlotIds, ...existingSlotIds])] as number[];

    try {
      await saveDailyClasses(format(date, 'yyyy-MM-dd'), classes, managedSlotIds);
      await onRefresh();
      toast.success('保存しました');
      onClose();
    } catch (error: unknown) {
      toast.error(formatApiError(error, '保存に失敗しました'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleHourlyStatusToggle = useCallback(
    async (log: EntryLog) => {
      const newStatus = log.status === 'completed' ? 'planned' : 'completed';
      setPendingHourlyStatus((prev) => ({ ...prev, [log.id]: newStatus }));

      try {
        await onUpdateStatus(log.id, newStatus);
        onRefresh();
      } catch {
        setPendingHourlyStatus((prev) => {
          const next = { ...prev };
          delete next[log.id];
          return next;
        });
        toast.error('更新に失敗しました');
      }
    },
    [onUpdateStatus, onRefresh],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-modal-title"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden animate-slide-up sm:animate-fade-in h-[85dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] flex flex-col"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b shrink-0">
          <div>
            <h3 className="font-bold text-gray-700 text-lg" id="entry-modal-title">
              {format(date, 'M月d日 (E)', { locale: ja })}
            </h3>
            {activePattern && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                {activePattern.name}
              </span>
            )}
            {estimatedEarnings > 0 && (
              <span className="ml-2 text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                ¥{estimatedEarnings.toLocaleString()}
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

        <div className="p-4 overflow-y-auto flex-1 space-y-6">
          {/* 1. Schedule Section (Bulk Edit) */}
          <section>
            <h4 className="font-bold text-gray-500 text-xs mb-2 flex items-center gap-1">
              <CheckCircle size={14} /> 授業スケジュール
            </h4>
            <div className="space-y-2">
              {activePattern?.slots.map((slot) => (
                <TimeSlotRow
                  key={slot.id}
                  slot={slot}
                  currentCount={classData[slot.id]}
                  currentStatus={classStatus[slot.id]}
                  currentNote={classNotes[slot.id]}
                  onClassChange={handleClassChange}
                  onClassClear={handleClassClear}
                  onToggleStatus={toggleClassStatus}
                  onNoteChange={handleClassNoteChange}
                />
              ))}
              {(!activePattern?.slots || activePattern.slots.length === 0) && (
                <p className="text-center text-gray-400 text-sm py-4">時間割設定がありません</p>
              )}
            </div>
          </section>

          {/* 2. Hourly Work Section */}
          <HourlyWorkSection
            hourlyLogs={hourlyLogs}
            pendingHourlyStatus={pendingHourlyStatus}
            onHourlyStatusToggle={handleHourlyStatusToggle}
            onDelete={onDelete}
            date={date}
            onSave={onSave}
            onUpdateLog={onUpdateLog}
          />
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <LoadingButton
            onClick={handleBulkSave}
            loading={isSaving}
            icon={<Save size={20} />}
            loadingText="保存中..."
            className="w-full"
          >
            スケジュールを保存
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
