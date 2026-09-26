import './env.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cluster from 'node:cluster';
import os from 'node:os';

import db from './db.js';
import logger, { stream as loggerStream } from './utils/logger.js';
import { createGracefulShutdownHandler } from './utils/gracefulShutdown.js';
import { errorHandler, notFoundHandler } from './utils/errors.js';
import { notifyRateLimitExceeded, notifyFatalProcessError } from './utils/discord.js';
import { setupSwagger } from './swagger.js';
import initScheduler from './scheduler.js';
import { uploadAccessMiddleware } from './middleware/uploadAccess.js';
import { requestId } from './middleware/requestId.js';
import { authenticateToken } from './middleware/auth.js';
import cache, { isCacheInvalidateMessage } from './utils/cache.js';
import { maskCalendarTokenInUrl } from './utils/logMask.js';
import authRouter from './routes/auth.js';
import ratesRouter from './routes/rates.js';
import workLogsRouter from './routes/work_logs.js';
import fixedShiftsRouter from './routes/fixed_shifts.js';
import calendarRouter from './routes/calendar.js';
import patternsRouter from './routes/patterns.js';
import usersRouter from './routes/users.js';
import chatRouter from './routes/chat/index.js';
import notificationsRouter from './routes/notifications.js';
import salaryAdjustmentsRouter from './routes/salary_adjustments.js';
import uploadsRouter from './routes/uploads.js';
import pdfRouter from './routes/pdf.js';
import scheduleEventsRouter from './routes/schedule_events.js';
import { createSqliteRateLimitStore } from './utils/rateLimitStore.js';

import type { Request, Response, NextFunction } from 'express';

const PORT = Number(process.env.PORT) || 4001;

// --- Primary Process (Production Only) ---
if (process.env.NODE_ENV === 'production' && cluster.isPrimary) {
  const numCPUs = os.cpus().length;

  // WebSocket 撤去後は素の node cluster を使う。各ワーカーが同一ポートで listen し、
  // primary が接続を round-robin（node のデフォルト SCHED_RR）で分配する。以前は
  // @socket.io/sticky が primary で httpServer を持ちスティッキールーティングしていたが、
  // Socket.IO を廃止したため不要（HTTP は元々ステートレスで、どのワーカーが処理してもよい）。
  // serialization:'advanced' はワーカー間のキャッシュ無効化 IPC を構造化クローンで運ぶため維持。
  cluster.setupPrimary({
    serialization: 'advanced',
  });

  logger.info(`Primary ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // ワーカーのクラッシュループ対策:
  // 起動直後に必ず死ぬ状態（env 不備・DB 破損等）で無条件・無遅延に再フォークすると
  // CPU スピンとワーカーごとの Discord 通知スパムになる。直近 1 分間の exit 回数を数え、
  // しきい値を超えたら primary ごと終了して PM2 の再起動制御（max_restarts）に委ねる。
  const WORKER_EXIT_WINDOW_MS = 60_000;
  const MAX_WORKER_EXITS_PER_WINDOW = numCPUs * 5;
  const REFORK_DELAY_MS = 1000;
  const workerExitTimes: number[] = [];
  let crashLoopShutdown = false;

  cluster.on('exit', (worker, code, signal) => {
    if (crashLoopShutdown) return;

    const now = Date.now();
    workerExitTimes.push(now);
    while (workerExitTimes.length > 0 && workerExitTimes[0] <= now - WORKER_EXIT_WINDOW_MS) {
      workerExitTimes.shift();
    }

    if (workerExitTimes.length >= MAX_WORKER_EXITS_PER_WINDOW) {
      crashLoopShutdown = true;
      logger.error(
        `Workers are crash-looping (${workerExitTimes.length} exits in ${WORKER_EXIT_WINDOW_MS / 1000}s). Exiting primary — PM2 will restart.`,
      );
      void Promise.race([
        notifyFatalProcessError({
          reason: 'ワーカークラッシュループ',
          details: `${WORKER_EXIT_WINDOW_MS / 1000}秒間に ${workerExitTimes.length} 回ワーカーが終了したため、primary を終了して PM2 の再起動制御に委ねます。`,
        }),
        new Promise((resolve) => setTimeout(resolve, 3000).unref()),
      ]).finally(() => process.exit(1));
      return;
    }

    // 直近の exit が多い場合は少し待ってから再フォーク（ホットループの抑制）
    const delay = workerExitTimes.length > numCPUs ? REFORK_DELAY_MS : 0;
    logger.warn(
      `Worker ${worker.process.pid} died (code=${code}, signal=${signal ?? 'none'}). Forking new one${delay > 0 ? ` in ${delay}ms` : ''}.`,
    );
    if (delay > 0) {
      setTimeout(() => {
        if (!crashLoopShutdown) cluster.fork();
      }, delay);
    } else {
      cluster.fork();
    }
  });

  // Relay cache invalidation messages from one worker to all others
  // (each worker holds its own in-memory cache — see utils/cache.ts)
  cluster.on('message', (sender, message: unknown) => {
    if (isCacheInvalidateMessage(message)) {
      for (const worker of Object.values(cluster.workers ?? {})) {
        if (worker && worker.id !== sender.id) {
          worker.send(message);
        }
      }
    }
  });

  // PM2 stop/restart sends SIGINT (then SIGKILL after kill_timeout — set in
  // ecosystem.config.cjs to outlast this grace period). Without a handler the
  // default action kills the primary instantly and in-flight requests on the
  // workers are dropped. Disconnect workers so their servers close and drain
  // first; cache/rate-limit timers are unref'd so drained workers exit on
  // their own.
  let signalShutdownStarted = false;
  const shutdownPrimaryOnSignal = (signal: string): void => {
    if (signalShutdownStarted) return;
    signalShutdownStarted = true;
    crashLoopShutdown = true; // suppress reforking of workers exiting during shutdown
    logger.info(`${signal} received. Disconnecting workers for graceful shutdown...`);
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing primary exit.');
      process.exit(0);
    }, 15000).unref();
    cluster.disconnect(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdownPrimaryOnSignal('SIGINT'));
  process.on('SIGTERM', () => shutdownPrimaryOnSignal('SIGTERM'));

  // Initialize scheduler in the Primary process to avoid duplicate jobs across
  // workers. The primary no longer listens on a port (workers do), so this runs
  // directly rather than in a listen callback.
  try {
    initScheduler();
    logger.info('Scheduler initialized in Primary process');
  } catch (err) {
    const error = err as Error;
    logger.error('Scheduler failed to init:', { error: error.message, stack: error.stack });
  }
} else {
  // --- Worker Process or Development Mode ---

  const app = express();
  // helmet の hidePoweredBy より前で早期 return する応答（HTTPS 強制リダイレクトの
  // 302 / 不正 Host の 400）にも効くよう、ミドルウェア順序に依存しない形で無効化する。
  app.disable('x-powered-by');
  // Trust the first proxy hop. 本番は Cloudflare Tunnel (cloudflared) が
  // X-Forwarded-For を付けて origin に流すため、req.ip は実クライアント IP になる
  // （2026-07-03 本番ログで検証済み。IP キーのレート制限が正しく機能）。
  app.set('trust proxy', 1);

  // Security Middleware
  const VALID_HOST_RE = /^[a-z0-9.-]+(:\d+)?$/i;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
      // Validate Host header before reflecting it into a redirect
      const host = req.headers.host ?? '';
      if (!VALID_HOST_RE.test(host)) {
        res.status(400).send('Bad Request');
        return;
      }
      res.redirect('https://' + host + req.url);
      return;
    }
    next();
  });

  const isProd = process.env.NODE_ENV === 'production';

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
          // WebSocket is no longer used (G章でチャット/Socket.IO を撤去)。
          // connectSrc は API(fetch) と Cloudflare Insights のみ。
          connectSrc: ["'self'", 'https://cloudflareinsights.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
          scriptSrcAttr: ["'none'"],
          reportUri: ['/api/csp-report'],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      strictTransportSecurity: {
        maxAge: 63072000, // 2 years
        includeSubDomains: true,
        preload: true,
      },
      frameguard: {
        action: 'sameorigin',
      },
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
      crossOriginEmbedderPolicy: false, // Allow loading external images
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(cookieParser());

  // Request ID tracing — unique ID per request for structured logging
  app.use(requestId);

  // CSP violation reporting endpoint (with dedicated rate limit)
  const cspLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    // 未認証エンドポイントなので、実効上限が max × ワーカー数にならないよう
    // 全ワーカーで共有する（開発・テストでは MemoryStore にフォールバック）。
    store: createSqliteRateLimitStore('csp'),
  });

  const getCspReport = (body: unknown): Record<string, unknown> | null => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const bodyRecord = body as Record<string, unknown>;
    const nestedReport = bodyRecord['csp-report'];
    if (nestedReport && typeof nestedReport === 'object' && !Array.isArray(nestedReport)) {
      return nestedReport as Record<string, unknown>;
    }
    return bodyRecord;
  };

  const isKnownSelfBundleEvalProbe = (report: Record<string, unknown>): boolean => {
    // Zod's browser bundle feature-detects eval support with `new Function`.
    // Our CSP correctly blocks it, but the caught probe still emits noisy CSP
    // reports. Keep the block in place and downgrade only this known self-bundle
    // report; all other CSP reports remain warnings.
    const blockedUri = report['blocked-uri'];
    const effectiveDirective = report['effective-directive'] ?? report['violated-directive'];
    const sourceFile = report['source-file'];
    return (
      blockedUri === 'eval' &&
      typeof effectiveDirective === 'string' &&
      effectiveDirective.startsWith('script-src') &&
      typeof sourceFile === 'string' &&
      /\/assets\/index-[\w-]+\.js$/.test(sourceFile)
    );
  };

  const CSP_FIELD_MAX_LEN = 256;

  /** ログに載せる値を文字列化して切り詰める（未認証入力をそのまま流さない） */
  const truncateCspField = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    const text = typeof value === 'string' ? value : String(value);
    return text.length > CSP_FIELD_MAX_LEN ? `${text.slice(0, CSP_FIELD_MAX_LEN)}…` : text;
  };

  /**
   * 未認証の body 全文をログに残すと、最悪 100KB × リミット回数ぶんの雑音で
   * 実際のアラートが logrotate の世代から押し流される。診断に必要な
   * フィールドだけを抜き出して記録する。
   */
  const summarizeCspReport = (report: Record<string, unknown>) => ({
    blockedUri: truncateCspField(report['blocked-uri']),
    effectiveDirective: truncateCspField(
      report['effective-directive'] ?? report['violated-directive'],
    ),
    documentUri: truncateCspField(report['document-uri']),
    sourceFile: truncateCspField(report['source-file']),
    lineNumber: truncateCspField(report['line-number']),
  });

  app.post(
    '/api/csp-report',
    cspLimiter,
    express.json({
      type: ['application/csp-report', 'application/reports+json', 'application/json'],
      // 正当な CSP レポートは通常 1KB 未満。既定の 100KB は受けない。
      limit: '8kb',
    }),
    (req: Request, res: Response) => {
      const report = getCspReport(req.body);
      if (report && isKnownSelfBundleEvalProbe(report)) {
        logger.info('Known CSP eval probe blocked', {
          sourceFile: report['source-file'],
          documentUri: report['document-uri'],
          ip: req.ip,
        });
      } else {
        logger.warn('CSP violation report', {
          report: report ? summarizeCspReport(report) : null,
          ip: req.ip,
        });
      }
      res.status(204).end();
    },
  );

  // 全体の粗い暴走防止リミッター。意図的にデフォルトの MemoryStore
  // （ワーカープロセスごとに独立 = 実効上限は max × ワーカー数）を使う。
  // 全リクエストで SQLite を叩くコストを避けるため。セキュリティ目的の
  // リミッター（login / pdf / upload）は SqliteRateLimitStore で全ワーカー共有。
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Limit each IP to 5000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      notifyRateLimitExceeded({
        kind: 'global',
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      res
        .status(429)
        .json({ error: 'リクエストが多すぎます。しばらくしてから再度お試しください。' });
    },
  });
  app.use(limiter);

  // Performance & Logging
  app.use(compression());
  // Define custom tokens for Morgan
  morgan.token('date-jst', () => {
    return new Date()
      .toLocaleString('en-CA', { timeZone: 'Asia/Tokyo', hour12: false })
      .replace(',', '');
  });
  morgan.token('req-id', (req: Request) => req.requestId || '-');
  // A-6: mask calendar feed tokens so the 64-hex value never lands in the
  // long-lived access log (default token returns req.originalUrl || req.url).
  morgan.token('url', (req: Request) => maskCalendarTokenInUrl(req.originalUrl || req.url));

  // Use custom format with JST date and request ID
  morgan.format(
    'custom',
    ':remote-addr - :remote-user [:date-jst] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" rid=:req-id',
  );

  const shouldSkipAccessLog = (req: Request, res: Response): boolean => {
    // Keep failures visible, but suppress high-volume successful monitoring
    // requests. Production logs showed these endpoints/checkers accounted for
    // most access-log volume while not being actionable during normal operation.
    if (res.statusCode >= 400) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    const requestPath = req.path;
    if (requestPath === '/healthz' || requestPath === '/api/status') {
      return true;
    }

    const userAgent = req.get('user-agent') ?? '';
    return requestPath === '/' && userAgent.startsWith('Blackbox-Exporter/');
  };

  app.use(morgan('custom', { stream: loggerStream, skip: shouldSkipAccessLog }));

  app.use(
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? false
          : ['http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
  // Explicit body-size limit (defense-in-depth against oversized-payload abuse).
  // The largest legitimate payloads — chat/broadcast messages capped at 10,000
  // characters — fit comfortably within this limit.
  app.use(express.json({ limit: '100kb' }));

  // Static file serving for uploads (AUTHENTICATED ONLY)
  app.use('/uploads', ...uploadAccessMiddleware);

  // Swagger API Documentation (development only)
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
    logger.info('Swagger UI available at /api-docs');
  }

  // Disable caching for API routes to ensure real-time data
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
  });

  // /api/status — keeps old clients (cached SW) from getting stuck on maintenance screen
  app.get('/api/status', (_req: Request, res: Response) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ maintenance: false, mode: 'none' });
  });

  // /healthz — external monitoring endpoint (checks DB connectivity)
  app.get('/healthz', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      db.prepare('SELECT 1').get();
      res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        pid: process.pid,
      });
    } catch (err) {
      res.status(503).json({
        status: 'degraded',
        error: (err as Error).message,
      });
    }
  });

  // --- Routes ---
  app.use('/api/auth', authRouter);
  app.use('/api/rates', ratesRouter);
  app.use('/api/work_logs', workLogsRouter);
  app.use('/api/fixed_shifts', fixedShiftsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api', patternsRouter); // Patterns, Slots, Assignments, Bulk Apply
  app.use('/api/users', usersRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/salary_adjustments', salaryAdjustmentsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/pdf', pdfRouter);
  app.use('/api/schedule_events', scheduleEventsRouter);

  // Cache stats endpoint (Admin only, development)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/admin/cache-stats', authenticateToken, (req: Request, res: Response) => {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: '管理者権限が必要です' });
        return;
      }
      res.json(cache.getStats());
    });
  }

  // 404 Handler for undefined API routes
  app.use('/api/{*path}', notFoundHandler);

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    app.get('/robots.txt', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../client/dist/robots.txt'));
    });

    app.get('/sitemap.xml', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../client/dist/sitemap.xml'));
    });

    app.use(
      express.static(path.join(__dirname, '../../client/dist'), {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else if (filePath.includes('assets/') || filePath.includes('assets\\')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      }),
    );

    // 拡張子つきに見えるパスは SPA ルートではありえない。実在する静的ファイルは
    // 上の express.static が既に返しているので、ここに来た時点で「存在しない
    // ファイル」が確定している。index.html を 200 で返すとスキャナに「刺さった」
    // ように見え、404 率による異常検知も成立しない。また更新後に古いタブが
    // 消えたチャンク (/assets/index-<旧hash>.js) を要求した場合も、HTML ではなく
    // 404 を返すほうが recovery.js のセルフヒールが素直に働く。
    //
    // 注意: ドットを含むフロントエンドのルートを追加すると、この分岐がそれを
    // 404 にしてしまう（2026-08-25 時点でクライアントのルートにドットは無い）。
    const FILE_EXTENSION_RE = /\.[a-zA-Z0-9]{1,8}$/;

    app.get('{*path}', (req: Request, res: Response) => {
      if (FILE_EXTENSION_RE.test(req.path)) {
        res.status(404).type('txt').send('Not Found');
        return;
      }
      res.sendFile(path.join(__dirname, '../../client/dist', 'index.html'));
    });
  }

  // Global Error Handler (unified).
  // 全ルート登録の後でなければ Express のエラーハンドラは効かない。静的配信層や
  // SPA fallback から出たエラー（例: URIError: Failed to decode param）も
  // requestId 付きの構造化ログ・統一 JSON 応答・5xx 通知を通すため、ここに置く。
  app.use(errorHandler);

  // Create HTTP server and initialize Socket.IO
  const httpServer = http.createServer(app);
  const shutdownWithGrace = createGracefulShutdownHandler({
    httpServer,
    logger,
    isProduction: process.env.NODE_ENV === 'production',
    shutdownTimeoutMs: 15000,
  });

  // Process-level errors should trigger graceful shutdown in production workers.
  // The Discord notification is awaited (bounded) so the alert isn't lost when
  // the process exits right after closing the HTTP server.
  const NOTIFY_TIMEOUT_MS = 3000;
  const notifyThenShutdown = (
    reason: 'Uncaught Exception' | 'Unhandled Rejection',
    details: string,
    shutdownDetails: Record<string, unknown>,
  ): void => {
    void Promise.race([
      notifyFatalProcessError({ reason, details }),
      new Promise((resolve) => setTimeout(resolve, NOTIFY_TIMEOUT_MS).unref()),
    ]).finally(() => {
      shutdownWithGrace(reason, shutdownDetails);
    });
  };

  process.on('uncaughtException', (err: Error) => {
    notifyThenShutdown('Uncaught Exception', `${err.message}\n${err.stack || ''}`, {
      error: err.message,
      stack: err.stack,
    });
  });

  // Graceful shutdown on signals (dev process, or a worker signalled directly).
  // Production workers normally drain via cluster.disconnect() from the primary
  // instead. Exit code 0: a signal is an orderly stop, not a failure.
  let signalCloseStarted = false;
  const closeOnSignal = (signal: string): void => {
    if (signalCloseStarted) return;
    signalCloseStarted = true;
    logger.info(`${signal} received. Closing HTTP server gracefully...`);
    setTimeout(() => process.exit(0), 15000).unref();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', () => closeOnSignal('SIGINT'));
  process.on('SIGTERM', () => closeOnSignal('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    const reasonError = reason instanceof Error ? reason : null;
    notifyThenShutdown(
      'Unhandled Rejection',
      reasonError ? `${reasonError.message}\n${reasonError.stack || ''}` : String(reason),
      {
        promise: String(promise),
        reason: reasonError ? reasonError.message : String(reason),
        stack: reasonError?.stack,
      },
    );
  });

  // Production workers and the dev process both listen on PORT. Under node
  // cluster, workers share the port and the primary round-robins connections;
  // in dev there is a single process.
  // Production binds to loopback only: cloudflared reaches the origin via
  // 127.0.0.1 and external monitoring (payroll-status) goes through Cloudflare
  // — both verified on the live server 2026-07-08. Dev keeps 0.0.0.0 so the
  // app is reachable from other devices on the LAN.
  const HOST = isProd ? '127.0.0.1' : '0.0.0.0';
  httpServer.listen(PORT, HOST, () => {
    logger.info(`${isProd ? `Worker ${process.pid}` : 'Server'} listening on port ${PORT}`);
    // Dev has no primary, so init the scheduler here. In production the primary
    // owns the scheduler (above) to avoid duplicate jobs across workers.
    if (!isProd) {
      try {
        initScheduler();
      } catch (err) {
        const error = err as Error;
        logger.error('Scheduler failed to init:', { error: error.message, stack: error.stack });
      }
    }
  });
}
