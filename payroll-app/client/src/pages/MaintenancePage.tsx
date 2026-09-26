import { useEffect, useState } from 'react';

// NOTE: SW 未登録クライアントが見るメンテ画面は worker/src/index.ts の
// MAINTENANCE_HTML にあり、デザイン・文言・ポーリング間隔を手動で同期している。
// どちらかを変えたらもう片方も確認すること。

const STATUS_URL = 'https://payroll-status.warionate.com/';
const POLL_INTERVAL_MS = 15000;

// D-1: OS のダーク設定に追従する（worker 側の MAINTENANCE_HTML と配色を合わせる）。
// インラインスタイルは media query が使えないため matchMedia で切り替える。
const LIGHT = { bg: '#ffffff', fg: '#1f2328', muted: '#656d76', border: '#d0d7de' };
const DARK = { bg: '#0d1117', fg: '#e6edf3', muted: '#8b949e', border: '#30363d' };

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}
// 新 SW の install（プレキャッシュのダウンロード）と controllerchange を待つ上限
const SW_UPDATE_TIMEOUT_MS = 20000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * registration.update() 後に新 SW が waiting になるのを待つ。
 * 新バージョンがなければ null を返す。
 */
function waitForWaitingWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<ServiceWorker | null> {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  const installing = registration.installing;
  if (!installing) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(registration.waiting), timeoutMs);
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'redundant') {
        clearTimeout(timer);
        resolve(registration.waiting);
      }
    });
  });
}

/**
 * メンテ中に新バージョンがデプロイされていても、リロードだけでは旧 SW が
 * 旧プレキャッシュを返してしまう。リロード前に SW の更新を完了させる:
 * 1. registration.update() で新しい sw.js を取得
 * 2. 新 SW が waiting になったら SKIP_WAITING を送る
 * 3. controllerchange（新 SW がページを掌握）を待ってからリロード
 * 更新がない場合や失敗時は通常のリロードにフォールバックする。
 */
async function reloadWithLatestVersion(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        const waiting = await waitForWaitingWorker(registration, SW_UPDATE_TIMEOUT_MS);
        if (waiting) {
          const controllerChanged = new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
              once: true,
            });
          });
          waiting.postMessage({ type: 'SKIP_WAITING' });
          await Promise.race([controllerChanged, delay(SW_UPDATE_TIMEOUT_MS)]);
        }
      }
    }
  } catch {
    // SW 更新に失敗しても旧バージョンのまま復帰させ、更新は ReloadPrompt に任せる
  }
  window.location.reload();
}

export default function MaintenancePage() {
  useEffect(() => {
    let cancelled = false;
    let reloading = false;

    const check = async () => {
      if (reloading) return;
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        if (cancelled || reloading) return;
        const stillMaintenance = res.status === 503 && res.headers.get('x-maintenance') === '1';
        if (!stillMaintenance) {
          reloading = true;
          window.clearInterval(id);
          await reloadWithLatestVersion();
        }
      } catch {
        // ignore network errors — keep polling
      }
    };

    const id = window.setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const c = usePrefersDark() ? DARK : LIGHT;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: c.bg,
        color: c.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif",
        lineHeight: 1.6,
      }}
    >
      <main style={{ maxWidth: 420, width: '100%' }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={c.fg}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ width: 32, height: 32, marginBottom: 20 }}
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>メンテナンス中</h1>
        <p style={{ fontSize: 14, color: c.muted, margin: '0 0 24px' }}>
          現在サービスを停止しています。復旧までお待ちください。
        </p>
        <div
          style={{
            borderTop: `1px solid ${c.border}`,
            paddingTop: 20,
            fontSize: 13,
            color: c.muted,
          }}
        >
          <p style={{ margin: '0 0 8px' }}>
            状況の確認:{' '}
            <a
              href={STATUS_URL}
              style={{ color: c.fg, textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              ステータスページ
            </a>
          </p>
          <p style={{ margin: 0 }}>
            お問い合わせ:{' '}
            <a
              href="mailto:support@payroll.warionate.com"
              style={{ color: c.fg, textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              support@payroll.warionate.com
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
