import { z, type ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import {
  passwordSchema,
  loginSchema,
  updatePasswordSchema,
  usernameSchema,
  COMMON_PASSWORDS,
  ratesSchema,
  salaryAdjustmentSchema,
  BROADCAST_CATEGORIES,
} from '@payroll/shared';

// ── Generic Zod validation middleware ──────────────────────────────

/**
 * Validate `req.body` against a Zod schema.
 * On success, `req.body` is replaced with the parsed (coerced / trimmed) result.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: '入力内容に誤りがあります',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate `req.params` against a Zod schema (for param-level validation like :id).
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: '入力内容に誤りがあります',
        details: result.error.flatten(),
      });
      return;
    }
    next();
  };
}

/**
 * Validate `req.query` against a Zod schema.
 * Express 5 の req.query は getter のため再代入はしない（検証のみ）。
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: '入力内容に誤りがあります',
        details: result.error.flatten(),
      });
      return;
    }
    next();
  };
}

// ── Shared helpers ─────────────────────────────────────────────────

const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

// Re-export shared schemas
export { passwordSchema, COMMON_PASSWORDS };

// ── Auth schemas ───────────────────────────────────────────────────

export const loginValidation = loginSchema;

const optionalRatesSchema = z
  .object({
    start_date: z.string().date('開始日は有効な日付である必要があります'),
    wage_1_student: z.coerce
      .number()
      .int()
      .min(0, '1名指導の単価は0以上の整数である必要があります'),
    wage_2_students: z.coerce
      .number()
      .int()
      .min(0, '2名指導の単価は0以上の整数である必要があります'),
    wage_3_students: z.coerce
      .number()
      .int()
      .min(0, '3名指導の単価は0以上の整数である必要があります'),
    wage_4_students: z.coerce
      .number()
      .int()
      .min(0, '4名指導の単価は0以上の整数である必要があります'),
    hourly_wage: z.coerce.number().int().min(0, '時給は0以上の整数である必要があります'),
    allowance_day: z.coerce.number().int().min(0, '日額手当は0以上の整数である必要があります'),
    allowance_gap: z.coerce.number().int().min(0, '授業間手当は0以上の整数である必要があります'),
  })
  .nullable()
  .optional();

export const registerValidation = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'ユーザー名は3〜50文字である必要があります')
      .max(50, 'ユーザー名は3〜50文字である必要があります'),
    password: passwordSchema,
    rates: optionalRatesSchema,
    // メール送信が有効な環境では必須（authController.register で判定）。確認メールのリンクで有効になる
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('メールアドレスの形式が正しくありません')
      .max(254)
      .optional(),
  })
  .refine((data) => !data.password.toLowerCase().includes(data.username.toLowerCase()), {
    message: 'パスワードにユーザー名を含めることはできません',
    path: ['password'],
  })
  .refine((data) => !COMMON_PASSWORDS.includes(data.password.toLowerCase()), {
    message: 'そのパスワードは使用できません（推測されやすいパスワードです）',
    path: ['password'],
  });

export const updatePasswordValidation = updatePasswordSchema;

export const updateProfileValidation = usernameSchema;

// ── Rates ──────────────────────────────────────────────────────────

export const ratesValidation = ratesSchema;

// ── Work Logs ──────────────────────────────────────────────────────

export const workLogValidation = z
  .object({
    date: z.string().date('日付は有効な日付である必要があります'),
    work_type: z.enum(['class', 'non-regular', 'hourly'], { message: '無効な勤務タイプです' }),
    schedule_slot_id: z.coerce
      .number()
      .int()
      .min(1, 'schedule_slot_idは1以上の整数である必要があります')
      .nullable()
      .optional(),
    student_count: z.coerce
      .number()
      .int()
      .min(1)
      .max(4, 'student_countは1〜4の整数である必要があります')
      .nullable()
      .optional(),
    duration_minutes: z.coerce
      .number()
      .int()
      .min(0, 'duration_minutesは0以上の整数である必要があります')
      .nullable()
      .optional(),
    note: z.string().max(500, 'メモは500文字以内である必要があります').nullable().optional(),
    status: z
      .enum(['planned', 'confirmed', 'completed'], { message: '無効なステータスです' })
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      if (data.work_type === 'class') {
        if (data.schedule_slot_id == null) return false;
      }
      return true;
    },
    { message: 'class勤務ではschedule_slot_idが必須です', path: ['schedule_slot_id'] },
  )
  .refine(
    (data) => {
      if (data.work_type === 'class') {
        if (data.student_count == null) return false;
      }
      return true;
    },
    { message: 'class勤務ではstudent_countが必須です', path: ['student_count'] },
  )
  .refine(
    (data) => {
      if (data.work_type === 'hourly' || data.work_type === 'non-regular') {
        if (data.duration_minutes == null) return false;
      }
      return true;
    },
    { message: '規定外勤務ではduration_minutesが必須です', path: ['duration_minutes'] },
  );

// GET /api/work_logs の期間は必須かつ上限あり。無指定だと全行を返してしまい、
// データ増加に伴いレスポンス/メモリが肥大する（負荷テストで確認）。クライアントは
// 常に期間を渡すため、必須化しても通常利用には影響しない。
export const workLogQueryValidation = z
  .object({
    start_date: z.string().date('開始日は有効な日付である必要があります'),
    end_date: z.string().date('終了日は有効な日付である必要があります'),
  })
  .refine((d) => d.start_date <= d.end_date, {
    message: '開始日は終了日以前である必要があります',
    path: ['start_date'],
  })
  // 上限は給与履歴画面の最大取得範囲（前年12/1〜当年12/15、うるう年隣接で最大380日）を
  // 許容しつつ全件取得を防ぐ値。これ未満にすると履歴が全月¥0になる回帰が起きる。
  .refine((d) => (Date.parse(d.end_date) - Date.parse(d.start_date)) / 86_400_000 <= 400, {
    message: '期間は400日以内で指定してください',
    path: ['end_date'],
  });

export const workLogStatusValidation = z.object({
  status: z.enum(['planned', 'confirmed', 'completed'], { message: '無効なステータスです' }),
});

export const workLogBulkSaveValidation = z.object({
  date: z.string().date('日付は有効な日付である必要があります'),
  classes: z
    .array(
      z.object({
        schedule_slot_id: z.coerce.number().int().min(1, 'schedule_slot_idは必須です'),
        student_count: z.coerce
          .number()
          .int()
          .min(1)
          .max(4, 'student_countは1〜4の整数です')
          .nullable()
          .optional(),
        note: z.string().max(500, 'メモは500文字以内である必要があります').nullable().optional(),
        status: z
          .enum(['planned', 'confirmed', 'completed'], { message: '無効なステータスです' })
          .nullable()
          .optional(),
      }),
    )
    .min(0)
    .max(200, 'classesは配列である必要があります'),
  managed_slot_ids: z
    .array(z.coerce.number().int().min(1, 'managed_slot_idsは数値IDの配列です'))
    .min(0)
    .max(200)
    .nullable()
    .optional(),
});

export const workLogCompleteAllValidation = z
  .object({
    start_date: z.string().date('開始日は有効な日付である必要があります'),
    end_date: z.string().date('終了日は有効な日付である必要があります'),
  })
  .refine((data) => data.start_date <= data.end_date, {
    message: '開始日は終了日以前である必要があります',
    path: ['start_date'],
  });

// ── Schedule Patterns ──────────────────────────────────────────────

export const patternValidation = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'パターン名は1〜50文字である必要があります')
    .max(50, 'パターン名は1〜50文字である必要があります'),
});

export const patternUpdateValidation = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'パターン名は1〜50文字である必要があります')
    .max(50, 'パターン名は1〜50文字である必要があります'),
});

export const patternArchiveValidation = z.object({
  archived: z.boolean(),
});

export const idParamValidation = z.object({
  id: z.coerce.number().int().min(1, '無効なIDです'),
});

export const applyFixedShiftsValidation = z.object({
  year: z.coerce.number().int().min(2000, '無効な年です').max(2100, '無効な年です'),
  month: z.coerce.number().int().min(1, '無効な月です').max(12, '無効な月です'),
});

export const roomIdParamValidation = z.object({
  roomId: z.coerce.number().int().min(1, '無効なルームIDです'),
});

export const roomMemberParamValidation = z.object({
  roomId: z.coerce.number().int().min(1, '無効なルームIDです'),
  userId: z.coerce.number().int().min(1, '無効なユーザーIDです'),
});

export const slotValidation = z.object({
  pattern_id: z.coerce.number().int().min(1, 'パターンIDは必須です'),
  period_name: z
    .string()
    .trim()
    .min(1, 'コマ名は1〜20文字である必要があります')
    .max(20, 'コマ名は1〜20文字である必要があります'),
  start_time: z.string().regex(timeRegex, '開始時刻の形式が無効です'),
  end_time: z.string().regex(timeRegex, '終了時刻の形式が無効です'),
});

export const slotUpdateValidation = z.object({
  period_name: z
    .string()
    .trim()
    .min(1, 'コマ名は1〜20文字である必要があります')
    .max(20, 'コマ名は1〜20文字である必要があります'),
  start_time: z.string().regex(timeRegex, '開始時刻の形式が無効です'),
  end_time: z.string().regex(timeRegex, '終了時刻の形式が無効です'),
});

export const bulkSlotValidation = z.object({
  pattern_id: z.coerce.number().int().min(1, 'パターンIDは必須です'),
  slots: z
    .array(
      z.object({
        period_name: z
          .string()
          .trim()
          .min(1, 'コマ名は1〜20文字である必要があります')
          .max(20, 'コマ名は1〜20文字である必要があります'),
        start_time: z.string().regex(timeRegex, '開始時刻の形式が無効です'),
        end_time: z.string().regex(timeRegex, '終了時刻の形式が無効です'),
      }),
    )
    .min(1, 'スロットは1〜20件である必要があります')
    .max(20, 'スロットは1〜20件である必要があります'),
});

export const patternAssignmentValidation = z.object({
  start_date: z.string().date('開始日は有効な日付である必要があります'),
  end_date: z.string().date('終了日は有効な日付である必要があります'),
  pattern_id: z.coerce.number().int().min(1, 'パターンIDは必須です'),
  user_id: z.coerce.number().int().optional(),
});

// ── Chat ───────────────────────────────────────────────────────────

export const chatMessageValidation = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'メッセージは1〜10000文字である必要があります')
    .max(10000, 'メッセージは1〜10000文字である必要があります'),
});

export const chatRoomValidation = z.object({
  memberIds: z
    .array(z.number().int().min(1, '無効なユーザーIDです'))
    .min(1, 'メンバーを1人以上選択してください')
    .max(100, 'メンバーは100人まで指定できます'),
  name: z
    .string()
    .trim()
    .max(100, 'ルーム名は100文字以内である必要があります')
    .optional()
    .or(z.literal('')),
  expiresAt: z.string().nullable().optional(),
});

// ── Broadcasts ─────────────────────────────────────────────────────

export const broadcastValidation = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, 'メッセージは1〜10000文字である必要があります')
      .max(10000, 'メッセージは1〜10000文字である必要があります'),
    title: z.string().trim().max(200, 'タイトルは200文字以内である必要があります').optional(),
    category: z.enum(BROADCAST_CATEGORIES, { message: '無効なカテゴリです' }).optional(),
    expires_at: z.string().nullable().optional(),
    send_push: z.boolean().optional(),
    show_on_open: z.boolean().optional(),
  })
  .transform(({ expires_at, send_push, show_on_open, ...rest }) => ({
    ...rest,
    expiresAt: expires_at,
    sendPush: send_push,
    showOnOpen: show_on_open,
  }));

// ── Salary Adjustments ─────────────────────────────────────────────

export const salaryAdjustmentValidation = salaryAdjustmentSchema;

// ── Schedule Events (塾内予定) ─────────────────────────────────────

export const scheduleEventValidation = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'タイトルは1〜100文字である必要があります')
      .max(100, 'タイトルは1〜100文字である必要があります'),
    description: z
      .string()
      .trim()
      .max(1000, '詳細は1000文字以内である必要があります')
      .nullable()
      .optional(),
    event_type: z.enum(['schedule', 'cancel', 'other'], { message: '無効な種別です' }).optional(),
    start_date: z.string().date('開始日は有効な日付である必要があります'),
    end_date: z.string().date('終了日は有効な日付である必要があります'),
    start_time: z.string().regex(timeRegex, '開始時刻の形式が無効です').nullable().optional(),
    end_time: z.string().regex(timeRegex, '終了時刻の形式が無効です').nullable().optional(),
  })
  .refine((data) => data.start_date <= data.end_date, {
    message: '終了日は開始日以降である必要があります',
    path: ['end_date'],
  })
  .refine(
    (data) => {
      if (data.start_time && data.end_time && data.start_date === data.end_date) {
        return data.start_time <= data.end_time;
      }
      return true;
    },
    { message: '終了時刻は開始時刻以降である必要があります', path: ['end_time'] },
  );

// ── Announcements (legacy) ─────────────────────────────────────────

export const announcementValidation = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'タイトルは1〜200文字である必要があります')
    .max(200, 'タイトルは1〜200文字である必要があります'),
  content: z
    .string()
    .trim()
    .min(1, '内容は1〜5000文字である必要があります')
    .max(5000, '内容は1〜5000文字である必要があります'),
  priority: z.enum(['normal', 'high', 'urgent'], { message: '無効な優先度です' }).optional(),
});
