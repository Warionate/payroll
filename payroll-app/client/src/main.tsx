import { z } from 'zod';
z.config({ jitless: true });

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './index.css';
// KaTeX / highlight.js の CSS は MarkdownContentImpl 側で遅延ロードする
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分
      gcTime: 10 * 60 * 1000, // 10分
      retry: 1,
      refetchOnWindowFocus: false, // 不要なリフェッチを削減
      refetchOnMount: true, // マウント時のみリフェッチ
    },
  },
});

import { Toaster } from 'react-hot-toast';
import { ConfirmProvider } from './contexts/ConfirmContext';

// アプリが正常にマウントできたので、白画面セルフヒール（public/recovery.js）の
// 回復フラグを解除する。これにより次回以降の更新でも再びヒールが働く。
try {
  sessionStorage.removeItem('sw-recovery-attempt');
} catch {
  // sessionStorage が使えない環境では何もしない
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <App />
        <Toaster
          position="top-center"
          // ダークモード時は index.css の .dark が --toast-* を定義する
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--toast-bg, #ffffff)',
              color: 'var(--toast-color, #363636)',
            },
          }}
          // viewport-fit=cover のため、ノッチ・角丸・ホームインジケータを避ける
          containerStyle={{
            top: 'calc(env(safe-area-inset-top) + 16px)',
            bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
            left: 'calc(env(safe-area-inset-left) + 16px)',
            right: 'calc(env(safe-area-inset-right) + 16px)',
          }}
        />
      </ConfirmProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
