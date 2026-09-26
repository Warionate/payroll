/**
 * Cloudflare Worker for payroll.warionate.com
 *
 * Behavior:
 * 1. payroll-status の /api/maintenance-status を確認
 *    - maintenanceMode=true なら即メンテページを返す
 *    - lastHealthStatus=down なら即メンテページを返す（文言は「障害」表示）
 *    - payroll-status に到達できない間は直近の判定をフォールバックとして
 *      使い続ける（メンテ中にフェイルオープンしないため）
 * 2. それ以外は origin にそのまま通す（5xx もそのまま通す）
 * 3. origin が unreachable な時は、トップレベルの document ナビゲーションに
 *    限り inline メンテ HTML を返す。API / /uploads 等は 502 を素通し。
 * 4. メンテ HTML は X-Maintenance ヘッダーをポーリングし、解除を検知したら
 *    自動でリロードする（HTML 自体は no-store でキャッシュさせない）。
 *    SW 登録済みクライアント向けの同等処理は client/src/pages/MaintenancePage.tsx。
 * 5. Cron（5 分ごと）で payroll-status 自体の死活を見る。障害監視そのものが
 *    止まっていたら DISCORD_WEBHOOK_URL（secret）へ通知する。
 */

interface Env {
  // payroll-status のベース URL
  STATUS_API_BASE: string;
  // 一時的に Worker を停止して常に origin に流したい場合に "true" にする
  WORKER_BYPASS?: string;
  // payroll-status の死活監視の通知先（wrangler secret put DISCORD_WEBHOOK_URL）。未設定ならログのみ
  DISCORD_WEBHOOK_URL?: string;
}

interface MaintenanceStatus {
  maintenanceMode: boolean;
  lastHealthStatus: string;
  // payroll-status が最後にヘルスチェックした時刻（ISO 8601）。古い版の payroll-status には無い
  lastCheckAt?: string;
}

const STATUS_FETCH_TIMEOUT_MS = 2500;
// メンテ判定キャッシュの TTL（切り替えの反映上限）
const STATUS_CACHE_MAX_AGE_S = 10;
// payroll-status ダウン時に直近の判定を使い続けるフォールバックの保持時間
const STATUS_FALLBACK_MAX_AGE_S = 600;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (env.WORKER_BYPASS === 'true') {
      return fetch(request);
    }

    // origin の health check と管理系 API は常に通す。
    // /api/auth/refresh も通す — メンテが 15 分（アクセストークン寿命）を
    // 超えても管理者がセッションを更新して /api/admin を叩けるようにする。
    if (
      url.pathname === '/healthz' ||
      url.pathname === '/api/admin' ||
      url.pathname.startsWith('/api/admin/') ||
      url.pathname === '/api/auth/refresh'
    ) {
      return fetch(request);
    }

    const isApi = url.pathname.startsWith('/api/');
    const status = await getMaintenanceStatus(env, ctx).catch(() => null);

    if (status && (status.maintenanceMode || status.lastHealthStatus === 'down')) {
      const reason: MaintenanceReason = status.maintenanceMode ? 'maintenance' : 'outage';
      if (isApi) {
        return maintenanceApiResponse(503);
      }
      if (isDocumentRequest(request, url)) {
        return maintenanceResponse(503, reason);
      }
      // /uploads や画像等のサブリソースに HTML を返さない
      return new Response('Service Unavailable', {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '120',
          'X-Maintenance': '1',
        },
      });
    }

    try {
      return await fetch(request);
    } catch {
      // origin unreachable. トップレベル document ナビゲーションのみ
      // ブランド化したメンテ HTML を返し、API / /uploads 等は素の 502 を返す
      // （axios interceptor が X-Maintenance を見てメンテ画面へ誤遷移しないように）。
      if (isDocumentRequest(request, url)) {
        return maintenanceResponse(502, 'outage');
      }
      return new Response('Bad Gateway', { status: 502 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkMonitorLiveness(env, controller.scheduledTime));
  },
};

// --- payroll-status の死活監視 ---
// payroll-status はプロセスが例外で落ちたときは自分で通知するが、メモリ不足での強制終了・
// サーバー再起動・PM2 の再起動打ち切りでは誰も気付けない。その間は障害を検知できず、
// この Worker も直近の判定を 10 分使った後は origin にそのまま流す。
// KV などの状態を持たないため、通知の重複は時刻の区切りで間引く。
const LIVENESS_CRON_INTERVAL_MS = 5 * 60_000; // wrangler.toml の crons と合わせる
const LIVENESS_STALE_MS = 10 * 60_000;
const LIVENESS_REMIND_EVERY_MS = 60 * 60_000;
const LIVENESS_FETCH_TIMEOUT_MS = 10_000;

async function checkMonitorLiveness(env: Env, now: number): Promise<void> {
  const base = env.STATUS_API_BASE.replace(/\/$/, '');
  let problem: string | null = null;
  // 止まってからの経過時間が分かるときだけ入る（間引きの基準にする）
  let staleForMs: number | null = null;

  try {
    const res = await fetchWithTimeout(
      new Request(`${base}/api/maintenance-status`),
      LIVENESS_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) {
      problem = `payroll-status が HTTP ${res.status} を返しています`;
    } else {
      const status = (await res.json()) as MaintenanceStatus;
      if (!status.lastCheckAt) {
        // lastCheckAt を返さない古い payroll-status。判定できないので通知しない
        console.log('[Liveness] lastCheckAt not provided; skipping');
        return;
      }
      const ageMs = now - Date.parse(status.lastCheckAt);
      if (ageMs > LIVENESS_STALE_MS) {
        problem = `最後のヘルスチェックから約${Math.round(ageMs / 60_000)}分経過しています`;
        staleForMs = ageMs;
      }
    }
  } catch (err) {
    problem = `payroll-status に到達できません (${(err as Error).message})`;
  }

  if (!problem) return;
  console.warn(`[Liveness] ${problem}`);

  // 経過時間が分かるときは「しきい値を超えた直後の 1 回 + 以後 1 時間ごと」。
  // 到達できないときは経過が分からないので、毎時 0 分台と 30 分台の 1 回ずつ。
  const shouldNotify =
    staleForMs !== null
      ? (staleForMs - LIVENESS_STALE_MS) % LIVENESS_REMIND_EVERY_MS < LIVENESS_CRON_INTERVAL_MS
      : new Date(now).getUTCMinutes() % 30 < LIVENESS_CRON_INTERVAL_MS / 60_000;
  if (!shouldNotify || !env.DISCORD_WEBHOOK_URL) return;

  try {
    await fetchWithTimeout(
      new Request(env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Payroll Maintenance Shield',
          embeds: [
            {
              title: '⚠️ payroll-status の監視が止まっている可能性',
              description: [
                problem,
                '',
                'この間は payroll-app の障害を検知・通知できません。',
                'Worker は直近のメンテ判定を最大 10 分使った後、payroll-app にそのまま通します。',
                'ステータスサーバーのプロセス状態を確認してください。',
              ].join('\n'),
              color: 0xf59e0b,
              timestamp: new Date(now).toISOString(),
            },
          ],
        }),
      }),
      LIVENESS_FETCH_TIMEOUT_MS,
    );
  } catch (err) {
    console.error(`[Liveness] Failed to notify: ${(err as Error).message}`);
  }
}

function isDocumentRequest(request: Request, url: URL): boolean {
  const acceptsHtml = request.headers.get('Accept')?.includes('text/html') ?? false;
  return (
    request.method === 'GET' &&
    acceptsHtml &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/uploads/')
  );
}

async function getMaintenanceStatus(
  env: Env,
  ctx: ExecutionContext,
): Promise<MaintenanceStatus | null> {
  const base = env.STATUS_API_BASE.replace(/\/$/, '');
  const statusUrl = `${base}/api/maintenance-status`;
  // フォールバック用キー。実在しない URL でよい（Cache API のキーとしてのみ使用）
  const fallbackUrl = `${base}/__worker-cache/last-known-maintenance-status`;
  const cache = caches.default;

  // 1. fresh キャッシュ（TTL 10秒）があればそのまま返す。
  const cached = await cache.match(statusUrl);
  if (cached) {
    return (await cached.json()) as MaintenanceStatus;
  }

  // 2. fresh が無くても直近の判定（fallback, 600秒保持）があれば即座に返し、
  //    取得は裏で行う（stale-while-revalidate）。これにより低トラフィックで
  //    fresh が切れるたびに status API の往復（最大2.5秒）でユーザーの
  //    リクエストをブロックするのを防ぐ。メンテ判定ロジック自体は不変で、
  //    値の更新は最大「fallback 保持時間」分だけ遅れる（フェイルオープンしない）。
  const fallback = await cache.match(fallbackUrl);
  if (fallback) {
    ctx.waitUntil(fetchAndCacheStatus(ctx, statusUrl, fallbackUrl).catch(() => null));
    return (await fallback.json()) as MaintenanceStatus;
  }

  // 3. fresh も fallback も無い初回だけは、値を確立するため同期取得する。
  return await fetchAndCacheStatus(ctx, statusUrl, fallbackUrl);
}

/**
 * status API を取得して fresh / fallback の両キャッシュを更新し、判定を返す。
 * キャッシュ書き込みは応答をブロックしないよう ctx.waitUntil に逃がす。
 * 取得失敗（到達不能 / 非 2xx）時は null を返し、呼び出し側は直近の判定を維持する。
 */
async function fetchAndCacheStatus(
  ctx: ExecutionContext,
  statusUrl: string,
  fallbackUrl: string,
): Promise<MaintenanceStatus | null> {
  const cache = caches.default;
  let fresh: Response | null = null;
  try {
    fresh = await fetchWithTimeout(new Request(statusUrl), STATUS_FETCH_TIMEOUT_MS);
  } catch {
    fresh = null;
  }

  if (!fresh || !fresh.ok) {
    return null;
  }

  // stale-while-revalidate 等を引き継ぐと解除反映が遅れるため max-age を固定して保存
  const body = await fresh.text();
  const cacheEntry = (maxAgeSeconds: number) =>
    new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${maxAgeSeconds}`,
      },
    });
  ctx.waitUntil(
    Promise.all([
      cache.put(new Request(statusUrl), cacheEntry(STATUS_CACHE_MAX_AGE_S)),
      cache.put(new Request(fallbackUrl), cacheEntry(STATUS_FALLBACK_MAX_AGE_S)),
    ]),
  );
  return JSON.parse(body) as MaintenanceStatus;
}

async function fetchWithTimeout(request: Request, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 計画メンテと障害（ヘルスチェック down / origin unreachable）で文言を出し分ける。
// ステータスページ側の表示（incident / maintenance）と整合させる。
type MaintenanceReason = 'maintenance' | 'outage';

const MAINTENANCE_COPY: Record<MaintenanceReason, { title: string; message: string }> = {
  maintenance: {
    title: 'メンテナンス中',
    message: '現在メンテナンスのためサービスを停止しています。復旧までお待ちください。',
  },
  outage: {
    title: '障害が発生しています',
    message: '現在アクセスしづらい状態になっています。復旧までお待ちください。',
  },
};

function maintenanceResponse(originStatus: number, reason: MaintenanceReason): Response {
  const copy = MAINTENANCE_COPY[reason];
  const html = MAINTENANCE_HTML.replaceAll('{{TITLE}}', copy.title).replaceAll(
    '{{MESSAGE}}',
    copy.message,
  );
  // 解除後にキャッシュ済みメンテページが表示され続けないよう no-store にする
  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '120',
      'X-Maintenance': '1',
      'X-Maintenance-Origin-Status': String(originStatus),
    },
  });
}

function maintenanceApiResponse(originStatus: number): Response {
  return new Response(JSON.stringify({ maintenance: true, error: 'maintenance' }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '120',
      'X-Maintenance': '1',
      'X-Maintenance-Origin-Status': String(originStatus),
    },
  });
}

// NOTE: SW 登録済みクライアントが見るメンテ画面は
// client/src/pages/MaintenancePage.tsx にあり、デザイン・文言・ポーリング間隔を
// 手動で同期している。どちらかを変えたらもう片方も確認すること。
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>{{TITLE}}</title>
  <link rel="icon" href="data:,">
  <style>
    :root {
      color-scheme: light dark;
      --fg: #1f2328;
      --fg-muted: #656d76;
      --border: #d0d7de;
      --bg: #ffffff;
    }
    /* D-1: 夜間のメンテ切り替えで眩しくならないよう OS のダーク設定に追従する。
       client/src/pages/MaintenancePage.tsx と配色・文言を合わせること。 */
    @media (prefers-color-scheme: dark) {
      :root {
        --fg: #e6edf3;
        --fg-muted: #8b949e;
        --border: #30363d;
        --bg: #0d1117;
      }
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif;
      background: var(--bg);
      color: var(--fg);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.6;
    }
    main {
      max-width: 420px;
      width: 100%;
    }
    .icon {
      width: 32px;
      height: 32px;
      stroke: var(--fg);
      margin-bottom: 20px;
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    p {
      font-size: 14px;
      color: var(--fg-muted);
      margin: 0 0 24px;
    }
    .links {
      border-top: 1px solid var(--border);
      padding-top: 20px;
      font-size: 13px;
      color: var(--fg-muted);
    }
    .links p { margin: 0 0 8px; }
    .links p:last-child { margin: 0; }
    a {
      color: var(--fg);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    a:hover { text-decoration-thickness: 2px; }
  </style>
</head>
<body>
  <main>
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v5l3 2"/>
    </svg>
    <h1>{{TITLE}}</h1>
    <p>{{MESSAGE}}</p>
    <div class="links">
      <p>状況の確認: <a href="https://payroll-status.warionate.com/">ステータスページ</a></p>
      <p>お問い合わせ: <a href="mailto:support@payroll.warionate.com">support@payroll.warionate.com</a></p>
    </div>
  </main>
  <script>
    // メンテ解除を検知したら自動リロードする。
    // /api/status は origin 側に実在する軽量エンドポイント（server/src/index.ts）で、
    // Worker を経由するためメンテ中は X-Maintenance: 1 付きの 503 が返り、
    // 解除後は origin の 200 が返る。
    // 5xx（origin ダウン中の素の 502 等）の間はリロードせず待機する。
    // 間隔は client/src/pages/MaintenancePage.tsx の POLL_INTERVAL_MS と合わせる。
    (function () {
      var INTERVAL_MS = 15000;
      function schedule() { setTimeout(check, INTERVAL_MS); }
      function check() {
        fetch('/api/status', { cache: 'no-store' })
          .then(function (res) {
            if (res.headers.get('X-Maintenance') !== '1' && res.status < 500) {
              location.reload();
              return;
            }
            schedule();
          })
          .catch(schedule);
      }
      schedule();
    })();
  </script>
</body>
</html>`;
