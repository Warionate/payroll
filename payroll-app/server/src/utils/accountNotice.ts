/**
 * アカウントの大事な変更を、本人の確認済みメールアドレスに知らせる。
 * 心当たりのない変更（乗っ取り）に本人がすぐ気づけるようにするため。
 * メールが無い・送信が無効・送れなかったときは何もしない（変更自体は止めない）。
 */
import logger from './logger.js';
import { mailService } from '../services/mailService.js';

const SUPPORT_EMAIL = 'support@payroll.warionate.com';

export type AccountNoticeKind =
  'password_changed' | 'password_reset' | 'password_set_by_admin' | 'mfa_reset';

const NOTICES: Record<AccountNoticeKind, { subject: string; body: string }> = {
  password_changed: {
    subject: 'パスワードが変更されました',
    body: 'あなたのアカウントのパスワードが、設定画面から変更されました。',
  },
  password_reset: {
    subject: 'パスワードが再設定されました',
    body: 'あなたのアカウントのパスワードが、「パスワードを忘れた方」のリンクから再設定されました。',
  },
  password_set_by_admin: {
    subject: 'パスワードが管理者によって変更されました',
    body: 'あなたのアカウントのパスワードが、管理者によって変更されました。',
  },
  mfa_reset: {
    subject: '二段階認証がリセットされました',
    body: 'あなたのアカウントの二段階認証（パスキー・認証アプリ・回復コード・Authentik 連携）が、管理者によってリセットされました。次にログインしたときに、二段階認証を登録し直してください。',
  },
};

export function sendAccountNotice(
  user: { id: number; username: string; email: string | null; display_name?: string | null },
  kind: AccountNoticeKind,
): void {
  const email = user.email;
  if (!email || !mailService.isEnabled()) return;
  const notice = NOTICES[kind];
  const when = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  // send が同期で例外を投げても、Promise を返さなくても、変更自体は止めない
  void Promise.resolve()
    .then(() =>
      mailService.send(
        email,
        notice.subject,
        [
          `${user.display_name || user.username} さん`,
          '',
          notice.body,
          '',
          `日時: ${when}`,
          '',
          'ご自身（または依頼した管理者）による操作であれば、このメールは無視してください。',
          'すべての端末でログインし直しが必要になっています。',
          '',
          '心当たりがない場合は、すぐに管理者に連絡してください。',
          SUPPORT_EMAIL,
        ].join('\n'),
      ),
    )
    .catch((err: Error) =>
      logger.warn('Account notice mail failed', { userId: user.id, kind, error: err.message }),
    );
}
