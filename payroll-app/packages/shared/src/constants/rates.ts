/**
 * Constants for rate-related functionality
 */

/** Default rate values for new user registration */
export const DEFAULT_RATES = {
  wage_1_student: 1580,
  wage_2_students: 1680,
  wage_3_students: 1780,
  wage_4_students: 1880,
  hourly_wage: 1180,
  allowance_day: 500,
  allowance_gap: 99,
};

/** Student count labels for UI display */
export const STUDENT_LABELS = ['1名指導', '2名指導', '3名指導', '4名指導'];

/** Field names corresponding to student counts */
export const STUDENT_FIELDS = [
  'wage_1_student',
  'wage_2_students',
  'wage_3_students',
  'wage_4_students',
] as const;
