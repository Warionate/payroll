import { useQueryClient } from '@tanstack/react-query';
import Skeleton from '../components/loading/Skeleton';
import { useState, useRef } from 'react';
import {
  format,
  startOfMonth,
  startOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  addDays,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from 'lucide-react';
import EntryModal from '../components/calendar/EntryModal';
import { useWorkLogs, useWorkLogMutation } from '../hooks/useWorkLogs';
import { useFixedShiftMutation } from '../hooks/usePatterns';
import { useScheduleEvents } from '../hooks/useScheduleEvents';
import { getScheduleEventStyle } from '../components/dashboard/scheduleEventStyle';
import type { ScheduleEvent } from '../types';
import { useSwipe } from '../hooks/useSwipe';
import { toast } from 'react-hot-toast';
import { useConfirm } from '../hooks/useConfirm';
import type { WorkLog, CreateWorkLogInput } from '../types';

interface WorkLogExtended extends WorkLog {
  period_name?: string;
  schedule_slot_id?: number;
}

// Constants
const CALENDAR_DAYS = 41; // 42 days total (6 weeks * 7 days, 0-indexed)
const SCROLL_DEBOUNCE_MS = 500;
const SCROLL_THRESHOLD = 20;

export default function WorkSchedule() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Calculate view range (Always 6 weeks for consistent height)
  const monthStart = startOfMonth(currentDate);
  // Force week start to Sunday (0)
  const viewStart = startOfWeek(monthStart, { locale: ja, weekStartsOn: 0 });
  // 41 days added to start date gives 42 days total (6 weeks * 7 days)
  const viewEnd = addDays(viewStart, CALENDAR_DAYS);

  // Fetch Data
  const startStr = format(viewStart, 'yyyy-MM-dd');
  const endStr = format(viewEnd, 'yyyy-MM-dd');
  const EMPTY_LOGS: WorkLogExtended[] = [];
  const { data, isLoading } = useWorkLogs(startStr, endStr);
  const workLogs = (data ?? EMPTY_LOGS) as WorkLogExtended[];
  const EMPTY_EVENTS: ScheduleEvent[] = [];
  const { data: eventsData } = useScheduleEvents(startStr, endStr);
  const scheduleEvents = (eventsData ?? EMPTY_EVENTS) as ScheduleEvent[];

  // Mutations
  const { createMutation, updateMutation, deleteMutation, statusMutation } = useWorkLogMutation();
  const { applyMutation } = useFixedShiftMutation();

  // Navigation Handlers
  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  // Swipe Handlers
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => !isModalOpen && handleNextMonth(),
    onSwipeRight: () => !isModalOpen && handlePrevMonth(),
  });

  // Scroll Handler (Debounced)
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleWheel = (e: React.WheelEvent) => {
    if (isScrolling || isModalOpen) return;

    // Check if scrolling horizontally or vertically
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal scroll (e.g. trackpad swipe)
      if (Math.abs(e.deltaX) < SCROLL_THRESHOLD) return; // Threshold
      setIsScrolling(true);
      if (e.deltaX > 0) handleNextMonth();
      else handlePrevMonth();
    } else {
      // Vertical scroll (mouse wheel)
      if (Math.abs(e.deltaY) < SCROLL_THRESHOLD) return; // Threshold
      setIsScrolling(true);
      if (e.deltaY > 0) handleNextMonth();
      else handlePrevMonth();
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), SCROLL_DEBOUNCE_MS);
  };

  // 一括反映処理
  const handleApplyFixedShifts = async () => {
    if (
      !(await confirm({
        title: 'シフト一括反映',
        message: `${format(currentDate, 'M月')}の固定シフト(通常期)を一括反映しますか？\n(すでに登録済みの日はスキップされます)`,
        confirmLabel: '反映する',
      }))
    )
      return;
    try {
      const res = await applyMutation.mutateAsync({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
      });
      toast.success(`${res.count}件のデータを追加しました`);
      await queryClient.invalidateQueries({ queryKey: ['workLogs'] });
    } catch {
      toast.error('反映に失敗しました');
    }
  };

  // モーダル用のアクション関数群
  const handleSave = async (data: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync(data as unknown as CreateWorkLogInput);
    } catch (error: unknown) {
      console.error(error);
      toast.error('保存に失敗しました');
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    await statusMutation.mutateAsync({ id, status });
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: '削除確認', message: '削除しますか？', isDestructive: true })))
      return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error: unknown) {
      console.error(error);
      toast.error('削除に失敗しました');
    }
  };

  const handleUpdateLog = async (id: number, data: Record<string, unknown>) => {
    try {
      await updateMutation.mutateAsync({ id, data });
    } catch (error: unknown) {
      console.error(error);
      toast.error('更新に失敗しました。サーバーが起動しているか確認してください。');
    }
  };

  // カレンダー計算
  const calendarDays = eachDayOfInterval({
    start: viewStart,
    end: viewEnd,
  });

  // 指定日のログを取得
  const getLogsForDay = (day: Date) => {
    return workLogs.filter((log) => log.date === format(day, 'yyyy-MM-dd'));
  };

  // 指定日の塾内予定を取得（期間に該当するもの）
  const getEventsForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return scheduleEvents.filter((event) => event.start_date <= dayStr && dayStr <= event.end_date);
  };

  if (isLoading) {
    return (
      <div className="p-4 w-full mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="w-32 h-8" />
          <Skeleton className="w-24 h-8" />
        </div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {[...Array(35)].map((_, i) => (
            <Skeleton key={i} className="w-full h-full rounded-lg min-h-[60px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 w-full mx-auto touch-pan-y h-full flex flex-col overflow-hidden"
      {...swipeHandlers}
      onWheel={handleWheel}
    >
      {/* ヘッダー & 一括ボタン */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-gray-200 rounded-full"
            aria-label="前の月"
          >
            <ChevronLeft />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            {format(currentDate, 'yyyy年 M月', { locale: ja })}
          </h2>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-gray-200 rounded-full"
            aria-label="次の月"
          >
            <ChevronRight />
          </button>
        </div>
        <button
          onClick={handleApplyFixedShifts}
          className="text-xs flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold border border-blue-100 hover:bg-blue-100"
        >
          <CalendarIcon size={14} /> シフト反映
        </button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 mb-1 text-center text-xs font-semibold text-gray-500 flex-shrink-0">
        {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
          <div key={i} className={i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}>
            {day}
          </div>
        ))}
      </div>

      {/* カレンダー本体 */}
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0 grid-rows-6">
        {calendarDays.map((day) => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          const dayLogs = getLogsForDay(day);
          const dayEvents = getEventsForDay(day);
          const hasPlanned = dayLogs.some((log) => log.status === 'planned');

          return (
            <div
              key={day.toString()}
              onClick={() => {
                setSelectedDate(day);
                setIsModalOpen(true);
              }}
              className={`
                p-1 border rounded-lg cursor-pointer flex flex-col relative transition-colors overflow-hidden h-full
                ${isCurrentMonth ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 text-gray-300'}
                ${isToday(day) ? 'ring-2 ring-blue-400' : ''}
                ${hasPlanned ? 'hover:bg-orange-50' : 'hover:bg-blue-50'}
              `}
            >
              <div className="flex justify-between items-start mb-0.5">
                <span className={`text-xs font-bold ${isToday(day) ? 'text-blue-600' : ''}`}>
                  {format(day, 'd')}
                </span>
              </div>

              {/* バッジ表示 */}
              <div
                className="flex flex-col gap-1 overflow-y-auto no-scrollbar overscroll-y-contain touch-pan-y"
                onWheel={(e) => e.stopPropagation()}
              >
                {dayEvents.map((event) => {
                  const style = getScheduleEventStyle(event.event_type);
                  return (
                    <div
                      key={`event-${event.id}`}
                      title={`${event.title}${event.description ? `\n${event.description}` : ''}`}
                      className={`text-[10px] px-1 py-0.5 rounded-[3px] font-bold border flex-shrink-0 break-words leading-tight ${style.badge}`}
                    >
                      {event.title}
                    </div>
                  );
                })}
                {dayLogs.map((log) => {
                  const isCompleted = log.status === 'completed';
                  return (
                    <div
                      key={log.id}
                      title={log.note || undefined}
                      className={`
                        relative text-[10px] sm:text-[10px] px-1 py-0.5 sm:px-1 sm:py-0.5 rounded-[3px] font-medium border flex items-center justify-center sm:justify-start flex-shrink-0 min-w-0 overflow-hidden sm:gap-1
                        ${
                          isCompleted
                            ? log.work_type === 'class'
                              ? 'bg-blue-100 text-blue-700 border-blue-200'
                              : 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-white text-gray-400 border-gray-300 border-dashed'
                        }
                      `}
                    >
                      {/* Mobile Watermark Check */}
                      {isCompleted && (
                        <div className="absolute -right-1 -bottom-1 opacity-30 pointer-events-none sm:hidden">
                          <Check size={18} strokeWidth={4} />
                        </div>
                      )}

                      {/* PC Standard Check */}
                      {isCompleted && (
                        <Check
                          size={12}
                          strokeWidth={3}
                          className="hidden sm:block flex-shrink-0"
                        />
                      )}

                      <span className="truncate z-10 relative w-full text-center sm:text-left sm:w-auto">
                        {log.work_type === 'class'
                          ? `${log.period_name || '授業'} 1:${log.student_count}`
                          : `${log.note || '規定外'}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <EntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        date={selectedDate!}
        existingLogs={
          selectedDate
            ? (getLogsForDay(selectedDate) as unknown as {
                id: number;
                work_type: string;
                schedule_slot_id?: number;
              }[])
            : []
        }
        onSave={handleSave}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDelete}
        onUpdateLog={handleUpdateLog}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['workLogs'] })}
      />
    </div>
  );
}
