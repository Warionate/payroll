import { config } from '../config.js';
import {
  createPost,
  getActivePosts,
  getSetting,
  setSetting,
  resolveAutoIncidents,
  isMaintenanceActive,
} from './post.js';
import {
  notifyDown,
  notifyUp,
  notifyPlannedDown,
  notifyPlannedUp,
  notifyMonitorResumed,
} from './discord-webhook.js';

let isChecking = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch の失敗理由を人間が読める1行に落とす。
 * undici は実際の原因を err.cause に入れるため、そちらまで展開しないと
 * "fetch failed" しか残らず障害の切り分けができない。
 */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return `timeout after ${config.healthCheckTimeoutMs}ms`;
    }
    const cause = err.cause as { code?: string; message?: string } | undefined;
    if (cause?.code) return `${err.message} (${cause.code})`;
    if (cause?.message) return `${err.message} (${cause.message})`;
    return err.message;
  }
  return String(err);
}

/** 1回分のヘルスチェック。成功なら null、失敗なら理由を返す。 */
async function attemptHealthCheck(): Promise<string | null> {
  const startedAt = Date.now();
  const controller = new AbortController();
  // ボディ読み取りまで含めて打ち切りたいので、json() を終えるまで解除しない。
  const timeout = setTimeout(() => controller.abort(), config.healthCheckTimeoutMs);

  try {
    const res = await fetch(`${config.payrollUrl}/healthz`, {
      signal: controller.signal,
    });

    if (!res.ok) return `HTTP ${res.status} (${Date.now() - startedAt}ms)`;

    const data = (await res.json()) as { status: string };
    if (data.status !== 'ok') return `status="${data.status}" (${Date.now() - startedAt}ms)`;

    return null;
  } catch (err) {
    return `${describeError(err)} (${Date.now() - startedAt}ms)`;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * リトライ込みのヘルスチェック。全試行が失敗したときだけ失敗として扱う。
 * 8/6 の誤検知（アプリは 200 を返し続けていたのに DOWN 判定）は単発の
 * ネットワークブリップが 3 回連続したことが原因だったため、
 * 1回の失敗をそのまま失敗カウントに乗せない。
 */
async function checkHealth(): Promise<string | null> {
  const attempts = Math.max(1, config.healthCheckRetries + 1);

  for (let i = 1; i <= attempts; i++) {
    const reason = await attemptHealthCheck();
    if (reason === null) {
      if (i > 1) console.log(`[HealthCheck] Recovered on attempt ${i}/${attempts}`);
      return null;
    }

    console.warn(`[HealthCheck] Attempt ${i}/${attempts} failed: ${reason}`);

    if (i === attempts) return reason;
    await sleep(config.healthCheckRetryDelayMs);
  }

  return 'unknown';
}

/**
 * 対照 URL に届くか。ヘルスチェックは公開 URL（Cloudflare 経由）を叩くので、
 * 監視側のネットワーク不調でも失敗する。そのままダウン判定すると Worker が
 * 全ユーザーを障害ページで止めてしまうため、同じ経路の対照 URL にも届かなければ
 * 「監視側の問題」として失敗に数えない。何らかの HTTP 応答があれば経路は生きている。
 */
async function isControlReachable(): Promise<boolean> {
  if (!config.healthCheckControlUrl) return true;
  try {
    const res = await fetch(config.healthCheckControlUrl, {
      signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
    });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

const STATUS_LABELS: Record<string, string> = {
  operational: '稼働中',
  incident: '障害発生中',
  maintenance: 'メンテナンス中',
};

/** 表示ステータスの手動固定は戻し忘れると実際の状態を隠すので、障害/復旧の通知で毎回知らせる */
function overrideNotes(): string[] {
  const override = getSetting('status_override') || 'auto';
  if (override === 'auto') return [];
  return [
    `表示ステータスが手動で「${STATUS_LABELS[override] ?? override}」に固定されています。実際の状態に合わせて自動に戻してください。`,
  ];
}

async function runHealthCheck(): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    const failureReason = await checkHealth();
    const isUp = failureReason === null;

    if (!isUp && !(await isControlReachable())) {
      setSetting('last_check_at', new Date().toISOString());
      console.warn(
        `[HealthCheck] Control URL is also unreachable - treating as a monitor-side network issue, not counted (last reason: ${failureReason})`,
      );
      return;
    }

    const previousStatus = getSetting('last_health_status') || 'unknown';
    const failures = Number(getSetting('consecutive_failures') || '0');
    const downSuppressed = getSetting('down_suppressed') === 'true';

    setSetting('last_check_at', new Date().toISOString());

    if (isUp) {
      setSetting('consecutive_failures', '0');

      if (previousStatus === 'down' && downSuppressed) {
        // メンテ中の計画停止からの戻り。障害として扱っていないので復旧投稿もしない。
        setSetting('last_health_status', 'up');
        setSetting('down_suppressed', 'false');
        setSetting('consecutive_successes', '0');
        await notifyPlannedUp(getSetting('maintenance_mode') === 'true');
        console.log('[HealthCheck] Service is back UP after planned downtime (no post)');
      } else if (previousStatus === 'down') {
        const successes = Number(getSetting('consecutive_successes') || '0') + 1;
        const threshold = Math.max(1, config.recoverySuccessThreshold);
        if (successes < threshold) {
          setSetting('consecutive_successes', String(successes));
          console.log(
            `[HealthCheck] Responding again (${successes}/${threshold}) - waiting before declaring recovery`,
          );
          return;
        }

        setSetting('consecutive_successes', '0');
        setSetting('last_health_status', 'up');

        const lastDownAt = getSetting('last_down_at');
        let downtimeMinutes = 0;
        if (lastDownAt) {
          downtimeMinutes = (Date.now() - new Date(lastDownAt).getTime()) / 60000;
        }

        createPost({
          type: 'resolved',
          status: 'resolved',
          title: 'サービス復旧',
          content:
            downtimeMinutes > 0
              ? `payroll.warionate.com が復旧しました。\n\nダウンタイム: 約${Math.round(downtimeMinutes)}分`
              : 'payroll.warionate.com が復旧しました。',
          source: 'auto',
        });

        // ダウン検知時に自動作成した incident 投稿を解決済みにする。
        // これを行わないと computeAutoStatus が未解決 incident を見続けて
        // status=incident のままになり、下の自動 ON もリダイレクトを再開できない。
        resolveAutoIncidents();

        // ダウン検知時にこちらが自動 OFF した場合のみ自動 ON に戻す。
        // 手動 OFF（管理画面・Discord・障害/メンテ投稿）は復旧では上書きしない。
        if (getSetting('redirect_auto_disabled') === 'true') {
          setSetting('redirect_enabled', 'true');
        }
        setSetting('redirect_auto_disabled', 'false');

        // 手動で投稿した障害は自動では解決しない（オペレーターの判断）。残っていると
        // サービスが戻っても表示は障害発生中のままなので、通知で明示する。
        const notes = overrideNotes();
        const remaining = getActivePosts('incident');
        if (remaining.length > 0) {
          notes.push(
            `未解決の障害が残っています: ${remaining.map((p) => `#${p.id} ${p.title}`).join(' / ')}。解決するまで表示は障害発生中のままです。`,
          );
        }

        await notifyUp(downtimeMinutes, { notes });

        console.log(`[HealthCheck] Service recovered after ~${Math.round(downtimeMinutes)} minutes`);
      } else if (previousStatus === 'unknown') {
        setSetting('last_health_status', 'up');
        console.log('[HealthCheck] Initial check: service is UP');
      }
    } else {
      const newFailures = failures + 1;
      setSetting('consecutive_failures', String(newFailures));
      setSetting('consecutive_successes', '0');

      const reachedThreshold = newFailures >= Math.max(1, config.consecutiveFailuresThreshold);
      const inMaintenance = reachedThreshold && isMaintenanceActive();

      if (reachedThreshold && previousStatus !== 'down' && inMaintenance) {
        // メンテ中にサーバーを止めた計画停止。Worker が last_health_status を見るので
        // 状態は down として記録するが、障害投稿・リダイレクト操作はしない。
        setSetting('last_health_status', 'down');
        setSetting('last_down_at', new Date().toISOString());
        setSetting('down_suppressed', 'true');
        await notifyPlannedDown(failureReason ?? 'unknown', { notes: overrideNotes() });
        console.log(
          `[HealthCheck] Service DOWN during maintenance - treated as planned (last reason: ${failureReason})`,
        );
      } else if (
        reachedThreshold &&
        (previousStatus !== 'down' || (downSuppressed && !inMaintenance))
      ) {
        // 通常のダウン検知、またはメンテを終えてもダウンが続いているケース。
        // 後者の last_down_at はメンテ終了後に障害として扱い始めた時刻にする。
        setSetting('last_health_status', 'down');
        setSetting('last_down_at', new Date().toISOString());
        setSetting('down_suppressed', 'false');

        createPost({
          type: 'incident',
          status: 'investigating',
          title: 'サービス障害検知',
          content:
            'payroll.warionate.com へのアクセスができない状態が検知されました。\n\n現在調査中です。',
          source: 'auto',
        });

        // 元々 ON だった場合だけ OFF にし、自動 OFF だったことを記録する
        // （復旧時の自動 ON はこのフラグが立っている場合に限る）。
        if (getSetting('redirect_enabled') === 'true') {
          setSetting('redirect_enabled', 'false');
          setSetting('redirect_auto_disabled', 'true');
        }

        await notifyDown({ notes: overrideNotes() });

        console.log(
          `[HealthCheck] Service DOWN detected after ${newFailures} consecutive failures` +
            ` (last reason: ${failureReason})`,
        );
      } else {
        console.log(
          `[HealthCheck] Check failed (${newFailures}/${config.consecutiveFailuresThreshold})` +
            ` - ${failureReason}`,
        );
      }
    }
  } catch (err) {
    console.error('[HealthCheck] Unexpected error:', (err as Error).message);
  } finally {
    isChecking = false;
  }
}

// デプロイによる再起動（数十秒〜1分程度）では通知しない
const MONITOR_GAP_NOTIFY_MS = 5 * 60 * 1000;

export function startHealthCheck(): void {
  const intervalMs = Math.max(10000, config.healthCheckIntervalMs);
  console.log(`[HealthCheck] Starting with ${Math.round(intervalMs / 1000)}s interval`);

  const lastCheckAt = getSetting('last_check_at');
  if (lastCheckAt) {
    const gapMs = Date.now() - new Date(lastCheckAt).getTime();
    if (gapMs > Math.max(MONITOR_GAP_NOTIFY_MS, intervalMs * 10)) {
      console.warn(`[HealthCheck] Monitoring resumed after a gap of ~${Math.round(gapMs / 60000)} minutes`);
      void notifyMonitorResumed(gapMs / 60000);
    }
  }

  runHealthCheck();
  setInterval(runHealthCheck, intervalMs);
}

/**
 * 管理画面の「再チェック」用。結果を返すだけで、連続失敗回数やダウン判定には数えない
 * （一時的なブリップ中に数回押しただけで障害として投稿・通知されるのを防ぐ）。
 * 応答が戻っていてダウン扱いのままなら、定期チェックと同じ処理で復旧を進める。
 * @returns 成功なら null、失敗なら理由
 */
async function runManualHealthCheck(): Promise<string | null> {
  const failureReason = await checkHealth();
  if (failureReason === null && getSetting('last_health_status') === 'down') {
    await runHealthCheck();
  }
  return failureReason;
}

export { runHealthCheck, runManualHealthCheck };
