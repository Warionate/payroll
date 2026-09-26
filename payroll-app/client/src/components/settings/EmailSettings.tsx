import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authApi } from '../../api/auth';
import { useConfirm } from '../../hooks/useConfirm';
import { formatApiError } from '../../utils/apiError';

/**
 * メールアドレス。確認メールのリンクを踏んだアドレスだけが登録され、
 * パスワードの再設定とログインに使える。サーバでメール送信が無効なら何も表示しない。
 */
export default function EmailSettings() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<{
    enabled: boolean;
    email: string | null;
    pending: string | null;
  } | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    authApi
      .emailStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(reload, [reload]);

  if (!status?.enabled) return null;

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.emailRequestVerification(input);
      toast.success('確認メールを送りました。24 時間以内にリンクを開いてください');
      setInput('');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, '確認メールを送れませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (
      !(await confirm({
        title: 'メールアドレスの削除',
        message: '削除すると、メールアドレスでのログインとパスワードの再設定が使えなくなります。',
        isDestructive: true,
      }))
    ) {
      return;
    }
    try {
      await authApi.emailRemove();
      toast.success('メールアドレスを削除しました');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, 'メールアドレスを削除できませんでした'));
    }
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Mail className="text-purple-600" />
        メールアドレス
      </h2>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <p className="text-sm text-gray-600">
          登録すると、パスワードを忘れたときにメールで再設定できるようになり、ログイン画面でユーザー名の代わりにも使えます。
        </p>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-400">登録中のアドレス</p>
            <p className="font-bold text-sm text-gray-800 truncate">{status.email ?? '未登録'}</p>
            {status.pending && (
              <p className="text-xs text-orange-500 mt-1">
                {status.pending} の確認待ち（届いたメールのリンクを開くと切り替わります）
              </p>
            )}
          </div>
          {status.email && (
            <button
              type="button"
              onClick={handleRemove}
              className="border border-red-300 text-red-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-50"
            >
              削除
            </button>
          )}
        </div>

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="email"
            required
            autoComplete="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={status.email ? '新しいメールアドレス' : 'メールアドレス'}
            className="flex-1 p-2 border rounded text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            確認メールを送る
          </button>
        </form>
      </div>
    </section>
  );
}
