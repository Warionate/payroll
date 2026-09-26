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

export const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'ユーザー名は3〜50文字である必要があります')
    .max(50, 'ユーザー名は3〜50文字である必要があります'),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type PasswordFormInput = z.infer<typeof passwordFormSchema>;
export type UsernameInput = z.infer<typeof usernameSchema>;
