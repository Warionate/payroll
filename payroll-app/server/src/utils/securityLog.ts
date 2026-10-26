/**
 * セキュリティに関わる出来事の記録（security_events）。本人が設定画面で見る。
 * 記録に失敗しても本来の処理は止めない。
 */
import logger from './logger.js';
import { securityEventRepository } from '../repositories/securityEventRepository.js';
import { checkLoginFailureSpike } from './securityAlerts.js';

export type SecurityEventType =
  | 'login' // detail: password / passkey / oidc
  | 'login_failed'
  | 'login_locked' // ユーザー名ごとの失敗回数が上限に達した
  | 'admin_mfa_blocked' // 管理者がパスワードだけでログインしようとした
  | 'new_device'
  | 'reauth'
  | 'reauth_failed'
  | 'session_revoked'
  | 'password_changed'
  | 'password_reset'
  | 'passkey_added'
  | 'passkey_removed'
  | 'email_verified'
  | 'email_removed'
  | 'oidc_linked'
  | 'oidc_unlinked'
  | 'role_changed'
  | 'totp_enabled'
  | 'totp_disabled'
  | 'recovery_codes_regenerated'
  | 'recovery_code_used'
  | 'password_only_blocked'
  | 'login_id_changed'
  | 'mfa_reset' // 管理者が二段階認証の手段をすべて外した
  | 'device_trusted' // この端末では認証アプリのコードを求めない
  | 'trusted_devices_cleared'; // 二つ目の手段を持つ人がパスワードだけでログインしようとした

/** リクエストから取り出した、記録と端末判定に使う情報 */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
}

export function recordSecurityEvent(
  userId: number,
  type: SecurityEventType,
  ctx: RequestContext = {},
  detail?: string,
): void {
  try {
    securityEventRepository.create({
      user_id: userId,
      type,
      ip: ctx.ip ?? null,
      user_agent: ctx.userAgent ? ctx.userAgent.slice(0, 300) : null,
      detail: detail ?? null,
      created_at: new Date().toISOString(),
    });
    if (type === 'login_failed' || type === 'login_locked') checkLoginFailureSpike();
  } catch (err) {
    logger.warn('Failed to record security event', {
      userId,
      type,
      error: (err as Error).message,
    });
  }
}
