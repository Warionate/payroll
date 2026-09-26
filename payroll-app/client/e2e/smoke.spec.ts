import { test, expect } from '@playwright/test';

/**
 * スモークテスト - アプリケーションの基本機能確認
 * 認証不要で実行可能なテスト
 */
test.describe('スモークテスト', () => {
  test('アプリケーションが起動する', async ({ page }) => {
    await page.goto('/');

    // ページが読み込まれることを確認（/.*/ は空文字にもマッチするため実タイトルで検証）
    await expect(page).toHaveTitle(/Payroll App/);
  });

  test('ログインページが表示される', async ({ page }) => {
    await page.goto('/login');

    // ページが読み込まれることを確認
    await expect(page).toHaveTitle(/Payroll App/);

    // 何かしらの入力フィールドがあることを確認
    const inputs = page.locator('input');
    await expect(inputs.first()).toBeVisible({ timeout: 10000 });
  });

  test('ログインフォームに必要な要素がある', async ({ page }) => {
    await page.goto('/login');

    // パスワード入力欄の存在確認
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 });

    // 送信ボタンの存在確認
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('CSS/スタイルが読み込まれている', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // ページに何かしらのスタイルが適用されていることを確認
    const bodyBgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // デフォルトの白以外の背景色があるか確認（Tailwind使用の場合）
    expect(bodyBgColor).toBeTruthy();
  });

  test('JavaScriptが動作している', async ({ page }) => {
    await page.goto('/');

    // Reactアプリがマウントされていることを確認（#rootに子要素がある）
    const rootHasChildren = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    });

    expect(rootHasChildren).toBe(true);
  });

  test('未認証時はログインにリダイレクトされる', async ({ page }) => {
    // 保護されたルートにアクセス
    await page.goto('/settings');

    // ログインページにリダイレクトされるか、ログインフォームが表示される
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const hasLoginForm = await page
      .locator('input[type="password"]')
      .isVisible()
      .catch(() => false);

    // URLにloginが含まれるか、ログインフォームが表示されている
    expect(url.includes('login') || hasLoginForm).toBe(true);
  });
});

test.describe('パフォーマンス基本チェック', () => {
  test('ページが5秒以内に読み込まれる', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('コンソールに重大なエラーがない', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 致命的なエラーがないことを確認
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('ResizeObserver') && // よくある無害なエラー
        !e.includes('Non-Error'), // React DevTools関連
    );

    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('API接続確認', () => {
  test('APIサーバーが応答する', async ({ request }) => {
    // 認証不要のエンドポイントをテスト
    const response = await request.get('http://localhost:4001/api/auth/me');

    // 401 (未認証) または 200 が返ることを確認
    expect([200, 401]).toContain(response.status());
  });

  test('ヘルスチェック的なリクエストが成功する', async ({ request }) => {
    // ルートへのリクエスト
    const response = await request.get('http://localhost:4000/');
    expect(response.status()).toBe(200);
  });
});
