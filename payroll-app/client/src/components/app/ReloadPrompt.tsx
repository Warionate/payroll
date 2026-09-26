import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'react-hot-toast';
import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

function ReloadPrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (import.meta.env.DEV) {
        console.debug(`Service Worker at: ${swUrl} registered.`);
      }
      registrationRef.current = registration;
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) {
        console.warn('SW registration error', error);
      }
    },
  });

  // タブ/アプリ復帰時にSW更新をチェック。
  // 週数回しか開かないユーザーでも、開いた瞬間に最新版を拾えるようにする。
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        registrationRef.current?.update();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 更新後のリロードは vite-plugin-pwa（prompt モード）が `controlling`
  // イベントで処理する。本物の更新（event.isUpdate）時のみ一度だけリロードする。
  // ここで controllerchange を捕まえて自前で reload すると、初回インストールの
  // clientsClaim() でも発火してしまい、precache 書き込み直後の不要なリロードで
  // エントリチャンクの読み込みが中断され白画面になる。さらに更新時は vite 側の
  // リロードと二重に走るため、手動ハンドラは置かない。

  useEffect(() => {
    if (needRefresh) {
      toast(
        (t) => (
          <div className="flex items-start gap-3">
            <div className="bg-primary-100 text-primary-600 p-2 rounded-lg shrink-0">
              <RefreshCw size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-gray-800">新しいバージョンがあります</p>
              <p className="text-sm text-gray-500 mt-0.5">
                アップデートして最新の機能を利用できます
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 transition-colors"
                  onClick={() => {
                    updateServiceWorker(true);
                    toast.dismiss(t.id);
                  }}
                >
                  アップデート
                </button>
                <button
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                  onClick={() => {
                    setNeedRefresh(false);
                    toast.dismiss(t.id);
                  }}
                >
                  後で
                </button>
              </div>
            </div>
          </div>
        ),
        {
          duration: Infinity,
          position: 'top-center',
          style: {
            background: 'var(--toast-bg, #ffffff)',
            color: 'var(--toast-color, #363636)',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.18)',
            border: '1px solid var(--color-gray-200, #e5e7eb)',
            padding: '16px',
            maxWidth: '420px',
            width: 'calc(100vw - 32px)',
          },
        },
      );
    }
  }, [needRefresh, updateServiceWorker, setNeedRefresh]);

  return null;
}

export default ReloadPrompt;
