import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import { authApi } from '../../api/auth';
import { useConfirm } from '../../hooks/useConfirm';
import { formatApiError } from '../../utils/apiError';

/**
 * 認証アプリ（Google Authenticator・Microsoft Authenticator・1Password 等）の登録。
 * 登録すると、パスワードのあとに 6 桁のコードを入れてログインする。
 * 回復コード（使い捨て 10 個）は登録の直後に1回だけ見せる。
 */
export default function TotpSettings({ onChanged }: { onChanged?: () => void }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<{
    totp: boolean;
    recoveryCodesLeft: number;
    trustedDevices: number;
  } | null>(null);
  const [pending, setPending] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    authApi
      .mfaStatus()
      .then((s) =>
        setStatus({
          totp: s.totp,
          recoveryCodesLeft: s.recoveryCodesLeft,
          trustedDevices: s.trustedDevices,
        }),
      )
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const start = async () => {
    setBusy(true);
    try {
      const { secret, uri } = await authApi.totpSetup();
      setPending({ secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }) });
      setCode('');
    } catch (error) {
      toast.error(formatApiError(error, '認証アプリの登録を始められませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { recoveryCodes: codes } = await authApi.totpConfirm(code);
      setPending(null);
      setRecoveryCodes(codes);
      toast.success('認証アプリを登録しました');
      reload();
      onChanged?.();
    } catch (error) {
      toast.error(formatApiError(error, 'コードを確認できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (
      !(await confirm({
        title: '認証アプリの解除',
        message: '認証アプリでのログインをやめますか？回復コードも使えなくなります。',
        isDestructive: true,
      }))
    ) {
      return;
    }
    try {
      await authApi.totpDisable();
      toast.success('認証アプリを解除しました');
      reload();
      onChanged?.();
    } catch (error) {
      toast.error(formatApiError(error, '解除できませんでした'));
    }
  };

  const regenerate = async () => {
    if (
      !(await confirm({
        title: '回復コードの作り直し',
        message: '今の回復コードは使えなくなります。作り直しますか？',
      }))
    ) {
      return;
    }
    try {
      const { recoveryCodes: codes } = await authApi.recoveryCodesRegenerate();
      setRecoveryCodes(codes);
      reload();
    } catch (error) {
      toast.error(formatApiError(error, '作り直せませんでした'));
    }
  };

  const clearTrusted = async () => {
    try {
      await authApi.trustedDevicesClear();
      toast.success('記憶した端末を解除しました。次のログインからコードを求めます');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, '解除できませんでした'));
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes!.join('\n'));
      toast.success('コピーしました');
    } catch {
      toast.error('コピーできませんでした。書き写してください');
    }
  };

  if (!status) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        スマートフォンの認証アプリ（Google Authenticator・Microsoft Authenticator
        など）を登録すると、パスワードのあとに 6 桁のコードを入れてログインします。
      </p>

      {recoveryCodes && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">
            回復コード（この画面でしか表示しません）
          </p>
          <p className="text-xs text-amber-700">
            スマートフォンを失くしたときに、6 桁のコードの代わりに使えます（各コード 1
            回だけ）。紙に書くかパスワード管理アプリに保存してください。
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-gray-800">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={copyCodes}
              className="text-sm font-bold text-amber-800 flex items-center gap-1"
            >
              <Copy size={14} /> コピー
            </button>
            <button
              type="button"
              onClick={() => setRecoveryCodes(null)}
              className="text-sm font-bold text-gray-600"
            >
              保存しました
            </button>
          </div>
        </div>
      )}

      {status.totp ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-green-700 flex items-center gap-2">
            <KeyRound size={16} /> 登録済み（残りの回復コード {status.recoveryCodesLeft} 個）
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={regenerate}
              className="text-sm font-bold text-blue-600 hover:text-blue-700"
            >
              回復コードを作り直す
            </button>
            <button
              type="button"
              onClick={disable}
              className="text-sm font-bold text-red-600 hover:text-red-700"
            >
              解除
            </button>
          </div>
        </div>
      ) : null}

      {status.totp && status.trustedDevices > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm bg-gray-50 rounded-lg p-3">
          <span className="text-gray-600">
            コードを求めない端末: {status.trustedDevices} 台（最長 30 日）
          </span>
          <button
            type="button"
            onClick={clearTrusted}
            className="font-bold text-red-600 hover:text-red-700"
          >
            すべて解除
          </button>
        </div>
      )}

      {status.totp ? null : pending ? (
        <form onSubmit={finish} className="space-y-3">
          <p className="text-sm text-gray-700">
            1. 認証アプリで QR コードを読み取ってください（読めないときは下のキーを入力）
          </p>
          <img src={pending.qr} alt="認証アプリ用の QR コード" className="w-48 h-48 border" />
          <p className="text-xs font-mono break-all text-gray-500 select-all">{pending.secret}</p>
          <label className="block text-sm text-gray-700" htmlFor="totp-confirm">
            2. アプリに表示された 6 桁のコードを入力してください
          </label>
          <div className="flex gap-2">
            <input
              id="totp-confirm"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-32 p-2 border rounded font-mono text-lg tracking-widest"
            />
            <button
              type="submit"
              disabled={code.length !== 6 || busy}
              className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              登録する
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
        >
          認証アプリを登録する
        </button>
      )}
    </div>
  );
}
