// --- Rates ---

export interface Rate {
  id: number;
  user_id: number;
  start_date: string;
  wage_1_student: number;
  wage_2_students: number;
  wage_3_students: number;
  wage_4_students: number;
  hourly_wage: number;
  allowance_day: number;
  allowance_gap: number;
  is_active: number;
}

export interface RateInput {
  start_date: string;
  wage_1_student: number;
  wage_2_students: number;
  wage_3_students: number;
  wage_4_students: number;
  hourly_wage: number;
  allowance_day: number;
  allowance_gap: number;
}

/** Rate fields that hold wage/allowance values (used in salary calculation) */
export type RateWageFields = Pick<
  Rate,
  | 'wage_1_student'
  | 'wage_2_students'
  | 'wage_3_students'
  | 'wage_4_students'
  | 'hourly_wage'
  | 'allowance_day'
  | 'allowance_gap'
>;
