/**
 * Calendar API Integration Tests
 * Tests iCal feed endpoint with token-based auth
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import calendarRouter from '../../src/routes/calendar';
import { errorHandler } from '../../src/utils/errors';
import { userRepository } from '../../src/repositories/userRepository';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/calendar', calendarRouter);
app.use(errorHandler);

const testUsername = `cal_test_${Date.now()}`;
let testUserId: number;
let authCookies: string[];

describe('Calendar API Integration Tests', () => {
  beforeAll(async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: testUsername, password: 'password123' });
    testUserId = regRes.body.user.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: 'password123' });
    authCookies = loginRes.headers['set-cookie'] as unknown as string[];
  });

  afterAll(() => {
    if (testUserId) {
      try {
        db.prepare('DELETE FROM work_logs WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('GET /api/calendar/:token/feed.ics', () => {
    it('should return 404 for invalid token', async () => {
      const res = await request(app).get('/api/calendar/invalid_token_123/feed.ics');

      expect(res.status).toBe(404);
    });

    it('should return iCal feed for valid calendar token', async () => {
      // トークンは暗号化 + ハッシュで保存されるので、アプリと同じ関数で読み書きする
      let token = userRepository.getCalendarToken(testUserId);
      if (!token) {
        const crypto = await import('node:crypto');
        token = crypto.randomBytes(32).toString('hex');
        userRepository.updateCalendarToken(testUserId, token);
      }

      const res = await request(app).get(`/api/calendar/${token}/feed.ics`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/calendar');
      expect(res.text).toContain('BEGIN:VCALENDAR');
    });

    it('should return 200 for token with old creation date (expiration removed in v8.0.1)', async () => {
      // Token expiration was removed in v8.0.1 — old tokens should still work
      const crypto = await import('node:crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(); // 400 days ago

      userRepository.updateCalendarToken(testUserId, token);
      db.prepare('UPDATE users SET calendar_token_created_at = ? WHERE id = ?').run(
        oldDate,
        testUserId,
      );

      const res = await request(app).get(`/api/calendar/${token}/feed.ics`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/calendar');
    });
  });
});
