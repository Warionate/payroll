import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Payroll App',
        short_name: 'Payroll',
        description: 'Individual Tutoring Payroll Calculator',
        theme_color: '#ffffff',
        // scripts/generate-icons.mjs で logo-icon.svg から生成
        icons: [
          {
            src: 'logo-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'logo-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'logo-icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '0.0.0.0', // LAN公開用
    allowedHosts: ['payroll.warionate.com', 'dev.warionate.com'],
    port: 4000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // PDF renderer (1.5MB) is large but lazy-loaded, so we increase the limit
    chunkSizeWarningLimit: 1600,
    // ソースマップは本番環境では無効化
    sourcemap: false,
    // minify設定
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // コード分割の最適化
        // Vite 8 の Rolldown はオブジェクト形式の manualChunks を受け付けないため
        // codeSplitting.groups（モジュール ID の正規表現マッチ）で指定する
        codeSplitting: {
          groups: [
            // React関連
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
            // TanStack Query
            { name: 'query', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            // 日付処理
            { name: 'date-utils', test: /[\\/]node_modules[\\/]date-fns[\\/]/ },
            // アイコン
            { name: 'icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
            // Markdown + コードハイライト
            {
              name: 'markdown',
              test: /[\\/]node_modules[\\/](react-markdown|remark-gfm|remark-math|remark-emoji|rehype-highlight|rehype-katex)[\\/]/,
            },
            // KaTeX + highlight.js（CSS は main.tsx で読み込み）
            { name: 'syntax', test: /[\\/]node_modules[\\/](katex|highlight\.js)[\\/]/ },
          ],
        },
        // チャンク名の形式
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    // ビルド最適化
    target: 'es2020',
    cssCodeSplit: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Exclude Playwright E2E tests (run separately with `npx playwright test`)
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
