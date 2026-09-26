import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

/**
 * 給与計算クリティカルパス E2E
 *
 * 登録 → ログイン → 単価設定 → 勤務入力 → ダッシュボードの金額検証
 * → ステータス確定 → 確定額への反映 → PDF 出力
 *
 * shared / server / client を貫通して「金額が正しいこと」を数値で検証する。
 * データ準備は page.request（ブラウザコンテキストと Cookie を共有）の API 呼び出しで行い、
 * UI 操作起因の flake を避ける。
 *
 * class 勤務にはスケジュールスロット（管理者のみ作成可）が必要なため、
 * beforeAll で reset_admin.cjs により管理者を作成し、パターン + スロットを API で用意する。
 */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 現在表示中の給与月（= 今月支給分）に必ず含まれる日付を返す。
 * 授業給の対象期間は「前月16日〜当月15日」のため、今日が16日以降なら当月10日を使う。
 */
function dateInCurrentClassPeriod(now: Date): string {
  const day = now.getDate() <= 15 ? now.getDate() : 10;
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}`;
}

/** 規定外給の対象期間（前月 1 日〜末日）に含まれる日付を返す。 */
function dateInCurrentHourlyPeriod(now: Date): string {
  const m = now.getMonth() + 1;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? now.getFullYear() - 1 : now.getFullYear();
  return `${prevYear}-${pad(prevMonth)}-10`;
}

test.describe('給与計算クリティカルパス', () => {
  const stamp = Date.now();
  const adminUser = { username: `e2e_admin_${stamp}`, password: 'password123' };
  const testUser = { username: `e2e_salary_${stamp}`, password: 'password123' };

  test.beforeAll(() => {
    // 管理者ユーザーを直接 DB に作成（webServer 起動済みなので DB はマイグレーション済み）
    execSync(`node ../server/tools/reset_admin.cjs ${adminUser.username} ${adminUser.password}`, {
      stdio: 'pipe',
    });
  });

  test('単価設定 → 勤務入力 → 金額表示 → 確定 → PDF 出力', async ({ page, request }) => {
    // --- 管理者: スケジュールパターンとスロットを作成（request は page と別 Cookie）---
    const adminLogin = await request.post('/api/auth/login', { data: adminUser });
    expect(adminLogin.ok()).toBeTruthy();

    const patternRes = await request.post('/api/patterns', {
      data: { name: `E2E_${stamp}` },
    });
    expect(patternRes.ok()).toBeTruthy();
    const patternId = (await patternRes.json()).id as number;

    const slotRes = await request.post('/api/slots', {
      data: { pattern_id: patternId, period_name: '1限', start_time: '17:00', end_time: '18:20' },
    });
    expect(slotRes.ok()).toBeTruthy();
    const slotId = (await slotRes.json()).id as number;

    // --- 一般ユーザー: 登録 & ログイン（Cookie はブラウザコンテキストに保存される）---
    const registerRes = await page.request.post('/api/auth/register', { data: testUser });
    expect(registerRes.ok()).toBeTruthy();
    const loginRes = await page.request.post('/api/auth/login', { data: testUser });
    expect(loginRes.ok()).toBeTruthy();

    // --- 単価設定 ---
    const rateRes = await page.request.post('/api/rates', {
      data: {
        start_date: '2020-01-01',
        wage_1_student: 1500,
        wage_2_students: 2500,
        wage_3_students: 3500,
        wage_4_students: 4500,
        hourly_wage: 1200,
        allowance_day: 500,
        allowance_gap: 100,
      },
    });
    expect(rateRes.ok()).toBeTruthy();

    // --- 勤務入力: 同日に授業 2 コマ + 前月に規定外 90 分 ---
    const now = new Date();
    const classDate = dateInCurrentClassPeriod(now);
    const hourlyDate = dateInCurrentHourlyPeriod(now);

    const class1 = await page.request.post('/api/work_logs', {
      data: { date: classDate, work_type: 'class', schedule_slot_id: slotId, student_count: 1 },
    });
    expect(class1.ok()).toBeTruthy();
    const class1Id = (await class1.json()).id as number;

    const class2 = await page.request.post('/api/work_logs', {
      data: { date: classDate, work_type: 'class', schedule_slot_id: slotId, student_count: 2 },
    });
    expect(class2.ok()).toBeTruthy();

    const hourly = await page.request.post('/api/work_logs', {
      data: { date: hourlyDate, work_type: 'hourly', duration_minutes: 90 },
    });
    expect(hourly.ok()).toBeTruthy();

    // --- ダッシュボードで見込み額を検証 ---
    // 授業給: 1500 + 2500 = 4000
    // 手当: 500 + (2-1)*100 = 600
    // 規定外: ceil(90/60 * 1200) = 1800
    // 見込み合計: 6400 / 確定: 0
    await page.goto('/');
    await expect(page.getByText('¥6,400')).toBeVisible({ timeout: 15_000 });

    // --- 1 コマを確定 → 確定額に反映されることを検証 ---
    // 確定: 授業給 1500 + 手当 500（確定手当は「完了したコマ数」で算出。同日 2 コマ中
    // 1 コマのみ完了のため allowance_day 500 のみで、planned の 2 コマ目分の gap 100 は
    // 含めない）= 2000
    const statusRes = await page.request.patch(`/api/work_logs/${class1Id}/status`, {
      data: { status: 'completed' },
    });
    expect(statusRes.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByText('¥2,000')).toBeVisible({ timeout: 15_000 });
    // 見込みは変わらない
    await expect(page.getByText('¥6,400')).toBeVisible();

    // --- PDF 出力（今月支給分）---
    const pdfRes = await page.request.get(
      `/api/pdf/salary/${now.getFullYear()}/${now.getMonth() + 1}`,
    );
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');
    expect((await pdfRes.body()).length).toBeGreaterThan(1000);
  });
});
