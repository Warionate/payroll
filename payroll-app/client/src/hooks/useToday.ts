import { useEffect, useState } from 'react';

/** タブ復帰時に「現在時刻」を更新する最小間隔（無駄な再レンダー防止） */
const REFRESH_MIN_INTERVAL_MS = 60 * 1000;

/**
 * 「現在時刻」を表す Date を返すフック。
 *
 * PWA は何日もバックグラウンドに置かれたまま復帰することがあり、
 * マウント時に固定した `new Date()` のままだと「今日」「給与対象月」
 * 「直近の予定」などが過去の日付基準で表示され続ける。
 * タブが可視化されたタイミングで値を更新して再計算を誘発する。
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      setToday((prev) =>
        Date.now() - prev.getTime() < REFRESH_MIN_INTERVAL_MS ? prev : new Date(),
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return today;
}
