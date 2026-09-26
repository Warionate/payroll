import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { getSetting, getEffectiveStatus, isRedirectActive } from '../services/post.js';

// ステータス判定は設定5行 + 投稿50行のクエリを伴うため、ページアクセスごとに
// 実行せず短時間キャッシュする。設定変更の反映が最大 TTL 分遅れるが、
// 公開ページのポーリング間隔（30秒）より十分短いので実用上問題ない。
const DECISION_TTL_MS = 3000;
let cachedDecision: { at: number; shouldRedirect: boolean } | null = null;

function shouldRedirectNow(): boolean {
  const now = Date.now();
  if (cachedDecision && now - cachedDecision.at < DECISION_TTL_MS) {
    return cachedDecision.shouldRedirect;
  }
  const shouldRedirect = isRedirectActive(
    getSetting('redirect_enabled') === 'true',
    getEffectiveStatus(),
    getSetting('last_health_status') || 'unknown',
  );
  cachedDecision = { at: now, shouldRedirect };
  return shouldRedirect;
}

/**
 * Redirect to payroll.warionate.com when redirect is enabled AND status is operational.
 * メンテナンス中・障害中・手動 override で operational 以外の時は status ページを表示する。
 */
export function conditionalRedirect(req: Request, res: Response, next: NextFunction): void {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/css') ||
    req.path.startsWith('/js') ||
    req.path.startsWith('/vendor')
  ) {
    next();
    return;
  }

  if (shouldRedirectNow()) {
    res.redirect(302, config.redirectUrl);
    return;
  }

  next();
}
