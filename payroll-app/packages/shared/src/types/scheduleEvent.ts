// --- Schedule Events (塾内予定: 講師フォーラム / 休講 など) ---

export type ScheduleEventType = 'schedule' | 'cancel' | 'other';

export interface ScheduleEvent {
  id: number;
  title: string;
  description: string | null;
  event_type: ScheduleEventType;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  created_by: number | null;
  creator_name?: string;
  created_at: string;
  updated_at: string | null;
}

export interface CreateScheduleEventInput {
  title: string;
  description?: string | null;
  event_type?: ScheduleEventType;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
}
