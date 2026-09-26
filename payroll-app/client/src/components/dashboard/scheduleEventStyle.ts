import type { ScheduleEventType } from '../../types';

export interface ScheduleEventTypeStyle {
  label: string;
  badge: string;
}

const STYLES: Record<ScheduleEventType, ScheduleEventTypeStyle> = {
  schedule: {
    label: '予定',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  cancel: {
    label: '休講',
    badge: 'bg-red-100 text-red-800 border-red-200',
  },
  other: {
    label: 'その他',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
  },
};

export const SCHEDULE_EVENT_TYPES: ScheduleEventType[] = ['schedule', 'cancel', 'other'];

export function getScheduleEventStyle(
  type?: ScheduleEventType | string | null,
): ScheduleEventTypeStyle {
  if (type && type in STYLES) return STYLES[type as ScheduleEventType];
  return STYLES.other;
}
