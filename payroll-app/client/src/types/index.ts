/**
 * Client type definitions.
 *
 * Shared types are re-exported from @payroll/shared so that existing
 * consumer imports (`from '../types'`) continue to work unchanged.
 * Client-only types are defined below.
 */

// Re-export all shared types
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
  ChatRoom,
  ChatMember,
  ChatMessage,
  Broadcast,
  BroadcastCategory,
  ScheduleEvent,
  CreateScheduleEventInput,
  ScheduleEventType,
  SalaryAdjustment,
  SalaryResult,
  AdjustmentType,
  CalendarToken,
  PushSubscriptionData,
  ApiResponse,
  ApiError,
} from '@payroll/shared';

// Import shared types for use in client-only definitions
import type { User, RateInput } from '@payroll/shared';

// --- Client-only types ---

// --- User & Auth ---
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  maintenance: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  /** パスキーでログインする（ユーザー名は不要）。取り消されたときは cancelled: true */
  loginWithPasskey: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  logout: () => Promise<void>;
  register: (
    username: string,
    password: string,
    rates: RateInput,
    email?: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    details?: string;
    /** 確認メールを送れたか（メール機能が無効・未入力なら false） */
    emailVerificationSent?: boolean;
  }>;
  updateUser: (updates: Partial<User>) => void;
}

// --- Push Notifications (client-specific alias) ---
export type { PushSubscriptionData as PushSubscription } from '@payroll/shared';

// --- Confirm Modal ---
export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  showCancel?: boolean;
}

export type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

// --- Link Parse ---
export interface LinkPart {
  type: 'text' | 'link' | 'image' | 'file';
  content: string;
  filename?: string;
  expiresAt?: Date | null;
  isExpired?: boolean;
}
