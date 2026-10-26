import { z } from 'zod';

// ── Shared password helpers ────────────────────────────────────────

export const COMMON_PASSWORDS = ['password', '123456', '12345678', 'admin', 'qwerty', 'payroll'];

export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上である必要があります')
  .regex(/[A-Za-z]/, 'パスワードには英字を含める必要があります')
  .regex(/[0-9!@#$%^&*]/, 'パスワードには数字または記号を含める必要があります');

// ── Login / Register schemas ───────────────────────────────────────

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'ユーザー名は必須です'),
  password: z.string().min(1, 'パスワードは必須です'),
});

export const updatePasswordSchema = z.object({
  password: passwordSchema,
  currentPassword: z.string().optional(),
});

/** Client-side password form with currentPassword + confirmPassword */
export const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

// ── ユーザー ID と表示名 ─────────────────────────────────────────────
// ユーザー ID はログインに使う。英小文字・数字・「.」「_」「-」だけにする（@ を含めないので
// メールアドレスと取り違えない・見た目の似た文字でなりすませない）。画面に出す名前は表示名で別に持つ

export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const LOGIN_ID_RULE = '英小文字・数字・「.」「_」「-」の3〜32文字（先頭は英小文字か数字）';

export function isValidLoginId(value: string): boolean {
  return LOGIN_ID_PATTERN.test(value);
}

export const loginIdField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(LOGIN_ID_PATTERN, `ユーザーIDは${LOGIN_ID_RULE}にしてください`);

export const displayNameField = z
  .string()
  .trim()
  .min(1, '表示名を入力してください')
  .max(50, '表示名は50文字以内にしてください')
  // 制御文字・書式文字（右から左への上書き等）は見た目を偽れるので断る
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, '表示名に使えない文字が含まれています');

/** ユーザー ID の変更 */
export const usernameSchema = z.object({ username: loginIdField });

/** 表示名の変更 */
export const displayNameSchema = z.object({ display_name: displayNameField });

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type PasswordFormInput = z.infer<typeof passwordFormSchema>;
export type UsernameInput = z.infer<typeof usernameSchema>;
export type DisplayNameInput = z.infer<typeof displayNameSchema>;
