import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, addDays, isSameDay, eachDayOfInterval, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getDayOfWeekColor } from './scheduleUtils';
import { ScheduleLogCard } from './ScheduleLogCard';
import { getScheduleEventStyle } from './scheduleEventStyle';
import type { ScheduleEvent } from '../../types';

// Constants
const SCROLL_DEBOUNCE_MS = 500;
const SCROLL_THRESHOLD = 20;
const MOBILE_TODAY_INDEX = 14; // Today is at index 14 (based on -14 days start)
const MOBILE_GAP_PX = 16; // gap-4 is 16px
const INITIAL_SCROLL_DELAY_MS = 100;

interface ScheduleLog {
  id?: number;
  date: string;
  work_type: string;
  student_count?: number;
  duration_minutes?: number;
  note?: string;
  status: string;
  start_time?: string;
  end_time?: string;
  period_name?: string;
  schedule_slot_id?: number;
}

interface Props {
  scheduleDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  scheduleLogs: ScheduleLog[];
  scheduleEvents?: ScheduleEvent[];
  onDayClick: (day: Date) => void;
  schedStart: Date;
  schedEnd: Date;
}

export default function DashboardSchedule({
  scheduleDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  scheduleLogs,
  scheduleEvents = [],
  onDayClick,
  schedStart,
  schedEnd,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Desktop Wheel Navigation
  const [isScheduleScrolling, setIsScheduleScrolling] = useState(false);
  const handleScheduleWheel = (e: React.WheelEvent) => {
    if (isScheduleScrolling) return;
    if (Math.abs(e.deltaY) < SCROLL_THRESHOLD && Math.abs(e.deltaX) < SCROLL_THRESHOLD) return;

    setIsScheduleScrolling(true);
    // Vertical scroll or Horizontal scroll to change weeks
    if (e.deltaY > 0 || e.deltaX > 0) onNextWeek();
    else onPrevWeek();

    setTimeout(() => setIsScheduleScrolling(false), SCROLL_DEBOUNCE_MS);
  };

  const getDaySchedule = (date: Date) => {
    return scheduleLogs.filter((log: ScheduleLog) => isSameDay(parseISO(log.date), date));
  };

  const getDayEvents = (date: Date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return scheduleEvents.filter((event) => event.start_date <= dayStr && dayStr <= event.end_date);
  };

  // Mobile: Scroll to today logic
  const scrollToTodayMobile = () => {
    if (scrollContainerRef.current) {
      const todayIndex = MOBILE_TODAY_INDEX;
      const cardElement = scrollContainerRef.current.children[0];

      if (cardElement) {
        const cardWidth = (cardElement as HTMLElement).offsetWidth;
        const gap = MOBILE_GAP_PX;
        const containerWidth = scrollContainerRef.current.offsetWidth;
        const scrollPos = todayIndex * (cardWidth + gap) - (containerWidth - cardWidth) / 2;

        scrollContainerRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
      }
    }
  };

  // Scroll to today on mount for mobile view
  useEffect(() => {
    // Small timeout to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      scrollToTodayMobile();
    }, INITIAL_SCROLL_DELAY_MS);
    // Cleanup to prevent memory leak if component unmounts
    return () => clearTimeout(timeoutId);
  }, []);

  // Shared Day Card Component
  const DayCard = ({ day, variant = 'desktop' }: { day: Date; variant?: 'desktop' | 'mobile' }) => {
    const dayLogs = getDaySchedule(day);
    const dayEvents = getDayEvents(day);
    const isToday = isSameDay(day, new Date());
    const isDesktop = variant === 'desktop';

    // Size and style configurations
    const config = {
      container: isDesktop
        ? 'bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-[350px] cursor-pointer hover:shadow-md transition-shadow'
        : 'snap-center flex-shrink-0 w-[85vw] bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-[400px] cursor-pointer',
      header: isDesktop ? 'px-3 py-2' : 'px-4 py-3',
      dateSize: isDesktop ? 'text-sm' : 'text-lg',
      dateFormat: isDesktop ? 'd' : 'M/d',
      dayOfWeekSize: isDesktop ? 'text-xs' : 'text-sm font-bold',
      content: isDesktop ? 'p-3 custom-scrollbar' : 'p-4',
      emptyText: isDesktop ? 'text-xs' : 'text-sm',
      plusSize: isDesktop ? 14 : 16,
      plusPadding: isDesktop ? 'p-1' : 'p-1.5',
      spacing: isDesktop ? 'space-y-2' : 'space-y-3',
    };

    return (
      <div
        key={day.toString()}
        onClick={() => onDayClick(day)}
        className={`${config.container} ${isToday ? 'ring-2 ring-blue-500' : ''}`}
      >
        {/* Header */}
        <div
          className={`${config.header} flex justify-between items-center border-b ${isToday ? 'bg-blue-50' : 'bg-gray-50'}`}
        >
          <div className="flex items-baseline gap-2">
            <span
              className={`${config.dateSize} font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}
            >
              {format(day, config.dateFormat)}
            </span>
            <span className={`${config.dayOfWeekSize} ${getDayOfWeekColor(day)}`}>
              {format(day, 'E', { locale: ja })}
            </span>
          </div>
          <div className="flex gap-1">
            {isDesktop ? (
              <div className="cursor-pointer hover:bg-blue-100 p-1 rounded-full transition-colors text-blue-500">
                <div
                  className={`bg-blue-500 text-white ${config.plusPadding} rounded-full shadow-sm`}
                >
                  <Plus size={config.plusSize} />
                </div>
              </div>
            ) : (
              <div
                className={`bg-blue-500 text-white ${config.plusPadding} rounded-full shadow-sm`}
              >
                <Plus size={config.plusSize} />
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div
          className={`${config.content} flex-1 overflow-y-auto overscroll-y-contain touch-pan-y`}
          onWheel={isDesktop ? (e) => e.stopPropagation() : undefined}
        >
          {dayEvents.length > 0 && (
            <div className="space-y-1 mb-2">
              {dayEvents.map((event) => {
                const style = getScheduleEventStyle(event.event_type);
                return (
                  <div
                    key={`event-${event.id}`}
                    title={event.description || event.title}
                    className={`text-xs px-2 py-1 rounded border font-bold break-words leading-tight ${style.badge}`}
                  >
                    {event.title}
                    {event.start_time && (
                      <span className="ml-1 font-normal opacity-75">
                        {event.start_time}
                        {event.end_time ? `-${event.end_time}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {dayLogs.length === 0 && dayEvents.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className={`${config.emptyText} text-center text-gray-300`}>予定なし</p>
            </div>
          ) : (
            <div className={config.spacing}>
              {dayLogs.map((log: ScheduleLog, index: number) => (
                <ScheduleLogCard
                  key={log.id || `log-${variant}-${day.toISOString()}-${index}`}
                  log={log}
                  variant={variant}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Calendar className="text-orange-500" />
          {/* Desktop Title */}
          <span className="hidden md:inline">週間予定</span>
          {/* Mobile Title */}
          <span className="md:hidden">予定一覧</span>
        </h2>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={onToday}
            className="text-xs bg-gray-100 px-2 py-1 rounded-md font-bold text-gray-600"
            aria-label="今日に移動"
          >
            今日
          </button>
          <div className="flex items-center bg-white rounded-full shadow-sm border px-1">
            <button
              onClick={onPrevWeek}
              className="p-2 hover:bg-gray-100 rounded-full"
              aria-label="前の週"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={onNextWeek}
              className="p-2 hover:bg-gray-100 rounded-full"
              aria-label="次の週"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Mobile Controls (Jump to Today) */}
        <div className="md:hidden flex justify-end px-2">
          <button
            onClick={scrollToTodayMobile}
            className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full font-bold border border-blue-100 shadow-sm flex items-center gap-1"
            aria-label="今日に移動"
          >
            今日へ
          </button>
        </div>
      </div>

      {/* Desktop View (Weekly Grid) */}
      <div
        className="hidden md:grid md:grid-cols-7 gap-3 overscroll-y-contain"
        onWheel={handleScheduleWheel}
      >
        {eachDayOfInterval({ start: scheduleDate, end: addDays(scheduleDate, 6) }).map((day) => (
          <DayCard key={day.toString()} day={day} variant="desktop" />
        ))}
      </div>

      {/* Mobile View (Scrollable List) */}
      <div
        ref={scrollContainerRef}
        className="md:hidden flex gap-4 overflow-x-auto snap-x snap-mandatory pb-8 px-4 -mx-4 py-2 no-scrollbar overscroll-x-contain touch-manipulation"
      >
        {eachDayOfInterval({ start: schedStart, end: schedEnd }).map((day) => (
          <DayCard key={day.toString()} day={day} variant="mobile" />
        ))}
      </div>
    </div>
  );
}
