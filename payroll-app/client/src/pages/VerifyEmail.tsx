import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { authApi } from '../api/auth';
import { formatApiError } from '../utils/apiError';

/** 確認メールのリンク先。ログインしていない端末でも開けるよう、トークンだけで確認する */
export default function VerifyEmail() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(() =>
    token ? null : { ok: false, text: 'リンクが正しくありません' },
  );
  const started = useRef(false);

  useEffect(() => {
    // StrictMode の二重実行でトークン（1回だけ有効）を使い切らないようにする
    if (!token || started.current) return;
    started.current = true;
    authApi
      .emailConfirm(token)
      .then((r) => setState({ ok: true, text: `${r.email} を登録しました` }))
      .catch((err) =>
        setState({ ok: false, text: formatApiError(err, 'メールアドレスを確認できませんでした') }),
      );
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">メールアドレスの確認</h2>
        {!state ? (
          <p className="text-sm text-gray-500">確認しています...</p>
        ) : (
          <p className={`text-sm font-bold ${state.ok ? 'text-green-600' : 'text-red-600'}`}>
            {state.text}
          </p>
        )}
        <Link to="/" className="block text-sm text-blue-600 font-bold mt-6 hover:underline">
          アプリを開く
        </Link>
      </div>
    </div>
  );
}
