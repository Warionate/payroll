import { useState, useEffect, useCallback } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'theme';

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStoredPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage が使えない環境（プライベートモード等）
  }
  return 'system';
};

const applyTheme = (preference: ThemePreference) => {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
};

/**
 * テーマ設定（ライト / ダーク / 端末に合わせる）。
 * 選択は localStorage に保存され、index.html の初期化スクリプトが
 * 次回ロード時に React マウント前へ反映する（フラッシュ防止）。
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    applyTheme(preference);

    // 「端末に合わせる」選択中は OS 設定の変更に追従する
    if (preference === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_KEY);
      } else {
        localStorage.setItem(THEME_KEY, next);
      }
    } catch {
      // 保存できなくてもセッション内では反映する
    }
    setPreference(next);
  }, []);

  return { preference, setTheme };
}
