import { useState } from 'react';
import { Link } from 'react-router';
import { authApi } from '../api/auth';
import { formatApiError } from '../utils/apiError';

/** パスワードを忘れたとき。確認済みのメールアドレスに再設定のリンクを送る */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await authApi.passwordForgot(email);
      // 登録の有無にかかわらず同じ文言（サーバが決める）
      setMessage(res.message);
    } catch (err) {
      setError(formatApiError(err, '送信できませんでした。しばらくしてからお試しください'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">パスワードの再設定</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          設定画面で登録・確認したメールアドレスに、再設定のリンクを送ります
        </p>

        {message ? (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-bold">
            {message}。メールが届かないときは、迷惑メールのフォルダも確かめてください。
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm font-bold">
                {error}
              </div>
            )}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレス"
              className="w-full p-3 border rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              {busy ? '送信中...' : '再設定のリンクを送る'}
            </button>
          </form>
        )}

        <Link
          to="/login"
          className="block text-center text-sm text-blue-600 font-bold mt-6 hover:underline"
        >
          ログイン画面に戻る
        </Link>
      </div>
    </div>
  );
}
