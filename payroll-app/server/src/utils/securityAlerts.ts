/**
 * 不審な動きを Discord（security）に知らせる。
 * - 管理者のログイン（どの手段でも）。心当たりのないものに気づけるように
 * - 管理者権限の付与（アプリの操作・Authentik からの反映のどちらも）
 * - 全利用者のログイン失敗の急増（使い回しのパスワードを手当たり次第に試す攻撃）
 */
import logger from './logger.js';
import { notifySecurityAlert } from './discord.js';
import { securityEventRepository } from '../repositories/securityEventRepository.js';
import type { RequestContext } from './securityLog.js';

/** 10 分間に、全利用者で何回ログインに失敗したら知らせるか */
const FAILURE_SPIKE_WINDOW_MS = 10 * 60 * 1000;
const FAILURE_SPIKE_THRESHOLD = 15;
/** 同じ知らせを何分あけるか（ワーカーごと） */
const SPIKE_COOLDOWN_MS = 60 * 60 * 1000;
let lastSpikeAlertAt = 0;

function where(ctx: RequestContext) {
  return [
    { name: 'IP', value: ctx.ip ?? '不明', inline: true },
    { name: 'ブラウザ', value: ctx.userAgent ?? '不明' },
  ];
}

export function alertAdminLogin(
  user: { id: number; username: string },
  method: string,
  ctx: RequestContext,
): void {
  notifySecurityAlert({
    title: '管理者のログイン',
    fields: [
      { name: '管理者', value: `${user.username} (#${user.id})`, inline: true },
      { name: '方法', value: method, inline: true },
      ...where(ctx),
    ],
  });
}

export function alertAdminGranted(user: { id: number; username: string }, by: string): void {
  notifySecurityAlert({
    title: '管理者権限が付与されました',
    severity: 'warning',
    fields: [
      { name: '対象', value: `${user.username} (#${user.id})`, inline: true },
      { name: '付与した操作', value: by, inline: true },
    ],
  });
}

/** ログインの失敗を記録したあとに呼ぶ。急増していれば知らせる */
export function checkLoginFailureSpike(now = Date.now()): void {
  if (now - lastSpikeAlertAt < SPIKE_COOLDOWN_MS) return;
  try {
    const since = new Date(now - FAILURE_SPIKE_WINDOW_MS).toISOString();
    const count = securityEventRepository.countSince(['login_failed', 'login_locked'], since);
    if (count < FAILURE_SPIKE_THRESHOLD) return;
    lastSpikeAlertAt = now;
    notifySecurityAlert({
      title: 'ログインの失敗が急増しています',
      severity: 'warning',
      fields: [
        { name: '直近 10 分', value: `${count} 回（全利用者）`, inline: true },
        {
          name: '確認すること',
          value:
            'パスワードの使い回しを狙った攻撃の可能性。Cloudflare のアクセスとセキュリティの記録を確かめる',
        },
      ],
    });
  } catch (err) {
    logger.warn('Login failure spike check failed', { error: (err as Error).message });
  }
}

/** テスト用 */
export function resetSecurityAlertState(): void {
  lastSpikeAlertAt = 0;
}
