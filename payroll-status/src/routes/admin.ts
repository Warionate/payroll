import { Router } from 'express';
import { accessGuard } from '../middleware/access-guard.js';
import {
  updatePost,
  deletePost,
  getPost,
  getSetting,
  setSetting,
  setMaintenanceMode,
  getStatusSummary,
  getActivePosts,
} from '../services/post.js';
import { config } from '../config.js';
import { submitPost, resolveIncident } from '../services/post-submit.js';
import { runManualHealthCheck } from '../services/health-check.js';

const router = Router();

// All admin routes require Cloudflare Access
router.use(accessGuard);

// 認証は Cookie（CF_Authorization）だけで通るため、他サイトのフォーム POST から
// 本文なしの toggle 系 API を叩かれうる。状態を変えるリクエストにはカスタムヘッダーを
// 要求する（カスタムヘッダー付きのクロスサイトリクエストは CORS のプリフライトで止まる）。
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }
  if (req.get('X-Admin-Request') !== '1') {
    res.status(403).json({ error: 'X-Admin-Request ヘッダーが必要です' });
    return;
  }
  next();
});

// Cloudflare Access 通過者しか叩けないが、投稿内容は公開フィードに
// 表示されるため、型・長さは多層防御としてサーバー側でも検証する
const ALLOWED_TYPES = ['incident', 'maintenance', 'update', 'resolved'];
const ALLOWED_STATUSES = ['none', 'scheduled', 'investigating', 'identified', 'monitoring', 'resolved'];
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 10000;

function validatePostInput(body: {
  type?: unknown;
  status?: unknown;
  title?: unknown;
  content?: unknown;
}): string | null {
  if (body.type !== undefined && !ALLOWED_TYPES.includes(body.type as string)) {
    return `type は ${ALLOWED_TYPES.join('|')} のいずれか`;
  }
  if (
    body.status !== undefined &&
    body.status !== null &&
    !ALLOWED_STATUSES.includes(body.status as string)
  ) {
    return `status は ${ALLOWED_STATUSES.join('|')} のいずれか`;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.length === 0) return 'title は必須です';
    if (body.title.length > MAX_TITLE_LENGTH) return `title は${MAX_TITLE_LENGTH}文字以内`;
  }
  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.length === 0)
      return 'content は必須です';
    if (body.content.length > MAX_CONTENT_LENGTH) return `content は${MAX_CONTENT_LENGTH}文字以内`;
  }
  return null;
}

/**
 * 管理画面用のサマリー。公開用の項目に加えて、表示ステータスの理由を説明するための
 * 進行中の投稿（件数で切らない）と、ヘルスチェックの途中経過を返す。
 */
function getAdminSummary() {
  return {
    ...getStatusSummary(),
    activePosts: getActivePosts(),
    healthCheck: {
      consecutiveFailures: Number(getSetting('consecutive_failures') || '0'),
      consecutiveSuccesses: Number(getSetting('consecutive_successes') || '0'),
      failureThreshold: Math.max(1, config.consecutiveFailuresThreshold),
      recoveryThreshold: Math.max(1, config.recoverySuccessThreshold),
      // メンテ中に検知したダウン（障害として扱っていない）
      plannedDowntime: getSetting('down_suppressed') === 'true',
    },
  };
}

/**
 * GET /api/admin/summary — 管理用サマリー
 */
router.get('/summary', (_req, res) => {
  res.json(getAdminSummary());
});

/**
 * POST /api/admin/posts — 新規投稿
 */
router.post('/posts', (req, res) => {
  const { type, status, title, content } = req.body;

  if (!type || !title || !content) {
    res.status(400).json({ error: 'type, title, content は必須です' });
    return;
  }

  const validationError = validatePostInput({ type, status, title, content });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const post = submitPost({ type, status, title, content, source: 'admin' });
  res.status(201).json(post);
});

/**
 * PUT /api/admin/posts/:id — 投稿更新
 */
router.put('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const { type, status, title, content } = req.body;

  const validationError = validatePostInput({ type, status, title, content });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const existing = getPost(id);
  if (!existing) {
    res.status(404).json({ error: '投稿が見つかりません' });
    return;
  }

  const updated = updatePost(id, {
    ...(type && { type }),
    ...(status && { status }),
    ...(title && { title }),
    ...(content && { content }),
  });

  res.json(updated);
});

/**
 * DELETE /api/admin/posts/:id — 投稿削除
 */
router.delete('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const deleted = deletePost(id);

  if (!deleted) {
    res.status(404).json({ error: '投稿が見つかりません' });
    return;
  }

  res.json({ success: true });
});

/**
 * POST /api/admin/set-redirect — リダイレクトを明示的に設定
 */
router.post('/set-redirect', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) は必須です' });
    return;
  }
  setSetting('redirect_enabled', String(enabled));
  // 手動操作なので、復旧時の自動 ON 対象から外す
  setSetting('redirect_auto_disabled', 'false');
  res.json({ redirectEnabled: enabled });
});

/**
 * POST /api/admin/set-maintenance — メンテナンスモードを明示的に設定
 */
router.post('/set-maintenance', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) は必須です' });
    return;
  }
  res.json({ maintenanceMode: setMaintenanceMode(enabled) });
});

/**
 * POST /api/admin/set-status-override — 表示ステータスを手動で上書き
 */
router.post('/set-status-override', (req, res) => {
  const { value } = req.body;
  const allowed = ['auto', 'operational', 'incident', 'maintenance'];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    res.status(400).json({ error: `value は ${allowed.join('|')} のいずれか` });
    return;
  }
  setSetting('status_override', value);
  res.json({ statusOverride: value });
});

/**
 * POST /api/admin/posts/:id/resolve — 障害を解決済みにする
 * body: { message?: string（指定で復旧投稿を作成）, resumeRedirect?: boolean }
 */
router.post('/posts/:id/resolve', (req, res) => {
  const id = Number(req.params.id);
  const { message, resumeRedirect } = req.body ?? {};

  if (message !== undefined && message !== null) {
    if (typeof message !== 'string') {
      res.status(400).json({ error: 'message は文字列です' });
      return;
    }
    if (message.length > MAX_CONTENT_LENGTH) {
      res.status(400).json({ error: `message は${MAX_CONTENT_LENGTH}文字以内` });
      return;
    }
  }
  if (resumeRedirect !== undefined && typeof resumeRedirect !== 'boolean') {
    res.status(400).json({ error: 'resumeRedirect は boolean です' });
    return;
  }

  const result = resolveIncident({
    id,
    message,
    resumeRedirect: resumeRedirect ?? false,
    source: 'admin',
  });
  if (!result.ok) {
    res.status(result.code === 'not_found' ? 404 : 409).json({ error: result.error });
    return;
  }
  res.json(result);
});

/**
 * POST /api/admin/health-check — 手動ヘルスチェック実行
 * 結果は probe で返す。手動実行は連続失敗回数・ダウン判定に数えない。
 */
router.post('/health-check', async (_req, res) => {
  const failureReason = await runManualHealthCheck();
  res.json({ ...getAdminSummary(), probe: { ok: failureReason === null, reason: failureReason } });
});

export default router;
