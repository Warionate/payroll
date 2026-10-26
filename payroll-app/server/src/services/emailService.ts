/**
 * Email Service - メールアドレスの確認とパスワード再設定
 *
 * - 使うのは確認済みのアドレスだけ。確認メールのリンクを踏んで初めて users.email に入る
 *   （未確認のまま使わせると、他人のアドレスを登録して再設定を悪用できる）
 * - 再設定のリンクは 30 分・1 回だけ。登録の有無は応答に出さない
 * - 再設定したら全端末のログインを切る
 * - リンクのトークンはハッシュだけを DB に保存する
 */
import crypto from 'node:crypto';
import { z } from 'zod';
import logger from '../utils/logger.js';
import { emailTokenRepository } from '../repositories/emailTokenRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { mailService } from './mailService.js';
import { authService } from './authService.js';
import { hashPassword } from '../utils/password.js';
import { recordSecurityEvent } from '../utils/securityLog.js';
import { sendAccountNotice } from '../utils/accountNotice.js';
import { isPwnedPassword, PWNED_PASSWORD_MESSAGE } from '../utils/pwnedPasswords.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
// 1人あたり 1 時間に送る上限（メールの連打・メール爆撃を防ぐ）
const MAX_MAILS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export class EmailError extends Error {}

function newToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const emailService = {
  isEnabled(): boolean {
    return mailService.isEnabled();
  },

  status(userId: number): { email: string | null; pending: string | null } {
    const user = userRepository.findById(userId);
    const pending = emailTokenRepository.pendingVerify(userId);
    return { email: user?.email ?? null, pending: pending?.email ?? null };
  },

  /** 確認メールを送る。確認されるまで users.email は変わらない */
  async requestVerification(userId: number, rawEmail: string): Promise<void> {
    const parsed = emailSchema.safeParse(rawEmail);
    if (!parsed.success) throw new EmailError('メールアドレスの形式が正しくありません');
    const email = parsed.data;

    const user = userRepository.findById(userId);
    if (!user) throw new EmailError('ユーザーが見つかりません');
    if (user.email === email) throw new EmailError('そのメールアドレスは既に登録されています');
    if (emailTokenRepository.countRecent(userId, 'verify', HOUR_MS) >= MAX_MAILS_PER_HOUR) {
      throw new EmailError(
        '確認メールの送信回数が上限に達しました。しばらくしてからお試しください',
      );
    }

    // 既に別の人が確認済みのアドレス・誰かのユーザー名と同じ文字列は、確認の時点でも断るが、
    // ここでは送らずに黙って成功を返す（そのアドレスが使われているかを探られないようにする）
    const owner = userRepository.findByEmail(email);
    if ((owner && owner.id !== userId) || userRepository.usernameTakenAsEmail(email)) {
      logger.warn(`Email verification requested for an address in use (user #${userId})`);
      return;
    }

    emailTokenRepository.deleteForUser(userId, 'verify'); // 確認待ちは最新の1つだけ
    const { token, hash } = newToken();
    emailTokenRepository.create({
      token_hash: hash,
      user_id: userId,
      purpose: 'verify',
      email,
      expires_at: new Date(Date.now() + VERIFY_TTL_MS).toISOString(),
    });
    const link = `${mailService.appUrl()}/verify-email?token=${token}`;
    await mailService.send(
      email,
      '【Payroll】メールアドレスの確認',
      [
        `${user.username} さん`,
        '',
        'Payroll にメールアドレスを登録するには、24 時間以内に次のリンクを開いてください。',
        '',
        link,
        '',
        'このメールに心当たりがない場合は、何もせずに破棄してください。',
      ].join('\n'),
    );
  },

  /** 確認リンクの処理。確認したアドレスを返す */
  confirmVerification(token: string): string {
    const row = emailTokenRepository.take(hashToken(token), 'verify');
    if (!row) throw new EmailError('リンクが無効か、有効期限が切れています');
    const owner = userRepository.findByEmail(row.email);
    if ((owner && owner.id !== row.user_id) || userRepository.usernameTakenAsEmail(row.email)) {
      throw new EmailError('このメールアドレスは使えません');
    }
    userRepository.setEmail(row.user_id, row.email);
    recordSecurityEvent(row.user_id, 'email_verified', {}, row.email);
    logger.info(`Email verified: user #${row.user_id}`);
    return row.email;
  },

  removeEmail(userId: number): void {
    userRepository.setEmail(userId, null);
    emailTokenRepository.deleteForUser(userId, 'verify');
    emailTokenRepository.deleteForUser(userId, 'reset');
    logger.info(`Email removed: user #${userId}`);
  },

  /**
   * 再設定メールを送る。アドレスが登録されていなくても何も言わない（呼び出し側は常に同じ応答を返す）
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const parsed = emailSchema.safeParse(rawEmail);
    if (!parsed.success) return;
    const user = userRepository.findByEmail(parsed.data);
    if (!user?.email) return;
    if (emailTokenRepository.countRecent(user.id, 'reset', HOUR_MS) >= MAX_MAILS_PER_HOUR) {
      logger.warn(`Password reset mail limit reached (user #${user.id})`);
      return;
    }
    const { token, hash } = newToken();
    emailTokenRepository.create({
      token_hash: hash,
      user_id: user.id,
      purpose: 'reset',
      email: user.email,
      expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    });
    const link = `${mailService.appUrl()}/reset-password?token=${token}`;
    await mailService.send(
      user.email,
      '【Payroll】パスワードの再設定',
      [
        `${user.username} さん`,
        '',
        'パスワードを再設定するには、30 分以内に次のリンクを開いてください。リンクは 1 回だけ使えます。',
        '',
        link,
        '',
        '再設定すると、すべての端末でログインし直しが必要になります。',
        'このメールに心当たりがない場合は、何もせずに破棄してください。パスワードは変わりません。',
      ].join('\n'),
    );
    logger.info(`Password reset requested: user #${user.id}`);
  },

  /** 再設定リンクの処理。新しいパスワードを設定し、全端末のログインを切る */
  async resetPassword(token: string, password: string): Promise<void> {
    // リンクを使い切る前に確かめる（漏洩済みで断ったあとも、同じリンクで選び直せるように）
    if (await isPwnedPassword(password)) throw new EmailError(PWNED_PASSWORD_MESSAGE);
    const row = emailTokenRepository.take(hashToken(token), 'reset');
    if (!row) throw new EmailError('リンクが無効か、有効期限が切れています');
    const user = userRepository.findById(row.user_id);
    // 送ったあとにアドレスを外した・変えた場合は無効にする
    if (!user || user.email !== row.email) {
      throw new EmailError('リンクが無効か、有効期限が切れています');
    }
    if (password.toLowerCase().includes(user.username.toLowerCase())) {
      throw new EmailError('パスワードにユーザー名を含めることはできません');
    }
    const hash = await hashPassword(password);
    userRepository.updatePassword(user.id, hash);
    recordSecurityEvent(user.id, 'password_reset');
    sendAccountNotice(user, 'password_reset');
    emailTokenRepository.deleteForUser(user.id, 'reset');
    authService.revokeAllUserTokens(user.id);
    logger.info(`Password reset completed: user #${user.id}`);
  },
};
