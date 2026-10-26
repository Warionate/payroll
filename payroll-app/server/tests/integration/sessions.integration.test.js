/**
 * ログイン中の端末（sessions）と、大事な操作の前の本人確認の結合テスト
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import { errorHandler } from '../../src/utils/errors';
import { hashPassword } from '../../src/utils/password';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use(errorHandler);

const username = `sess_${Date.now()}`;
const password = 'correct horse battery staple';
let userId;

/** Set-Cookie から Cookie ヘッダーを作る（属性は捨てる） */
const cookieHeader = (res) => res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

const login = (extraCookie = '') =>
  request(app)
    .post('/api/auth/login')
    .set('Cookie', extraCookie)
    .set('User-Agent', 'test-agent')
    .send({ username, password });

describe('Sessions & re-authentication', () => {
  beforeAll(async () => {
    const hash = await hashPassword(password);
    userId = Number(
      db
        .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
        .run(username, hash, 'user').lastInsertRowid,
    );
  });

  afterAll(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  it('lists the current login and records it', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const cookies = cookieHeader(res);
    expect(cookies).toContain('device_id=');

    const list = await request(app).get('/api/auth/sessions').set('Cookie', cookies);
    expect(list.status).toBe(200);
    const current = list.body.sessions.find((s) => s.current);
    expect(current).toMatchObject({ method: 'password', user_agent: 'test-agent' });

    const events = await request(app).get('/api/auth/security-events').set('Cookie', cookies);
    expect(events.body.events.some((e) => e.type === 'login' && e.detail === 'password')).toBe(
      true,
    );
  });

  it('rejects the access token of a login that was revoked from another device', async () => {
    const a = cookieHeader(await login());
    const b = cookieHeader(await login());

    const revoke = await request(app).post('/api/auth/sessions/revoke-others').set('Cookie', b);
    expect(revoke.status).toBe(200);

    expect((await request(app).get('/api/auth/me').set('Cookie', a)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', a)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', b)).status).toBe(200);
  });

  it('asks for the password again before a sensitive change on an old login', async () => {
    const cookies = cookieHeader(await login());
    // ログインから 10 分以上たった状態にする
    db.prepare('UPDATE sessions SET authenticated_at = ? WHERE user_id = ?').run(
      new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      userId,
    );

    const blocked = await request(app).delete('/api/auth/oidc/link').set('Cookie', cookies);
    expect(blocked.status).toBe(403);
    expect(blocked.body.reauth).toBe(true);

    const wrong = await request(app)
      .post('/api/auth/reauth')
      .set('Cookie', cookies)
      .send({ password: 'nope' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/auth/reauth')
      .set('Cookie', cookies)
      .send({ password });
    expect(ok.status).toBe(200);

    const retry = await request(app).delete('/api/auth/oidc/link').set('Cookie', cookies);
    expect(retry.status).toBe(200);
  });

  it('does not extend the 30-day limit when refreshing', async () => {
    const res = await login();
    const cookies = cookieHeader(res);
    const fixed = new Date(Date.now() + 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
      fixed,
      userId,
    );

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshed.status).toBe(200);
    const rows = db
      .prepare('SELECT DISTINCT expires_at FROM refresh_tokens WHERE user_id = ? AND revoked = 0')
      .all(userId);
    expect(rows.map((r) => r.expires_at)).toContain(fixed);
  });
});
