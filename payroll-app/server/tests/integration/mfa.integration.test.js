/**
 * 最初の設定（ユーザー ID・二段階）のゲートと、認証アプリ（TOTP）でのログインの結合テスト
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import usersRouter from '../../src/routes/users';
import ratesRouter from '../../src/routes/rates';
import { errorHandler } from '../../src/utils/errors';
import { hashPassword } from '../../src/utils/password';
import { totpCode, currentStep } from '../../src/utils/totp';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/rates', ratesRouter);
app.use(errorHandler);

const oldId = `古い名前_${Date.now()}`; // ルールより前に作られた（日本語の）ユーザー ID
const password = 'correct horse battery staple';
let userId;

const cookieHeader = (res, prev = '') => {
  const jar = new Map(
    prev
      .split('; ')
      .filter(Boolean)
      .map((c) => c.split('=')),
  );
  for (const c of res.headers['set-cookie'] ?? []) {
    const [kv] = c.split(';');
    const [k, ...v] = kv.split('=');
    jar.set(k, v.join('='));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
};

describe('Account setup gate & TOTP login', () => {
  beforeAll(async () => {
    process.env.ACCOUNT_SETUP_REQUIRED = 'on';
    userId = Number(
      db
        .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
        .run(oldId, await hashPassword(password), 'user').lastInsertRowid,
    );
  });

  afterAll(() => {
    delete process.env.ACCOUNT_SETUP_REQUIRED;
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  it('lets an unprepared user log in but blocks the app until setup is done', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: oldId, password });
    expect(login.status).toBe(200);
    // メール送信が無効な環境なので email は求めない
    expect(login.body.user.setup).toMatchObject({ email: false, mfa: true, loginId: true });
    // ルールより前からいる利用者（直接 DB に作った）には削除の期限が付かない
    expect(login.body.user.setup.deadline).toBeNull();
    let cookies = cookieHeader(login);

    const blocked = await request(app).get('/api/rates').set('Cookie', cookies);
    expect(blocked.status).toBe(403);
    expect(blocked.body.setup).toMatchObject({ mfa: true, loginId: true });

    // ユーザー ID は決め直せる（ゲート中でも）。ルールに合わない ID は断る
    const bad = await request(app)
      .put(`/api/users/${userId}/login-id`)
      .set('Cookie', cookies)
      .send({ username: 'Bad@ID' });
    expect(bad.status).toBe(400);
    const renamed = await request(app)
      .put(`/api/users/${userId}/login-id`)
      .set('Cookie', cookies)
      .send({ username: `staff.${userId}` });
    expect(renamed.status).toBe(200);

    // 認証アプリを登録する
    const setup = await request(app).post('/api/auth/totp/setup').set('Cookie', cookies);
    expect(setup.status).toBe(200);
    const confirm = await request(app)
      .post('/api/auth/totp/confirm')
      .set('Cookie', cookies)
      .send({ code: totpCode(setup.body.secret, currentStep()) });
    expect(confirm.status).toBe(200);
    expect(confirm.body.recoveryCodes).toHaveLength(10);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookies);
    expect(me.body.setup).toMatchObject({ email: false, mfa: false, loginId: false });
    expect((await request(app).get('/api/rates').set('Cookie', cookies)).status).toBe(200);

    // 最後の手段は外せない
    const disable = await request(app).delete('/api/auth/totp').set('Cookie', cookies);
    expect(disable.status).toBe(400);

    // 次からはパスワード + コードでログインする（回復コードでも入れる・1回だけ）
    const step1 = await request(app)
      .post('/api/auth/login')
      .send({ username: `staff.${userId}`, password });
    expect(step1.body).toMatchObject({ mfaRequired: 'totp', methods: ['totp'] });
    cookies = cookieHeader(step1);
    expect(cookies).not.toContain('token=');

    const wrong = await request(app)
      .post('/api/auth/login/totp')
      .set('Cookie', cookies)
      .send({ code: '000000' });
    expect(wrong.status).toBe(401);

    const recovery = confirm.body.recoveryCodes[0];
    const ok = await request(app)
      .post('/api/auth/login/totp')
      .set('Cookie', cookies)
      .send({ code: recovery });
    expect(ok.status).toBe(200);
    expect(ok.body.user.username).toBe(`staff.${userId}`);

    const step1again = await request(app)
      .post('/api/auth/login')
      .send({ username: `staff.${userId}`, password });
    const reused = await request(app)
      .post('/api/auth/login/totp')
      .set('Cookie', cookieHeader(step1again))
      .send({ code: recovery });
    expect(reused.status).toBe(401);
  });

  it('gives a new signup a 7-day deadline to finish setup', async () => {
    const id = `newbie.${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '203.0.113.77')
      .send({ username: id, password: 'violet-Harbor-58-quill', display_name: '新人' });
    expect(res.status).toBe(200);
    const deadline = new Date(res.body.user.setup.deadline).getTime();
    const days = (deadline - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    db.prepare('DELETE FROM users WHERE username = ?').run(id);
  });

  it('does not ask for the code again on a remembered device', async () => {
    const id = `remember.${Date.now()}`;
    const uid = Number(
      db
        .prepare('INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)')
        .run(id, await hashPassword(password), 'user', `${id}@example.invalid`).lastInsertRowid,
    );
    // 認証アプリを登録する
    let cookies = cookieHeader(
      await request(app).post('/api/auth/login').send({ username: id, password }),
    );
    const setup = await request(app).post('/api/auth/totp/setup').set('Cookie', cookies);
    const step = currentStep();
    await request(app)
      .post('/api/auth/totp/confirm')
      .set('Cookie', cookies)
      .send({ code: totpCode(setup.body.secret, step) });

    // コード + 「この端末を記憶」でログイン（device_id の Cookie は持ち越す）
    const first = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .send({ username: id, password });
    expect(first.body).toMatchObject({ mfaRequired: 'totp', methods: ['totp'] });
    cookies = cookieHeader(first, cookies);
    const ok = await request(app)
      .post('/api/auth/login/totp')
      .set('Cookie', cookies)
      .send({ code: totpCode(setup.body.secret, step + 1), remember: true });
    expect(ok.status).toBe(200);
    cookies = cookieHeader(ok, cookies);

    // 同じ端末なら、パスワードだけで入れる
    const again = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .send({ username: id, password });
    expect(again.status).toBe(200);
    expect(again.body.user.username).toBe(id);

    // 別の端末（device_id なし）ではコードを求める
    const other = await request(app).post('/api/auth/login').send({ username: id, password });
    expect(other.body).toMatchObject({ mfaRequired: 'totp', methods: ['totp'] });

    // 解除すると、同じ端末でもまたコードを求める
    await request(app)
      .delete('/api/auth/trusted-devices')
      .set('Cookie', cookieHeader(again, cookies));
    const afterClear = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .send({ username: id, password });
    expect(afterClear.body).toMatchObject({ mfaRequired: 'totp', methods: ['totp'] });

    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });

  it('requires the pending cookie for the second step', async () => {
    const res = await request(app).post('/api/auth/login/totp').send({ code: '123456' });
    expect(res.status).toBe(401);
  });
});
