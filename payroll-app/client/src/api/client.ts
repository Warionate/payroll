import axios, { AxiosError, AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000, // 30秒タイムアウト（リクエストハング防止）
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

// --- Token Refresh Logic ---
let isRefreshing = false;
let refreshStartedAt = 0;
let refreshQueue: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

/** Max time to consider a refresh attempt as still in-progress (15s) */
const REFRESH_TIMEOUT_MS = 15000;

function processQueue(error: unknown) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  refreshQueue = [];
}

function resetRefreshState() {
  isRefreshing = false;
  refreshStartedAt = 0;
}

// すべてのリフレッシュ呼び出し（axios interceptor・socket）をこの1つに集約する。
// 同時に複数箇所から呼ばれても、進行中のリクエストは1つだけにして、
// サーバー側の「リフレッシュトークン再利用」誤検知（=全セッション強制ログアウト）を防ぐ。
let refreshPromise: Promise<void> | null = null;

export function refreshSession(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  // ボディは送らない（リフレッシュトークンは Cookie から読む）。空ボディを送ると
  // 復帰直後の半死接続でサーバのボディパーサが「来ないボディ」を待って 400 になる。
  refreshPromise = apiClient
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * Force-reset the interceptor's internal refresh state.
 * Call this after a successful login or during logout so that any
 * stale `isRefreshing` flag (left over from a previous session or
 * a suspended tab) is cleared and queued requests are rejected
 * rather than hanging forever.
 */
export function resetInterceptorState() {
  if (isRefreshing) {
    processQueue(new Error('State reset — new auth session'));
  }
  resetRefreshState();
  refreshPromise = null; // 共有リフレッシュも破棄（前セッションの残骸を残さない）
}

let onLogout: (() => void) | null = null;
let interceptorId: number | null = null;

export const setupInterceptors = (onUnauth: () => void) => {
  onLogout = onUnauth;

  // Eject previous interceptor to prevent accumulation
  if (interceptorId !== null) {
    apiClient.interceptors.response.eject(interceptorId);
  }

  interceptorId = apiClient.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const originalRequest = error.config as RetriableRequestConfig | undefined;

      // Worker がメンテ中に返す 503 + X-Maintenance。AuthContext が
      // メンテナンス表示に切り替えるためのイベントを発火する。
      if (error.response?.status === 503 && error.response?.headers?.['x-maintenance'] === '1') {
        window.dispatchEvent(new CustomEvent('maintenance-detected'));
      }

      if (!originalRequest) {
        return Promise.reject(error);
      }

      // If 401 and not already retrying and not the refresh endpoint itself
      if (
        error.response?.status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.includes('/auth/refresh') &&
        !originalRequest.url?.includes('/auth/login') &&
        !originalRequest.url?.includes('/auth/logout')
      ) {
        // Guard against stuck isRefreshing state (e.g., tab was suspended
        // during a refresh attempt and the promise never resolved).
        if (isRefreshing && Date.now() - refreshStartedAt > REFRESH_TIMEOUT_MS) {
          resetRefreshState();
          processQueue(new Error('Refresh timeout — resetting'));
        }

        // If already refreshing, queue this request
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            refreshQueue.push({
              resolve: () => {
                // Strip abort signal — the original AbortController may have
                // fired while waiting for refresh to complete.
                delete originalRequest.signal;
                originalRequest._retry = true;
                resolve(apiClient(originalRequest));
              },
              reject,
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;
        refreshStartedAt = Date.now();

        try {
          // Refresh via cookie — refreshToken is sent automatically as HttpOnly cookie.
          // 共有の単一フライト関数を使い、socket 側のリフレッシュと重複させない
          // （URL チェックでインターセプタの再帰は防止済み）。
          await refreshSession();

          // Cookie is automatically updated by the browser
          processQueue(null);
        } catch (refreshError) {
          processQueue(refreshError);

          // Force logout only on a definitive auth failure (server returned 401).
          // Network errors / 5xx leave the cookies on the device untouched so the
          // next request can retry the refresh instead of dropping a valid session.
          const refreshStatus = (refreshError as AxiosError)?.response?.status;
          if (refreshStatus === 401 && onLogout) {
            onLogout();
          }

          return Promise.reject(refreshError);
        } finally {
          resetRefreshState();
        }

        // Strip abort signal from retry — the original AbortController may have
        // fired during the refresh process (e.g., tab suspension), which would
        // immediately cancel the retry even though refresh succeeded.
        delete originalRequest.signal;

        // Retry original request — new token cookie will be sent automatically
        return apiClient(originalRequest);
      }

      return Promise.reject(error);
    },
  );
};

// ヘルパー関数
export const getData = <T = unknown>(res: AxiosResponse<{ data: T }>) => res.data.data;
export const getResponse = <T = unknown>(res: AxiosResponse<T>) => res.data;
