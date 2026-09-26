import { CheckCircle, Users, Clock } from 'lucide-react';

interface LogProps {
  id?: number;
  work_type: string;
  status: string;
  student_count?: number;
  duration_minutes?: number;
  note?: string;
  period_name?: string;
  start_time?: string;
  end_time?: string;
  schedule_slot_id?: number;
}

export function ScheduleLogCard({
  log,
  variant = 'desktop',
}: {
  log: LogProps;
  variant?: 'desktop' | 'mobile';
}) {
  const isCompleted = log.status === 'completed';
  const isDesktop = variant === 'desktop';

  // Size classes based on variant
  const sizeClasses = {
    container: isDesktop ? 'p-2 rounded-lg text-xs' : 'p-3 rounded-xl text-sm',
    icon: isDesktop ? 12 : 16,
    spacing: isDesktop ? 'mb-1 gap-1' : 'mb-2 gap-2',
    workIcon: isDesktop ? 10 : 14,
    timeText: isDesktop ? 'text-[10px]' : 'text-xs',
    periodText: isDesktop ? '' : 'text-base',
    leadingClass: isDesktop ? 'leading-tight' : '',
  };

  // Color classes based on status and work type
  const getContainerClasses = () => {
    if (isCompleted) {
      return log.work_type === 'class'
        ? isDesktop
          ? 'bg-blue-100 border-blue-300 text-blue-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
        : isDesktop
          ? 'bg-green-100 border-green-300 text-green-800'
          : 'bg-green-50 border-green-200 text-green-800';
    }
    return isDesktop
      ? 'bg-white border-dashed border-gray-300 text-gray-500 hover:bg-gray-50'
      : 'bg-white border-dashed border-gray-300 text-gray-500';
  };

  const getWorkTypeColor = () => {
    if (!isCompleted) return 'text-gray-400';
    return log.work_type === 'class' ? 'text-blue-700' : 'text-green-700';
  };

  return (
    <div
      className={`relative ${sizeClasses.container} border shadow-sm transition-all ${getContainerClasses()}`}
    >
      <div className={`flex justify-between items-center ${sizeClasses.spacing}`}>
        <span className={`font-bold ${isCompleted ? '' : 'text-gray-600'}`}>
          {log.work_type === 'hourly' ? (
            log.note || '規定外'
          ) : (
            <div className={`flex flex-col ${sizeClasses.leadingClass}`}>
              <span className={sizeClasses.periodText}>
                {log.period_name || log.start_time?.slice(0, 5)}
              </span>
              {log.start_time && log.end_time && (
                <span
                  className={`${sizeClasses.timeText} opacity-${isDesktop ? '80' : '70'} font-normal`}
                >
                  {log.start_time.slice(0, 5)}~{log.end_time.slice(0, 5)}
                </span>
              )}
            </div>
          )}
        </span>
        {isCompleted && (
          <CheckCircle
            size={sizeClasses.icon}
            className={log.work_type === 'class' ? 'text-blue-600' : 'text-green-600'}
          />
        )}
      </div>

      {log.work_type === 'class' ? (
        <>
          <div
            className={`font-bold flex items-center ${sizeClasses.spacing} ${getWorkTypeColor()}`}
          >
            <Users size={sizeClasses.workIcon} /> {log.student_count}名
          </div>
          {log.note && (
            <div
              className={`${isDesktop ? 'text-[10px]' : 'text-xs'} opacity-75 break-words leading-tight`}
            >
              {log.note}
            </div>
          )}
        </>
      ) : (
        <div className={`font-bold flex items-center ${sizeClasses.spacing} ${getWorkTypeColor()}`}>
          <Clock size={sizeClasses.workIcon} /> {Math.floor((log.duration_minutes ?? 0) / 60)}h
          {(log.duration_minutes ?? 0) % 60}m
        </div>
      )}
    </div>
  );
}
