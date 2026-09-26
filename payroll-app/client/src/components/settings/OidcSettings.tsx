import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authApi } from '../../api/auth';
import { useConfirm } from '../../hooks/useConfirm';
import { formatApiError } from '../../utils/apiError';

// Authentik から戻ってきたときの結果（サーバが /settings?oidc=... で返す）
const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  linked: { ok: true, text: 'Authentik と連携しました。次からは Authentik でもログインできます' },
  taken: { ok: false, text: 'その Authentik アカウントは、既に別のアカウントと連携されています' },
  failed: { ok: false, text: 'Authentik との連携に失敗しました。もう一度お試しください' },
};

/**
 * Authentik 連携。既存アカウントが主で、ログイン中の本人がここから Authentik を紐づける。
 * サーバ側で OIDC が設定されていなければ何も表示しない。
 */
export default function OidcSettings() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<{ enabled: boolean; linked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authApi
      .oidcStatus()
      .then(setStatus)
      .catch(() => setStatus(null));

    // 連携から戻ってきたときの結果を出し、URL からクエリを消す（再読み込みで二重に出さない）
    const params = new URLSearchParams(window.location.search);
    const result = params.get('oidc');
    if (result) {
      const msg = RESULT_MESSAGES[result] ?? RESULT_MESSAGES.failed;
      if (msg.ok) toast.success(msg.text);
      else toast.error(msg.text);
      params.delete('oidc');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

  if (!status?.enabled) return null;

  const handleLink = async () => {
    setBusy(true);
    try {
      const { url } = await authApi.oidcLinkStart();
      window.location.href = url;
    } catch (error) {
      toast.error(formatApiError(error, '連携を始められませんでした'));
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (
      !(await confirm({
        title: 'Authentik 連携の解除',
        message:
          '連携を解除すると、Authentik ではログインできなくなります。ユーザー名とパスワードでのログインはこれまでどおり使えます。',
        isDestructive: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await authApi.oidcUnlink();
      setStatus({ ...status, linked: false });
      toast.success('Authentik との連携を解除しました');
    } catch (error) {
      toast.error(formatApiError(error, '連携の解除に失敗しました'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <KeyRound className="text-purple-600" />
        Authentik 連携
      </h2>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-3">
        <p className="text-sm text-gray-600">
          このアカウントに Authentik（シングルサインオン）を紐づけると、ログイン画面の「Authentik
          でログイン」から入れるようになります。ユーザー名とパスワードでのログインもそのまま使えます。
        </p>
        <div className="flex items-center justify-between gap-3">
          <span
            className={`text-sm font-bold ${status.linked ? 'text-green-600' : 'text-gray-400'}`}
          >
            {status.linked ? '連携済み' : '未連携'}
          </span>
          {status.linked ? (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={busy}
              className="border border-red-300 text-red-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-50 disabled:opacity-50"
            >
              連携を解除
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLink}
              disabled={busy}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              Authentik と連携
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
