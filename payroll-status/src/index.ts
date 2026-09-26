import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import './db/connection.js'; // Initialize DB
import { conditionalRedirect } from './middleware/redirect.js';
import { accessGuard } from './middleware/access-guard.js';
import apiRouter from './routes/api.js';
import adminRouter from './routes/admin.js';
import { startHealthCheck } from './services/health-check.js';
import { startDiscordBot } from './services/discord-bot.js';
import { notifyFatalError } from './services/discord-webhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy (Cloudflare Tunnel)
app.set('trust proxy', 1);

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // marked / DOMPurify は public/vendor に自前ホスト（CDN 依存を排除）。
        // inline <script> ブロックは使っていないので 'unsafe-inline' は不要。
        // イベント属性（onclick= 等）は使っていない。helmet 既定の script-src-attr 'none' のまま。
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  }),
);

// --- Rate limiting ---
// 公開エンドポイント (/api/status, /api/posts) は未認証で SQLite を叩く。
// 951MB / 単一プロセスの箱なので、連打で障害検知そのものが止まる構図を防ぐ。
// 単一プロセスのため payroll-app と違い SQLite ストアは不要（MemoryStore で実効値が出る）。
//
// /admin と /api/admin は Cloudflare Access で保護済みのうえ、障害対応中の管理操作が
// レート制限で弾かれると復旧の妨げになるため、対象から外している。
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/admin'),
});

app.use('/api', apiLimiter);

// Logging
morgan.token('date-jst', () =>
  new Date().toLocaleString('en-CA', { timeZone: 'Asia/Tokyo', hour12: false }).replace(',', ''),
);
// ポーリングの成功ログがアクセスログの 97%（1日 460KB）を占め、実際に見たい
// イベント（障害・エラー・管理操作）が埋もれていた。失敗は必ず残す。
// payroll-app の shouldSkipAccessLog と同じ方針。
const POLLING_PATHS = new Set(['/api/maintenance-status', '/api/status']);

const shouldSkipAccessLog = (req: Request, res: Response): boolean => {
  if (res.statusCode >= 400) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  // req.path は使えない。morgan はレスポンス完了時に評価するが、その時点では
  // マウント済みルータ（app.use('/api', ...)）が req.url を '/status' に
  // 書き換えたままなので一致しない。originalUrl は書き換えられない。
  const pathname = req.originalUrl.split('?')[0];
  return POLLING_PATHS.has(pathname);
};

app.use(
  morgan(':remote-addr [:date-jst] ":method :url" :status :res[content-length]', {
    skip: shouldSkipAccessLog,
  }),
);

// Body parsing
app.use(express.json());

// --- API Routes (before redirect) ---
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

// 未定義の /api/* は SPA フォールバック（index.html 200）に落とさず JSON 404 を返す
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Admin static files (Cloudflare Access required) ---
app.use('/admin', accessGuard);
app.use(
  '/admin',
  express.static(path.join(__dirname, '../public/admin'), {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }),
);
// Serve admin.html for /admin route
app.get('/admin', accessGuard, (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// --- Conditional Redirect ---
app.use(conditionalRedirect);

// --- Public static files (only served when redirect is OFF) ---
app.use(
  express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  }),
);

// 公開ページは / だけ。存在しない URL を 200 で返すと正常なページとして扱われる
// （検索エンジン・外形監視）ため、同じ画面を 404 で返す。
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// --- Start server ---
// 本番は cloudflared 経由でのみ公開するため 127.0.0.1 に bind する（多層防御）。
// 開発は他端末からの確認用に 0.0.0.0。payroll-app 側と揃えている。
const host = config.nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0';
const server = app.listen(config.port, host, () => {
  console.log(`[Server] Status page running on ${host}:${config.port} (${config.nodeEnv})`);

  // Start health check
  startHealthCheck();

  // Start Discord bot
  startDiscordBot().catch((err) => {
    console.error('[Discord Bot] Failed to start:', (err as Error).message);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});

// --- Fatal error handling ---
// このアプリは startHealthCheck() の setInterval と discord.js の常時接続という
// リクエスト経路の外で動く非同期処理を抱えている。そこで捕捉されない例外が出ると
// プロセスが即死し、PM2 が max_restarts を超えて諦めた場合は誰にも通知されない
// （障害通知を出す当人が死んでいるため）。終了前に必ず一報を入れる。
const FATAL_NOTIFY_TIMEOUT_MS = 3000;

async function notifyThenShutdown(reason: string, details?: string): Promise<void> {
  // 通知先が死んでいると fetch がぶら下がり、停止状態のまま残るので待ち時間を切る
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, FATAL_NOTIFY_TIMEOUT_MS);
    timer.unref();
  });

  try {
    await Promise.race([notifyFatalError({ reason, details }), timeout]);
  } catch {
    // 通知の失敗で終了処理を止めない
  }

  server.close(() => process.exit(1));
  // server.close() のコールバックが来ない場合の保険
  const forceExit = setTimeout(() => process.exit(1), FATAL_NOTIFY_TIMEOUT_MS);
  forceExit.unref();
}

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message, err.stack);
  void notifyThenShutdown(err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[Server] Unhandled rejection:', err.message, err.stack);
  void notifyThenShutdown(err.message, err.stack);
});
