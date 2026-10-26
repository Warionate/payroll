import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Authentik での本人確認から戻ってくる画面（小さなウィンドウ）。元の画面が確認の結果を見て
 * 操作を続けるので、ここではウィンドウを閉じるだけ
 */
export default function ReauthComplete() {
  const ok = new URLSearchParams(window.location.search).get('result') === 'ok';

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => window.close(), 800);
    return () => clearTimeout(t);
  }, [ok]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white rounded-2xl shadow p-6 max-w-sm w-full text-center space-y-3">
        {ok ? (
          <CheckCircle2 className="mx-auto text-green-600" size={40} />
        ) : (
          <XCircle className="mx-auto text-red-600" size={40} />
        )}
        <p className="font-bold text-gray-800">{ok ? '確認できました' : '確認できませんでした'}</p>
        <p className="text-sm text-gray-600">
          {ok
            ? 'このウィンドウは閉じて、元の画面に戻ってください。'
            : 'このアカウントに連携している Authentik のアカウントでログインしてください。'}
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
