/**
 * カレンダー連携のトークンの保存（暗号化 + ハッシュ）と、管理者の操作の前の本人確認の結合テスト
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import usersRouter from '../../src/routes/users';
import calendarRouter from '../../src/routes/calendar';
import { errorHandler } from '../../src/utils/errors';
import { hashPassword } from '../../src/utils/password';
import { userRepository } from '../../src/repositories/userRepository';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/calendar', calendarRouter);
app.use(errorHandler);

const stamp = Date.now();
const password = 'correct horse battery staple';
const ids = [];

const cookieHeader = (res) =>
  (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');

async function makeUser(username, role) {
  const id = Number(
    db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, await hashPassword(password), role).lastInsertRowid,
  );
  ids.push(id);
  return id;
}

describe('Hardening', () => {
  let adminId;
  let staffId;

  beforeAll(async () => {
    adminId = await makeUser(`boss.${stamp}`, 'admin');
    staffId = await makeUser(`staff.${stamp}`, 'user');
  });

  afterAll(() => {
    for (const id of ids) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  it('moves a legacy plaintext calendar token to encrypted + hashed, and the feed keeps working', async () => {
    const legacy = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE users SET calendar_token = ?, calendar_token_hash = NULL WHERE id = ?').run(
      legacy,
      staffId,
    );

    expect(userRepository.migrateLegacyCalendarTokens()).toBeGreaterThanOrEqual(1);
    const row = db
      .prepare('SELECT calendar_token, calendar_token_hash FROM users WHERE id = ?')
      .get(staffId);
    expect(row.calendar_token).not.toBe(legacy); // 平文では残らない
    expect(row.calendar_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(userRepository.getCalendarToken(staffId)).toBe(legacy); // 画面には同じ URL を出せる

    const feed = await request(app).get(`/api/calendar/${legacy}/feed.ics`);
    expect(feed.status).toBe(200);
    expect(feed.text).toContain('BEGIN:VCALENDAR');
    expect((await request(app).get(`/api/calendar/${'0'.repeat(64)}/feed.ics`)).status).not.toBe(
      200,
    );
  });

  it('asks an admin to re-authenticate before changing someone else’s role', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: `boss.${stamp}`, password });
    const cookies = cookieHeader(login);
    db.prepare('UPDATE sessions SET authenticated_at = ? WHERE user_id = ?').run(
      new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      adminId,
    );

    const blocked = await request(app)
      .put(`/api/users/${staffId}/role`)
      .set('Cookie', cookies)
      .send({ role: 'admin' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.reauth).toBe(true);

    await request(app).post('/api/auth/reauth').set('Cookie', cookies).send({ password });
    const ok = await request(app)
      .put(`/api/users/${staffId}/role`)
      .set('Cookie', cookies)
      .send({ role: 'admin' });
    expect(ok.status).toBe(200);
  });
});
