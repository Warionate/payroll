import { useSyncExternalStore } from 'react';

const subscribe = (callback: () => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

const getSnapshot = () => navigator.onLine;

/**
 * ブラウザのオンライン/オフライン状態を返す。
 * オフライン中は SW の api-cache から直近データが表示されるため、
 * 「最後に取得した内容を表示中」であることをバナーで明示する用途に使う。
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
