import { test, expect } from '@playwright/test';

/**
 * 認証フローテスト
 * 注意: 実際のテストユーザーが必要です
 */
test.describe('認証フロー', () => {
  const testUser = { username: `e2e_user_${Date.now()}`, password: 'password123' };

  test.beforeAll(async ({ request }) => {
    // ユーザー登録
    const res = await request.post('http://localhost:4001/api/auth/register', {
      data: testUser,
    });
    // 既に存在する場合（再実行時など）は無視、またはエラーハンドリング
    // 新規ユーザー名を使うので基本OK
    if (!res.ok() && res.status() !== 400) {
      console.error('Failed to create test user', await res.text());
    }
  });

  test('正しい認証情報でログイン成功', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', testUser.username);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');

    // ダッシュボードへのリダイレクトを確認
    await expect(page).toHaveURL('/');
    // ダッシュボード固有の要素（例えばログアウトボタンや挨拶）を確認
    // ここではヘッダーのユーザー名表示などを想定
    // ユーザー名が表示されている要素を探す（デスクトップ・モバイルどちらかで表示されていればOK）
    await expect(page.locator(`text=${testUser.username}`).locator('visible=true')).toBeVisible();
  });
  test('ログインページの要素確認', async ({ page }) => {
    await page.goto('/login');

    // タイトルまたはロゴの存在
    const heading = page.locator('h1, h2, .logo, [class*="title"]').first();
    await expect(heading).toBeVisible({ timeout: 5000 });

    // ユーザー名入力欄
    const usernameInput = page
      .locator('input[type="text"], input[name="username"], input[placeholder*="ユーザー"]')
      .first();
    await expect(usernameInput).toBeVisible();

    // パスワード入力欄
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // ログインボタン
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('空のフォーム送信でバリデーション', async ({ page }) => {
    await page.goto('/login');

    // 空のまま送信
    await page.click('button[type="submit"]');

    // HTML5バリデーションまたはカスタムエラー
    const hasValidation = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (!input.validity.valid) return true;
      }
      return false;
    });

    // バリデーションがあるか、エラーメッセージが表示される
    const hasError = await page
      .locator('[class*="error"], [role="alert"], .text-red')
      .isVisible()
      .catch(() => false);

    expect(hasValidation || hasError).toBe(true);
  });

  test('無効な認証情報でエラー表示', async ({ page }) => {
    await page.goto('/login');

    // 存在しないユーザーでログイン試行
    await page.fill('input[type="text"], input[name="username"]', 'nonexistent_user_12345');
    await page.fill('input[type="password"]', 'wrong_password_12345');
    await page.click('button[type="submit"]');

    // エラーメッセージを待つ（Tailwind CSSのクラス名に対応）
    const errorLocator = page.locator('[class*="text-red"], [class*="bg-red"], [role="alert"]');
    await expect(errorLocator.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('セキュリティ', () => {
  test('保護されたルートはリダイレクトされる', async ({ page }) => {
    // 直接ダッシュボードにアクセス
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ログインページにリダイレクトされるか確認
    const url = page.url();
    const hasLoginForm = await page
      .locator('input[type="password"]')
      .isVisible()
      .catch(() => false);

    expect(url.includes('login') || hasLoginForm).toBe(true);
  });

  test('/settings は認証必須', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // 認証ページにいることを確認
    const hasLoginForm = await page
      .locator('input[type="password"]')
      .isVisible()
      .catch(() => false);
    const url = page.url();

    expect(url.includes('login') || hasLoginForm).toBe(true);
  });

  test('/admin は認証必須', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // 認証ページにいるか、アクセス拒否されることを確認
    const hasLoginForm = await page
      .locator('input[type="password"]')
      .isVisible()
      .catch(() => false);
    const url = page.url();

    expect(url.includes('login') || hasLoginForm).toBe(true);
  });
});

test.describe('レスポンシブデザイン', () => {
  test('モバイル幅でログインページが正しく表示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/login');

    // フォーム要素が見える
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // 水平スクロールがないことを確認
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('タブレット幅でログインページが正しく表示', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/login');

    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

test.describe('アクセシビリティ', () => {
  test('フォーム要素にラベルがある', async ({ page }) => {
    await page.goto('/login');

    // aria-label または label が紐付いている
    const inputs = await page.locator('input').all();

    for (const input of inputs) {
      const hasLabel = await input.evaluate((el) => {
        const id = el.id;
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const placeholder = el.getAttribute('placeholder');
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;

        return !!(ariaLabel || ariaLabelledBy || label || placeholder);
      });

      expect(hasLabel).toBe(true);
    }
  });

  test('Tabキーでフォーカス移動ができる', async ({ page }) => {
    await page.goto('/login');

    // 最初のTabでフォーカス可能な要素に移動
    await page.keyboard.press('Tab');

    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedTag);
  });
});
