import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import axios from 'axios';
import { setupInterceptors, resetInterceptorState } from '../api';
import { authApi } from '../api/auth';
import { startAuthentication } from '@simplewebauthn/browser';
import { useQueryClient } from '@tanstack/react-query';
import { formatApiError } from '../utils/apiError';
import type { User, AuthContextType, RateInput } from '../types';
import { AxiosError } from 'axios';

const AuthContext = createContext<AuthContextType | null>(null);

function isMaintenanceError(err: unknown): boolean {
  const axiosErr = err as AxiosError | undefined;
  const res = axiosErr?.response;
  if (!res || res.status !== 503) return false;
  const header =
    res.headers?.['x-maintenance'] ?? (res.headers as Record<string, unknown>)?.['X-Maintenance'];
  return header === '1' || header === 1;
}

// PWA をしばらく閉じてから開くと、復帰直後の最初のネットワーク要求が遅延・失敗
// しがちで /me がタイムアウトすることがある。これを「未認証」と断定して即ログイン
// 画面へ送ると、リフレッシュトークン（30日）が有効でも誤ってログアウトしたように
// 見える。確定的な 401 以外（ネットワークエラー・タイムアウト・中断）は不確定として
// 数回リトライしてから諦める。
const INIT_MAX_RETRIES = 3;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  // Incremented to force initAuth to re-run when the PWA resumes from a
  // long suspension and the previous /me fetch appears to be stuck.
  const [initAttempt, setInitAttempt] = useState(0);
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    // Await the server logout so the Set-Cookie clear headers are actually
    // applied to the browser before the caller navigates away. A short
    // timeout keeps the UI responsive if the network is slow.
    try {
      await authApi.logout({ timeout: 3000 });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.warn('Logout API request failed:', error.message);
      } else {
        console.warn('Logout API request failed:', (error as Error).message);
      }
    }

    resetInterceptorState(); // Clear any pending refresh state from previous session
    setUser(null);
    queryClient.removeQueries(); // Remove all queries
    queryClient.clear(); // Clear all cached data

    // SW のオフライン用 API キャッシュを破棄（同一端末で別ユーザーが
    // ログインした際に前ユーザーのデータがオフライン表示されるのを防ぐ）
    if ('caches' in window) {
      try {
        await caches.delete('api-cache');
      } catch {
        // Cache API が使えない環境では無視
      }
    }
  }, [queryClient]);

  // Use ref to allow the interceptor callback to always access the latest user
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Setup Axios interceptor to handle 401s with auto-refresh
  useEffect(() => {
    setupInterceptors(() => {
      // Called only when refresh also fails — force logout.
      // Fire-and-forget: interceptor callback is sync; UI reacts to setUser(null).
      if (userRef.current) {
        void logout();
      }
    });
  }, [logout]);

  // Interceptor / post-submit ハンドラからの「メンテ中」通知を受けて
  // アプリ全体をメンテナンス表示に切り替える。
  useEffect(() => {
    const handler = () => setMaintenance(true);
    window.addEventListener('maintenance-detected', handler);
    return () => window.removeEventListener('maintenance-detected', handler);
  }, []);

  // Verify auth on mount — uses raw axios to bypass the interceptor entirely.
  // This prevents infinite loading when the interceptor's isRefreshing state
  // is stuck from a previously suspended tab, or when the refresh endpoint
  // returns an unexpected status code.
  // Re-runs when initAttempt changes, so the visibility handler can retry
  // a stuck init after the PWA resumes from suspension.
  useEffect(() => {
    const controller = new AbortController();

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // 復帰直後にハングした要求を強制的に打ち切る最後の安全弁。リトライの最大
    // 所要時間（8s × 試行 + バックオフ）を十分に上回る余裕を持たせる。
    const safetyTimeout = setTimeout(() => {
      controller.abort(); // cancel any still-pending requests
      if (retryTimer) clearTimeout(retryTimer);
      setLoading((prev) => {
        if (prev) {
          console.warn('Auth init safety timeout — forcing loading to false');
        }
        return false;
      });
    }, 45000);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, ms);
      });

    // 不確定な失敗（ネットワークエラー・タイムアウト・5xx 等）は確定的な未認証
    // ではないため、ここで true を返してリトライ対象とする。確定的な 401 のみ
    // false（=即ログアウト確定）。
    const isIndeterminate = (err: unknown): boolean => {
      const status = (err as AxiosError)?.response?.status;
      // レスポンス自体が無い（ネットワーク・タイムアウト・CORS 等）→ 不確定
      if (status === undefined) return true;
      // 401 は確定的な未認証。それ以外の 4xx/5xx は不確定として扱う。
      return status !== 401;
    };

    const fetchMe = () =>
      axios
        .get('/api/auth/me', {
          withCredentials: true,
          signal: controller.signal,
          timeout: 8000,
        })
        .then((res) => res.data);

    const initAuth = async () => {
      for (let attempt = 0; attempt <= INIT_MAX_RETRIES; attempt++) {
        try {
          // 1. Try to get current user with existing token cookie
          const me = await fetchMe();
          setUser(me);
          return; // success
        } catch (meError: unknown) {
          // クリーンアップ（アンマウント / StrictMode の再実行）による中断は
          // 結果を確定させない。後続の実行（または safetyTimeout）が引き継ぐ。
          if (controller.signal.aborted) {
            return;
          }
          if (isMaintenanceError(meError)) {
            setMaintenance(true);
            setUser(null);
            return;
          }

          const meStatus = (meError as AxiosError)?.response?.status;

          // 2. /me が 401 のときだけリフレッシュを試みる。
          if (meStatus === 401) {
            try {
              // ボディは送らない。refresh はリフレッシュトークンを Cookie から読むため
              // 本来ボディ不要。空ボディ "{}" を送ると、PWA 復帰直後の半死接続で
              // リクエストボディのバイトが届かず、サーバの express.json(raw-body) が
              // 待たされた末に 400（incomplete body）を返す。ボディ無しにすると
              // ボディパーサ待ちが発生せず、/me（GET）と同様に速く確定する。
              const refreshRes = await axios.post('/api/auth/refresh', undefined, {
                withCredentials: true,
                signal: controller.signal,
                timeout: 8000,
              });
              // B-1: the refresh response now carries the user (same shape as
              // /me), so a cold start can settle in 2 round-trips (/me 401 →
              // /refresh) instead of 3. Fall back to /me for older servers.
              const refreshedUser = refreshRes.data?.user;
              if (refreshedUser) {
                setUser(refreshedUser);
                return; // success
              }
              const me = await fetchMe();
              setUser(me);
              return; // success
            } catch (refreshError) {
              if (controller.signal.aborted) {
                return;
              }
              if (isMaintenanceError(refreshError)) {
                setMaintenance(true);
                setUser(null);
                return;
              }
              // リフレッシュが確定的に 401 → リフレッシュトークンも無効 = 本当に
              // ログアウト。ここで初めて setUser(null) を確定させる。
              if (!isIndeterminate(refreshError)) {
                setUser(null);
                return;
              }
              // それ以外（ネットワーク・タイムアウト・5xx）は不確定 → リトライへ
            }
          } else if (!isIndeterminate(meError)) {
            // 401 以外で確定的（理論上ここには来ないが保険）→ 未認証確定
            setUser(null);
            return;
          }
          // ここに来たら不確定な失敗。リトライ回数が残っていれば待って再試行。
          // 残っていなければループを抜けて loading だけ解除する（cookie は端末に
          // 残っているため、ユーザー操作時のリクエストで復帰できる）。
          if (attempt < INIT_MAX_RETRIES) {
            console.warn(
              `Auth init failed (indeterminate) — retrying (${attempt + 1}/${INIT_MAX_RETRIES})`,
            );
            await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s, 4s backoff
            if (controller.signal.aborted) return;
          } else {
            console.warn('Auth init exhausted retries — leaving session undecided');
          }
        }
      }
    };

    initAuth().finally(() => {
      clearTimeout(safetyTimeout);
      if (retryTimer) clearTimeout(retryTimer);
      // 中断時は loading を確定させない（後続の実行が引き継ぐ）
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
    };
  }, [initAttempt]);

  // Track loading state via ref so visibility handler can read latest value
  // without adding `loading` to useEffect dependencies.
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Re-verify auth when the tab becomes visible after being hidden.
  // This handles the scenario where the user leaves the app for hours;
  // when they return the access token cookie (15 min) has expired.
  // Proactively re-verify instead of waiting for a 401 on user action.
  useEffect(() => {
    let hiddenSince: number | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }

      // Tab became visible — check if we were hidden long enough for token to expire
      const wasHiddenMs = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = null;

      // If initAuth is still running after coming back from a non-trivial
      // suspension, the fetch and safety timeout are very likely stuck on
      // a paused JS runtime (iOS PWA backgrounding). Force a retry so the
      // app doesn't sit on the spinner forever.
      if (loadingRef.current) {
        if (wasHiddenMs > 10 * 1000) {
          console.warn('Auth init appears stuck after resume — retrying');
          // Reset loading to true before re-attempting auth so the UI shows
          // the spinner during the retry. This happens in the visibility
          // event handler (not synchronously in the effect body) to satisfy
          // React's set-state-in-effect lint rule.
          setLoading(true);
          setInitAttempt((n) => n + 1);
        }
        return;
      }

      // If hidden for more than 14 minutes (token expires at 15 min), re-verify
      if (wasHiddenMs > 14 * 60 * 1000) {
        authApi
          .me()
          .then((userData) => setUser(userData))
          .catch((err) => {
            // Force logout only on a definitive auth failure (401).
            // Network errors / 5xx mean we couldn't verify the session — the
            // cookies on the device may still be valid, so leave the user
            // logged in and let the next request recover.
            const status = (err as AxiosError)?.response?.status;
            if (status === 401 && userRef.current) {
              void logout();
            }
          });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [logout]);

  const login = async (username: string, password: string) => {
    resetInterceptorState(); // Clear any stale refresh state BEFORE login attempt
    try {
      const data = await authApi.login(username, password);
      const { user } = data;
      setUser(user);
      return { success: true as const };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false as const, error: formatApiError(error, 'ログインに失敗しました') };
    }
  };

  const loginWithPasskey = async () => {
    resetInterceptorState();
    try {
      const options = await authApi.passkeyLoginOptions();
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options });
      } catch (error) {
        // 端末のダイアログを閉じた・対応するパスキーが無い（NotAllowedError）は失敗扱いにしない
        if ((error as Error).name === 'NotAllowedError') {
          return { success: false as const, cancelled: true };
        }
        throw error;
      }
      const data = await authApi.passkeyLoginVerify(response);
      setUser(data.user);
      return { success: true as const };
    } catch (error) {
      console.error('Passkey login failed:', error);
      return {
        success: false as const,
        error: formatApiError(error, 'パスキーでログインできませんでした'),
      };
    }
  };

  const register = async (username: string, password: string, rates: RateInput, email?: string) => {
    resetInterceptorState();
    try {
      const data = await authApi.register(username, password, rates, email || undefined);
      const { user } = data;
      setUser(user);
      return { success: true as const, emailVerificationSent: Boolean(data.emailVerificationSent) };
    } catch (error) {
      console.error('Registration failed:', error);
      const axiosError = error as AxiosError<{ error: string; details?: string }>;
      return {
        success: false as const,
        error: formatApiError(error, '登録に失敗しました'),
        details: axiosError.response?.data?.details,
      };
    }
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, maintenance, login, loginWithPasskey, logout, register, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
