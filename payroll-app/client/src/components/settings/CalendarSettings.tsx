import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Calendar, Copy, RefreshCw, Check } from 'lucide-react';
import { useCalendarToken } from '../../hooks/useCalendarToken';
import { useConfirm } from '../../hooks/useConfirm';
import { toast } from 'react-hot-toast';

// Constants
const COPY_FEEDBACK_DURATION_MS = 2000;

// SVGアイコン
const AppleIcon = () => (
  <svg viewBox="0 0 384 512" className="w-5 h-5 fill-current">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 52.3-11.4 69.5-34.3z" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export default function CalendarSettings() {
  const confirm = useConfirm();
  const { data: calendarTokenData, isLoading, isError, resetMutation } = useCalendarToken();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const { feedUrl, webcalUrl } = useMemo(() => {
    if (!calendarTokenData?.token) return { feedUrl: '', webcalUrl: '' };
    const { protocol, host } = window.location;
    const baseUrl = `/api/calendar/${calendarTokenData.token}/feed.ics`;
    return {
      feedUrl: `${protocol}//${host}${baseUrl}`,
      webcalUrl: `webcal://${host}${baseUrl}`,
    };
  }, [calendarTokenData?.token]);

  const handleGoogleCalendarClick = useCallback(() => {
    const url = `https://www.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [webcalUrl]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    // Clear existing timeout if any
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
  }, [feedUrl]);

  const handleReset = useCallback(async () => {
    if (
      await confirm({
        title: 'URL再生成',
        message: 'URLを再生成しますか？古いURLは無効になります。',
        isDestructive: true,
      })
    ) {
      try {
        await resetMutation.mutateAsync();
        toast.success('URLを再生成しました');
      } catch (error) {
        console.error('Failed to reset calendar URL:', error);
        toast.error('再生成に失敗しました');
      }
    }
  }, [confirm, resetMutation]);

  if (isLoading) {
    return (
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar className="text-orange-500" />
          カレンダー連携
        </h2>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="text-center py-4 text-gray-500">読み込み中...</div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar className="text-orange-500" />
          カレンダー連携
        </h2>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="text-center py-4 text-red-500">
            エラーが発生しました。再度お試しください。
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Calendar className="text-orange-500" />
        カレンダー連携
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        GoogleカレンダーやiPhoneのカレンダーアプリにスケジュールを同期できます。
      </p>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        {calendarTokenData?.token ? (
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg flex items-center justify-between gap-2 border border-gray-200">
              <code className="text-xs text-gray-500 break-all font-mono">{feedUrl}</code>
              <button
                onClick={handleCopy}
                className="bg-gray-100 text-gray-600 px-3 rounded-lg font-bold text-xs hover:bg-gray-200 flex items-center gap-1"
                aria-label="URLをコピー"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={webcalUrl}
                className="flex items-center justify-center gap-2 bg-black text-white font-bold py-3 px-4 rounded-xl hover:bg-gray-800 transition-colors"
              >
                <AppleIcon />
                Apple Calendar
              </a>
              <button
                onClick={handleGoogleCalendarClick}
                className="flex items-center justify-center gap-2 bg-white text-gray-700 font-bold py-3 px-4 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <GoogleIcon />
                Google Calendar
              </button>
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <button
                onClick={handleReset}
                className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                aria-label="URLを再生成"
              >
                <RefreshCw size={12} /> URLを再生成 (リセット)
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-400 text-sm">読み込み中...</div>
        )}
      </div>
    </section>
  );
}
