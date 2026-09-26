import { useState } from 'react';
import { Link } from 'react-router';
import { authApi } from '../api/auth';
import { formatApiError } from '../utils/apiError';

/** 再設定メールのリンク先。新しいパスワードを設定する（全端末のログインが切れる） */
export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      await authApi.passwordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(formatApiError(err, 'パスワードを再設定できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">新しいパスワード</h2>

        {!token ? (
          <p className="text-sm text-red-600 font-bold">リンクが正しくありません。</p>
        ) : done ? (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-bold">
            パスワードを再設定しました。すべての端末でログアウトしたので、新しいパスワードでログインしてください。
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm font-bold">
                {error}
              </div>
            )}
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="新しいパスワード（8文字以上・英字と数字か記号）"
              className="w-full p-3 border rounded-lg"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="確認のためもう一度"
              className="w-full p-3 border rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              {busy ? '処理中...' : 'パスワードを再設定'}
            </button>
          </form>
        )}

        <Link
          to="/login"
          className="block text-center text-sm text-blue-600 font-bold mt-6 hover:underline"
        >
          ログイン画面へ
        </Link>
      </div>
    </div>
  );
}
