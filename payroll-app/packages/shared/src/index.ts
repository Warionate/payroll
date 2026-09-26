/**
 * @payroll/shared — Shared types, schemas, utilities and constants
 *
 * This package provides the single source of truth for types, validation
 * schemas, business logic and constants used by both server and client.
 */

// Types
export type {
  User,
  UserRole,
  Rate,
  RateInput,
  RateWageFields,
  WorkLog,
  WorkLogWithAmount,
  AllowanceLog,
  LogWithAmount,
  CreateWorkLogInput,
  WorkType,
  WorkLogStatus,
  SchedulePattern,
  ScheduleSlot,
  PatternAssignment,
  FixedShift,
  ScheduleEvent,
  CreateScheduleEventInput,
  ScheduleEventType,
  ChatRoom,
  ChatMember,
  ChatMessage,
  Broadcast,
  BroadcastCategory,
  SalaryAdjustment,
  SalaryResult,
  AdjustmentType,
  CalendarToken,
  PushSubscriptionData,
  ApiResponse,
  ApiError,
} from './types/index.js';

// Schemas
export {
  passwordSchema,
  loginSchema,
  updatePasswordSchema,
  passwordFormSchema,
  usernameSchema,
  COMMON_PASSWORDS,
  ratesSchema,
  salaryAdjustmentSchema,
} from './schemas/index.js';

export type {
  LoginInput,
  UpdatePasswordInput,
  PasswordFormInput,
  UsernameInput,
  RatesSchemaInput,
  SalaryAdjustmentSchemaInput,
} from './schemas/index.js';

// Utils
export {
  stripMarkdown,
  getRateForDate,
  getWageByStudentCount,
  calculateDayAllowance,
  calculateHourlyWage,
  getSalaryPeriod,
  calculateSalary,
  calculateDailyEarnings,
} from './utils/index.js';

// Constants
export {
  SALARY_PERIOD_START_DAY,
  SALARY_PERIOD_END_DAY,
  ADJUSTMENT_TYPE_LABELS,
  DEFAULT_RATES,
  STUDENT_LABELS,
  STUDENT_FIELDS,
  BROADCAST_CATEGORIES,
  DEFAULT_BROADCAST_CATEGORY,
} from './constants/index.js';
