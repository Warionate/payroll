import { useState, useMemo, useEffect, useRef } from 'react';
import SkeletonCard from '../components/loading/SkeletonCard';
import SkeletonRow from '../components/loading/SkeletonRow';
import { useSearchParams } from 'react-router';
import { useWorkLogs, useWorkLogMutation } from '../hooks/useWorkLogs';
import { useRates } from '../hooks/useRates';
import { useScheduleEvents } from '../hooks/useScheduleEvents';
import { useToday } from '../hooks/useToday';
import {
  format,
  addDays,
  subDays,
  isSameDay,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import EntryModal from '../components/calendar/EntryModal';
import {
  calculateSalary,
  SALARY_PERIOD_START_DAY,
  SALARY_PERIOD_END_DAY,
} from '../utils/salaryCalc';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../hooks/useConfirm';
import { toast } from 'react-hot-toast';
import { formatApiError } from '../utils/apiError';
import DashboardAnnouncements from '../components/dashboard/DashboardAnnouncements';
import UnconfirmedLogsModal from '../components/dashboard/UnconfirmedLogsModal';
import DashboardSalary from '../components/dashboard/DashboardSalary';
import DashboardSchedule from '../components/dashboard/DashboardSchedule';
import type { WorkLog, Rate, CreateWorkLogInput, ScheduleEvent } from '../types';

/** WorkLog extended with schedule-slot fields returned by the API join */
type ScheduleWorkLog = WorkLog & {
  start_time?: string;
  end_time?: string;
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  // タブ復帰時に更新される「現在時刻」（マウント時刻のまま固定すると
  // PWA を日をまたいで復帰した際に「今日」がずれる）
  const now = useToday();
  const [searchParams, setSearchParams] = useSearchParams();

  // --- Deep Linking: Open Modal from URL ---
  const [selectedDate, setSelectedDate] = useState(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const date = parseISO(dateParam);
      if (date && !isNaN(date.getTime())) {
        return date;
      }
    }
    return null;
  });
  const [isModalOpen, setIsModalOpen] = useState(() => {
    return !!searchParams.get('date');
  });

  // Update selected date and modal state when URL changes
  const lastProcessedDateParamRef = useRef<string | null>(null);

  useEffect(() => {
    const dateParam = searchParams.get('date');

    // Prevent infinite loops by checking if param has actually changed
    if (dateParam === lastProcessedDateParamRef.current) return;

    if (!dateParam) {
      lastProcessedDateParamRef.current = null;
      return;
    }

    const date = parseISO(dateParam);
    if (!date || isNaN(date.getTime())) {
      lastProcessedDateParamRef.current = dateParam;
      return;
    }

    const dateTime = date.getTime();
    const currentDateTime = selectedDate?.getTime();

    if (dateTime !== currentDateTime) {
      queueMicrotask(() => {
        setSelectedDate(date);
        setIsModalOpen(true);
        // Clean up the parameter so it doesn't persistently trigger on remounts
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('date');
        setSearchParams(newParams, { replace: true });
      });
    }

    lastProcessedDateParamRef.current = dateParam;
  }, [searchParams, setSearchParams, selectedDate]);

  // --- Date States for Sections ---
  const [targetDate, setTargetDate] = useState(now);
  // Mobile "Infinite" Scroll Range: -14 days to +28 days from today
  const scheduleBaseDate = now;
  // Desktop Weekly View State - Start from Today
  const [scheduleDate, setScheduleDate] = useState(now);

  const { upcomingStart, upcomingEnd, pastStart, pastEnd } = useMemo(() => {
    return {
      upcomingStart: format(now, 'yyyy-MM-dd'),
      upcomingEnd: format(addDays(now, 14), 'yyyy-MM-dd'),
      pastStart: format(subDays(now, 30), 'yyyy-MM-dd'),
      pastEnd: format(subDays(now, 1), 'yyyy-MM-dd'),
    };
  }, [now]);

  // --- Date Ranges ---
  const { classStart, classEnd, hourlyStart, hourlyEnd, salaryStartStr, salaryEndStr } =
    useMemo(() => {
      // Class Range (16th of prev month to 15th of current month)
      const cStart = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth() - 1,
        SALARY_PERIOD_START_DAY,
      );
      const cEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), SALARY_PERIOD_END_DAY);

      // Hourly Range (1st of prev month to end of prev month)
      const hStart = startOfMonth(subMonths(targetDate, 1));
      const hEnd = endOfMonth(subMonths(targetDate, 1));

      // Salary Fetch Range (Union of Class and Hourly ranges)
      const sStartStr = format(hStart < cStart ? hStart : cStart, 'yyyy-MM-dd');
      const sEndStr = format(hEnd > cEnd ? hEnd : cEnd, 'yyyy-MM-dd');

      return {
        classStart: cStart,
        classEnd: cEnd,
        hourlyStart: hStart,
        hourlyEnd: hEnd,
        salaryStartStr: sStartStr,
        salaryEndStr: sEndStr,
      };
    }, [targetDate]);

  const { schedStart, schedEnd, minDate, maxDate, fetchStart, fetchEnd } = useMemo(() => {
    // Schedule Range (Extended for Mobile)
    const sStart = subDays(scheduleBaseDate, 14);
    const sEnd = addDays(scheduleBaseDate, 28);

    // Desktop View Range
    const sViewEnd = addDays(scheduleDate, 6);

    const min = new Date(
      Math.min(
        hourlyStart.getTime(),
        new Date(pastStart).getTime(),
        sStart.getTime(),
        scheduleDate.getTime(),
      ),
    );
    const max = new Date(
      Math.max(
        new Date(upcomingEnd).getTime(),
        new Date(salaryEndStr).getTime(),
        sEnd.getTime(),
        sViewEnd.getTime(),
      ),
    );

    // Add a buffer to be safe (e.g. start of min month, end of max month)
    const fStart = format(startOfMonth(min), 'yyyy-MM-dd');
    const fEnd = format(endOfMonth(max), 'yyyy-MM-dd');

    return {
      schedStart: sStart,
      schedEnd: sEnd,
      scheduleViewEnd: sViewEnd,
      minDate: min,
      maxDate: max,
      fetchStart: fStart,
      fetchEnd: fEnd,
    };
  }, [scheduleBaseDate, scheduleDate, hourlyStart, pastStart, upcomingEnd, salaryEndStr]);

  const { data: allLogsData, isLoading: logsLoading } = useWorkLogs(fetchStart, fetchEnd);
  const allLogs = useMemo(() => (allLogsData || []) as ScheduleWorkLog[], [allLogsData]);
  const { data: ratesData, isLoading: ratesLoading } = useRates();
  const rates = useMemo(() => (ratesData || []) as Rate[], [ratesData]);
  const { data: eventsData } = useScheduleEvents(fetchStart, fetchEnd);
  const scheduleEventsList = useMemo(() => (eventsData || []) as ScheduleEvent[], [eventsData]);
  // --- Filter Data for Sections ---
  const salaryLogs = useMemo(() => {
    return allLogs.filter((log) => log.date >= salaryStartStr && log.date <= salaryEndStr);
  }, [allLogs, salaryStartStr, salaryEndStr]);

  const scheduleLogs = useMemo(() => {
    // Use the dynamic range that covers all views
    const startStr = format(minDate, 'yyyy-MM-dd');
    const endStr = format(maxDate, 'yyyy-MM-dd');
    return allLogs.filter((log) => log.date >= startStr && log.date <= endStr);
  }, [allLogs, minDate, maxDate]);

  const upcomingLogs = useMemo(() => {
    return allLogs.filter((log) => log.date >= upcomingStart && log.date <= upcomingEnd);
  }, [allLogs, upcomingStart, upcomingEnd]);

  const pastLogs = useMemo(() => {
    return allLogs.filter((log) => log.date >= pastStart && log.date <= pastEnd);
  }, [allLogs, pastStart, pastEnd]);

  const salaryLoading = logsLoading;
  const scheduleLoading = logsLoading;
  const upcomingLoading = logsLoading;
  const pastLoading = logsLoading;

  // --- Mutations ---
  const { createMutation, updateMutation, deleteMutation, statusMutation, completeAllMutation } =
    useWorkLogMutation();

  // --- Derived State (Calculations) ---
  const salaryData = useMemo(() => {
    if (ratesLoading)
      return {
        confirmed: 0,
        estimated: 0,
        periodText: '',
        details: { class: 0, hourly: 0, allowance: 0 },
      };
    const currentRates = [...rates].sort((a, b) => b.start_date.localeCompare(a.start_date));
    return calculateSalary(salaryLogs, currentRates, classStart, classEnd, hourlyStart, hourlyEnd);
  }, [salaryLogs, rates, ratesLoading, classStart, classEnd, hourlyStart, hourlyEnd]);

  const nextSchedule = useMemo(() => {
    // Removed loading check to allow keepPreviousData to work
    const futureLogs = upcomingLogs.filter((log) => {
      if (!log.start_time || typeof log.start_time !== 'string') return false;
      const [h, m] = log.start_time.split(':').map(Number);
      const logDate = parseISO(log.date);
      const logDateTime = new Date(logDate);
      logDateTime.setHours(h, m, 0, 0);
      return logDateTime > now;
    });

    if (futureLogs.length > 0) {
      const nextDateStr = futureLogs[0].date;
      const nextDayLogs = futureLogs.filter((l) => l.date === nextDateStr);
      return {
        date: parseISO(nextDateStr),
        classCount: nextDayLogs.filter((l) => l.work_type === 'class').length,
        hourlyCount: nextDayLogs.filter((l) => l.work_type === 'hourly').length,
        startTime: nextDayLogs[0].start_time,
        endTime: nextDayLogs[nextDayLogs.length - 1].end_time,
      };
    }
    return null;
  }, [upcomingLogs, now]);

  const unconfirmedLogs = useMemo(() => {
    // Removed loading check to allow keepPreviousData to work
    return pastLogs.filter((l) => l.status !== 'completed');
  }, [pastLogs]);
  const unconfirmedCount = unconfirmedLogs.length;
  const [isUnconfirmedModalOpen, setIsUnconfirmedModalOpen] = useState(false);

  const handlePrevMonth = () => setTargetDate(subMonths(targetDate, 1));
  const handleNextMonth = () => setTargetDate(addMonths(targetDate, 1));

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleSaveLog = async (data: Record<string, unknown>) => {
    await createMutation.mutateAsync(data as unknown as CreateWorkLogInput);
  };

  const handleUpdateLog = async (id: number, data: Record<string, unknown>) => {
    await updateMutation.mutateAsync({ id, data: data as Partial<CreateWorkLogInput> });
  };

  const handleDeleteLog = async (id: number) => {
    if (
      await confirm({ title: '削除確認', message: '本当に削除しますか？', isDestructive: true })
    ) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    await statusMutation.mutateAsync({ id, status });
  };

  const handleCompleteAll = async () => {
    if (
      await confirm({
        title: '一括確定',
        message: `過去30日以内の未確定 ${unconfirmedCount} 件をすべて「完了」にしますか？`,
      })
    ) {
      try {
        await completeAllMutation.mutateAsync({ start_date: pastStart, end_date: pastEnd });
        toast.success('未確定の報告をすべて確定しました');
        setIsUnconfirmedModalOpen(false);
      } catch (error) {
        toast.error(formatApiError(error, '一括確定に失敗しました'));
      }
    }
  };

  const handleConfirmOne = async (id: number) => {
    try {
      await statusMutation.mutateAsync({ id, status: 'completed' });
      toast.success('確定しました');
    } catch (error) {
      toast.error(formatApiError(error, '確定に失敗しました'));
    }
  };

  const handleEditUnconfirmed = (date: string) => {
    // 未確定一覧を閉じて、その日の入力モーダルを開く
    setIsUnconfirmedModalOpen(false);
    setSelectedDate(parseISO(date));
    setIsModalOpen(true);
  };

  // Schedule View Handlers (Desktop)
  const handlePrevWeek = () => setScheduleDate(subDays(scheduleDate, 7));
  const handleNextWeek = () => setScheduleDate(addDays(scheduleDate, 7));
  const handleToday = () => setScheduleDate(now);

  const getDaySchedule = (date: Date) => {
    return scheduleLogs.filter((log: ScheduleWorkLog) => isSameDay(parseISO(log.date), date));
  };

  const isLoading =
    salaryLoading || ratesLoading || scheduleLoading || upcomingLoading || pastLoading;

  if (isLoading && !salaryLogs.length && !scheduleLogs.length) {
    return (
      <div className="p-4 pb-24 space-y-6 w-full mx-auto">
        {/* Announcements Skeleton */}
        <SkeletonCard count={1} className="h-32" />

        {/* Salary Skeleton */}
        <SkeletonCard count={1} className="h-48" />

        {/* Schedule Skeleton */}
        <div className="space-y-3">
          <SkeletonRow count={3} height="h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="p-4 pb-24 space-y-6 w-full mx-auto">
        <DashboardAnnouncements
          unconfirmedCount={unconfirmedCount}
          nextSchedule={nextSchedule}
          onShowUnconfirmed={() => setIsUnconfirmedModalOpen(true)}
        />

        <UnconfirmedLogsModal
          isOpen={isUnconfirmedModalOpen}
          onClose={() => setIsUnconfirmedModalOpen(false)}
          logs={unconfirmedLogs}
          onConfirmOne={handleConfirmOne}
          onConfirmAll={handleCompleteAll}
          onEdit={handleEditUnconfirmed}
          isCompletingAll={completeAllMutation.isPending}
        />

        <DashboardSalary
          salaryData={salaryData}
          targetDate={targetDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />

        <div className="space-y-3">
          <DashboardSchedule
            scheduleDate={scheduleDate}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onToday={handleToday}
            scheduleLogs={
              scheduleLogs as unknown as {
                id?: number;
                date: string;
                work_type: string;
                student_count?: number;
                duration_minutes?: number;
                note?: string;
                status: string;
                start_time?: string;
                end_time?: string;
              }[]
            }
            scheduleEvents={scheduleEventsList}
            onDayClick={handleDayClick}
            schedStart={schedStart}
            schedEnd={schedEnd}
          />

          {/* Entry Modal */}
          <EntryModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            date={selectedDate!}
            existingLogs={
              selectedDate
                ? (getDaySchedule(selectedDate) as unknown as {
                    id: number;
                    work_type: string;
                    schedule_slot_id?: number;
                    student_count?: number;
                    duration_minutes?: number;
                    status?: string;
                    note?: string;
                    date?: string;
                  }[])
                : []
            }
            onSave={handleSaveLog}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDeleteLog}
            onUpdateLog={handleUpdateLog}
            onRefresh={async () => {
              // invalidateQueries はアクティブなクエリのみ即時再取得し、
              // 非表示の範囲は次回マウント時に取得する（refetchQueries だと
              // キャッシュ内の全範囲を一斉に再取得してしまう）
              await queryClient.invalidateQueries({ queryKey: ['workLogs'] });
            }}
          />
        </div>
      </div>
    </div>
  );
}
