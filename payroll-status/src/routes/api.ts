import { Router } from 'express';
import {
  getRecentPosts,
  getStatusSummary,
  getSetting,
  isMaintenanceActive,
} from '../services/post.js';

const router = Router();

// 公開エンドポイントは Cloudflare に 10 秒キャッシュさせ、オリジンを守る。
// /api/admin/* には絶対に付けないこと（管理画面が古い状態を掴む）。
const PUBLIC_CACHE_CONTROL = 'public, max-age=10, s-maxage=10, stale-while-revalidate=60';

/**
 * GET /api/status — 公開ページ用のステータス
 * 公開ページが使う項目だけを返す（手動固定・ダウン時刻などの運用設定は /api/admin/summary）。
 */
router.get('/status', (_req, res) => {
  const { status, redirectActive, redirectUrl, recentPosts } = getStatusSummary();
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.json({ status, redirectActive, redirectUrl, recentPosts });
});

/**
 * GET /api/posts — 投稿一覧（新しい順）
 */
router.get('/posts', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const posts = getRecentPosts(limit);
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.json({ posts });
});

/**
 * GET /api/maintenance-status — 軽量なメンテ状態エンドポイント。
 * Cloudflare Worker から短間隔でポーリングされる前提で、CDN で 10秒キャッシュする。
 *
 * maintenanceMode は Worker が「メンテ中」の文言でブロックするかどうか。
 * メンテナンスモード ON に加え、計画停止中（メンテ投稿・手動メンテ固定）に
 * サーバーが落ちている場合も true にする。そうしないとステータスページは
 * 「メンテナンス中」なのに Worker は「障害が発生しています」を出してしまう。
 * サーバーが生きている間のメンテ投稿・手動固定だけでは本体をブロックしない。
 */
router.get('/maintenance-status', (_req, res) => {
  const lastHealthStatus = getSetting('last_health_status') || 'unknown';
  const maintenanceMode =
    getSetting('maintenance_mode') === 'true' ||
    (lastHealthStatus === 'down' && isMaintenanceActive());
  res.setHeader(
    'Cache-Control',
    'public, max-age=10, s-maxage=10, stale-while-revalidate=60, stale-if-error=300',
  );
  // lastCheckAt は Worker の Cron が payroll-status 自体の死活監視に使う
  const lastCheckAt = getSetting('last_check_at') || '';
  res.json({ maintenanceMode, lastHealthStatus, lastCheckAt });
});

export default router;
