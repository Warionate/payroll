// --- Schedule Patterns ---

export interface SchedulePattern {
  id: number;
  name: string;
  created_at: string;
  is_default?: number;
  is_archived?: number;
  slots: ScheduleSlot[];
}

export interface ScheduleSlot {
  id: number;
  pattern_id: number;
  day_of_week: number;
  period: number;
  start_time: string;
  end_time: string;
  label: string;
  period_name: string;
}

export interface PatternAssignment {
  id: number;
  user_id: number;
  pattern_id: number;
  start_date: string;
  end_date: string | null;
  pattern_name?: string;
}

// --- Fixed Shifts ---

export interface FixedShift {
  id: number;
  user_id: number;
  day_of_week: number;
  schedule_slot_id: number;
  student_count: number;
  is_active: number;
}
