import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { authApi } from '../../api/auth';
import { setReauthHandler } from '../../api/client';
import { formatApiError } from '../../utils/apiError';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

/**
 * 大事な操作（メールアドレス・パスキー・Authentik 連携の変更）の前の本人確認。
 * API クライアントが 403 + reauth を受けるとここが開き、パスワードの確認が済むと元の操作をやり直す。
 * アプリに1つだけ置く。
 */
export default function ReauthDialog() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    setReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current?.(false); // 前の問い合わせが残っていれば閉じる
          resolver.current = resolve;
          setOpen(true);
        }),
    );
    return () => setReauthHandler(null);
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  };

  if (!open) return null;
  return <ReauthForm onDone={finish} />;
}

function ReauthForm({ onDone }: { onDone: (ok: boolean) => void }) {
  const { modalRef } = useModalAccessibility({ isOpen: true, onClose: () => onDone(false) });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // パスキーを持っていれば、パスワードの代わりにパスキーでも確認できる
  const [hasPasskey, setHasPasskey] = useState(false);
  // Authentik と連携していれば、Authentik にログインし直して確認することもできる
  const [hasOidc, setHasOidc] = useState(false);
  const [waitingOidc, setWaitingOidc] = useState(false);

  useEffect(() => {
    authApi
      .oidcStatus()
      .then((s) => setHasOidc(s.enabled && s.linked))
      .catch(() => setHasOidc(false));
  }, []);

  // Authentik のウィンドウを開いている間、確認が済んだかを見る
  useEffect(() => {
    if (!waitingOidc) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      authApi
        .reauthStatus()
        .then((s) => {
          if (s.fresh) {
            clearInterval(timer);
            onDone(true);
          } else if (Date.now() - startedAt > 5 * 60 * 1000) {
            clearInterval(timer);
            setWaitingOidc(false);
            setBusy(false);
            setError('時間内に確認できませんでした。もう一度お試しください');
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [waitingOidc, onDone]);

  const handleOidc = async () => {
    if (busy) return;
    // ポップアップがブロックされないよう、クリックの直後に空のウィンドウを開いてから URL を入れる
    const win = window.open('about:blank', 'authentik-reauth', 'width=480,height=720');
    setBusy(true);
    setError('');
    try {
      const { url } = await authApi.reauthOidc();
      if (win) win.location.href = url;
      else window.open(url, 'authentik-reauth', 'width=480,height=720');
      setWaitingOidc(true);
    } catch (err) {
      win?.close();
      setError(formatApiError(err, 'Authentik での確認を始められませんでした'));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window.PublicKeyCredential !== 'function') return;
    authApi
      .passkeyList()
      .then((r) => setHasPasskey(r.passkeys.length > 0))
      .catch(() => setHasPasskey(false));
  }, []);

  const handlePasskey = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const options = await authApi.reauthPasskeyOptions();
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options });
      } catch (err) {
        if ((err as Error).name === 'NotAllowedError') {
          setBusy(false);
          return; // 端末のダイアログを閉じた
        }
        throw err;
      }
      await authApi.reauthPasskeyVerify(response);
      onDone(true);
    } catch (err) {
      setError(formatApiError(err, 'パスキーで確認できませんでした'));
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await authApi.reauth(password);
      onDone(true);
    } catch (err) {
      setError(formatApiError(err, '確認できませんでした'));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 overlay-safe animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-modal-title"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-full overflow-y-auto animate-scale-in"
      >
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                <ShieldCheck size={24} />
              </div>
              <h3 id="reauth-modal-title" className="font-bold text-lg text-gray-800">
                本人確認
              </h3>
            </div>
            <p className="text-gray-600 leading-relaxed text-sm mb-4">
              大事な設定を変えるため、もう一度本人確認をしてください。
            </p>
            {hasOidc && (
              <button
                type="button"
                onClick={() => void handleOidc()}
                disabled={busy}
                className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-lg disabled:opacity-50 mb-3 ${
                  hasPasskey
                    ? 'border border-gray-300 hover:bg-gray-50 text-gray-700'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <KeyRound size={18} />
                {waitingOidc ? 'Authentik の画面で確認してください…' : 'Authentik で確認'}
              </button>
            )}
            {hasPasskey && (
              <>
                <button
                  type="button"
                  onClick={() => void handlePasskey()}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50 mb-4"
                >
                  <Fingerprint size={18} />
                  パスキーで確認
                </button>
                <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                  <span className="flex-1 border-t" />
                  またはパスワード
                  <span className="flex-1 border-t" />
                </div>
              </>
            )}
            <label className="block text-xs font-bold text-gray-500 mb-1" htmlFor="reauth-password">
              パスワード
            </label>
            <div className="relative">
              <input
                id="reauth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 pr-10 border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={!hasPasskey}
                autoFocus={!hasPasskey}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          </div>
          <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
            <button
              type="button"
              onClick={() => onDone(false)}
              disabled={busy}
              className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!password || busy}
              className="px-4 py-2 text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors text-sm disabled:opacity-50"
            >
              {busy ? '確認中...' : '確認する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
