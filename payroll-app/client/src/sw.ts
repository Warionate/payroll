/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// self.skipWaiting();
cleanupOutdatedCaches();
const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);

// Return cached index.html for all navigation requests (SPA fallback).
// This ensures the PWA opens instantly from cache even when the network
// is slow or the device has just woken up, preventing a loading spinner.
//
// dev（devOptions.enabled）ではマニフェストが空になり /index.html が precache
// されない。その状態で createHandlerBoundToURL を呼ぶと non-precached-url で
// throw し、SW 全体の評価が失敗して登録できなくなる（ランタイムキャッシュも
// 含めて何も動かない）。precache 済みのときだけ登録する。
// マニフェストの要素は URL 文字列か { url, revision } のどちらでもありうる
const manifestUrl = (entry: string | { url: string }) =>
  (typeof entry === 'string' ? entry : entry.url).replace(/^\//, '');

if (manifest.some((entry) => manifestUrl(entry) === 'index.html')) {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    // Don't intercept API calls or uploaded file requests
    denylist: [/^\/api\//, /^\/uploads\//],
  });
  registerRoute(navigationRoute);
}

// ── オフライン閲覧用の API ランタイムキャッシュ ───────────────────
// 読み取り系 API の GET を NetworkFirst でキャッシュする。オンライン時は常に
// ネットワークの結果を返し（タイムアウトによるフォールバックはしない）、
// オフライン時のみ直近の取得結果を返す。
// 認証 (/api/auth)・PDF・アップロード・管理系はキャッシュ対象外。
// ログアウト時はクライアント側で caches.delete() によりクリアされる
// （AuthContext 参照）。
const API_CACHE_NAME = 'api-cache';

const READ_API_PATTERN =
  /^\/api\/(work_logs|rates|patterns|pattern_assignments|fixed_shifts|salary_adjustments|schedule_events|chat\/broadcasts)(\/.*)?$/;

// fetchWorkLogs はキャッシュバスター `_t` を付けるため、キャッシュキーからは
// 取り除いて同一リクエストとして扱う（キーが毎回変わるとキャッシュが効かない）
const stripCacheBusterPlugin = {
  cacheKeyWillBeUsed: async ({ request }: { request: Request }): Promise<string> => {
    const url = new URL(request.url);
    url.searchParams.delete('_t');
    return url.href;
  },
};

registerRoute(
  ({ url, request }) => request.method === 'GET' && READ_API_PATTERN.test(url.pathname),
  new NetworkFirst({
    cacheName: API_CACHE_NAME,
    plugins: [
      stripCacheBusterPlugin,
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
  'GET',
);

// Support handling "skipWaiting" via message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
clientsClaim();

// Push Notification Handler
self.addEventListener('push', (event: PushEvent) => {
  let data: Record<string, string | undefined> = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // Malformed or missing push data — use defaults
  }

  const title = data.title || 'Payroll App';
  const options = {
    body: data.body || 'New notification',
    icon: '/logo-icon.png',
    badge: '/logo-icon.png',
    data: {
      url: data.url || '/',
    },
    tag: data.tag, // Use tag to replace existing notifications with same tag
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Handler
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList: readonly WindowClient[]) => {
        const url = event.notification.data.url;

        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then((focusedClient: WindowClient) => {
              if (url) return focusedClient.navigate(url);
            });
          }
        }

        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
