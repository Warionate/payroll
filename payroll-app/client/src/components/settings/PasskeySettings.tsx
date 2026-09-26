import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { startRegistration } from '@simplewebauthn/browser';
import { authApi } from '../../api/auth';
import { useConfirm } from '../../hooks/useConfirm';
import { formatApiError } from '../../utils/apiError';

type Passkey = Awaited<ReturnType<typeof authApi.passkeyList>>['passkeys'][number];

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ja-JP', { dateStyle: 'medium' }) : '—';

/**
 * パスキー。既存アカウントに足すもので、登録するとログイン画面の「パスキーでログイン」から
 * パスワードなしで入れる。サーバ側で無効、またはブラウザが非対応なら何も表示しない。
 */
export default function PasskeySettings() {
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    authApi
      .passkeyList()
      .then((r) => setPasskeys(r.passkeys))
      .catch(() => setPasskeys([]));
  }, []);

  useEffect(() => {
    authApi
      .passkeyConfig()
      .then((c) => {
        const ok = c.enabled && typeof window.PublicKeyCredential === 'function';
        setEnabled(ok);
        if (ok) reload();
      })
      .catch(() => setEnabled(false));
  }, [reload]);

  if (!enabled) return null;

  const handleAdd = async () => {
    setBusy(true);
    try {
      const options = await authApi.passkeyRegisterOptions();
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch (error) {
        const e = error as Error;
        if (e.name === 'NotAllowedError') return; // ダイアログを閉じた
        if (e.name === 'InvalidStateError') {
          toast.error('この端末のパスキーは既に登録されています');
          return;
        }
        throw error;
      }
      await authApi.passkeyRegisterVerify(response, name || 'パスキー');
      setName('');
      toast.success('パスキーを登録しました。次からはパスキーだけでログインできます');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, 'パスキーを登録できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (passkey: Passkey) => {
    if (
      !(await confirm({
        title: 'パスキーの削除',
        message: `「${passkey.name}」を削除しますか？削除したパスキーではログインできなくなります。端末に残ったパスキーは、端末の設定から消してください。`,
        isDestructive: true,
      }))
    ) {
      return;
    }
    try {
      await authApi.passkeyDelete(passkey.id);
      toast.success('パスキーを削除しました');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, 'パスキーを削除できませんでした'));
    }
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Fingerprint className="text-purple-600" />
        パスキー
      </h2>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <p className="text-sm text-gray-600">
          パスキーを登録すると、ログイン画面の「パスキーでログイン」から、指紋・顔認証・端末の PIN
          だけで入れるようになります。パスワードでのログインもそのまま使えます。
        </p>

        {passkeys.length > 0 && (
          <ul className="divide-y border rounded-lg">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    登録 {formatDate(p.created_at)} ・ 最終使用 {formatDate(p.last_used_at)}
                    {p.synced && ' ・ 端末間で同期'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="text-red-500 hover:text-red-700 p-2"
                  aria-label={`${p.name} を削除`}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="名前（例: iPhone、仕事用 PC）"
            className="flex-1 p-2 border rounded text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy}
            className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            パスキーを追加
          </button>
        </div>
      </div>
    </section>
  );
}
