import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatApiError } from '../../utils/apiError';
import { subscribeUser, unsubscribeUser, checkSubscription } from '../../utils/push';

export default function NotificationSettings() {
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(true);

  useEffect(() => {
    const checkPush = async () => {
      try {
        const hasSub = await checkSubscription();
        setIsPushEnabled(hasSub);
      } catch (e) {
        console.error(e);
        setIsPushSupported(false);
      }
    };
    checkPush();
  }, []);

  const handlePushToggle = async () => {
    try {
      if (isPushEnabled) {
        await unsubscribeUser();
        setIsPushEnabled(false);
      } else {
        await subscribeUser();
        setIsPushEnabled(true);
      }
    } catch (error) {
      console.error('Push toggle failed:', error);
      // 通知許可がブロックされている場合は原因をユーザーが解決できる形で案内する
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        toast.error(
          'ブラウザで通知がブロックされています。ブラウザの設定から通知を許可してください。',
        );
      } else {
        toast.error(formatApiError(error, '通知設定の変更に失敗しました'));
      }
    }
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Bell className="text-yellow-500" />
        通知設定
      </h2>
      <p className="text-xs text-gray-500 mb-4">この端末でのプッシュ通知のON/OFFを切り替えます。</p>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-700">プッシュ通知</h3>
            <p className="text-xs text-gray-400">
              {isPushSupported
                ? isPushEnabled
                  ? '現在、この端末で通知を受け取っています'
                  : '現在、この端末への通知はOFFです'
                : 'このブラウザはプッシュ通知に対応していません'}
            </p>
          </div>

          {isPushSupported && (
            <button
              onClick={handlePushToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                isPushEnabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isPushEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
