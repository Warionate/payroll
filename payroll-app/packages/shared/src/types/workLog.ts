// --- Work Logs ---

export type WorkType = 'class' | 'hourly';
export type WorkLogStatus = 'planned' | 'completed';

export interface WorkLog {
  id: number;
  user_id: number;
  date: string;
  slot_id: number | null;
  work_type: WorkType;
  student_count: number | null;
  duration_minutes: number | null;
  note: string;
  status: WorkLogStatus;
  created_at: string;
}

export interface WorkLogWithAmount extends WorkLog {
  amount: number;
}

export interface AllowanceLog {
  id: string;
  date: string;
  work_type: 'allowance';
  note: string;
  amount: number;
  status: 'planned' | 'completed';
}

export type LogWithAmount = WorkLogWithAmount | AllowanceLog;

export interface CreateWorkLogInput {
  date: string;
  slot_id?: number | null;
  work_type: WorkType;
  student_count?: number;
  duration_minutes?: number;
  note?: string;
  status?: WorkLogStatus;
}
