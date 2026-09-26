import { defineConfig, devices } from '@playwright/test';

/**
 * E2Eテスト設定
 * @see https://playwright.dev/docs/test-configuration
 */

const isCI = !!process.env.CI;
const BACKEND_PORT = 4001;
const FRONTEND_PORT = 4000;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // モバイルはローカルのみ
    ...(!isCI ? [{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }] : []),
  ],

  webServer: [
    {
      command: 'npm run dev',
      cwd: '../',
      url: `http://localhost:${BACKEND_PORT}/api/auth/me`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        JWT_SECRET: 'test_jwt_secret_at_least_32_chars_long_123',
        ENCRYPTION_KEY: '12345678901234567890123456789012',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev',
      cwd: './',
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
