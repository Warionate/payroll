/**
 * Work Logs API Integration Tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import workLogsRouter from '../../src/routes/work_logs';
import authRouter from '../../src/routes/auth';
import { errorHandler } from '../../src/utils/errors';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/work_logs', workLogsRouter);
app.use('/api/auth', authRouter);
app.use(errorHandler);

const username = `workloguser_${Date.now()}`;
let userId;
let authCookies;

describe('Work Logs API Integration Tests', () => {
  let schedulePatternId;
  let scheduleSlotId;

  beforeAll(async () => {
    // Register and Login
    let res = await request(app)
      .post('/api/auth/register')
      .send({ username: username, password: 'password123' });
    userId = res.body.user.id;

    res = await request(app)
      .post('/api/auth/login')
      .send({ username: username, password: 'password123' });
    authCookies = res.headers['set-cookie'];

    // Create a dummy schedule pattern
    const patternRes = db
      .prepare('INSERT INTO schedule_patterns (name, is_default) VALUES (?, ?)')
      .run('Test Pattern', 0);
    schedulePatternId = patternRes.lastInsertRowid;

    // Create a dummy schedule slot
    const slotRes = db
      .prepare(
        'INSERT INTO schedule_slots (pattern_id, period_name, start_time, end_time) VALUES (?, ?, ?, ?)',
      )
      .run(schedulePatternId, '1st Period', '09:00', '10:30');
    scheduleSlotId = slotRes.lastInsertRowid;
  });

  afterAll(() => {
    if (userId) {
      try {
        db.prepare('DELETE FROM work_logs WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM rates WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        if (scheduleSlotId) {
          db.prepare('DELETE FROM schedule_slots WHERE id = ?').run(scheduleSlotId);
        }
        if (schedulePatternId) {
          db.prepare('DELETE FROM schedule_patterns WHERE id = ?').run(schedulePatternId);
        }
      } catch (e) {
        console.error('Cleanup error', e);
      }
    }
  });

  let createdLogId;

  describe('POST /api/work_logs', () => {
    it('should create a new work log', async () => {
      const logData = {
        date: '2025-01-01',
        work_type: 'class',
        schedule_slot_id: scheduleSlotId,
        student_count: 2,
        duration_minutes: 90,
        note: 'Test note',
        status: 'confirmed',
      };

      const res = await request(app)
        .post('/api/work_logs')
        .set('Cookie', authCookies)
        .send(logData);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      createdLogId = res.body.id;
    });

    it('should validate input (missing date)', async () => {
      const res = await request(app).post('/api/work_logs').set('Cookie', authCookies).send({
        work_type: 'class',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/work_logs', () => {
    it('should retrieve work logs for the user', async () => {
      const res = await request(app)
        .get('/api/work_logs')
        .query({ start_date: '2025-01-01', end_date: '2025-01-31' })
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      const log = res.body.data.find((l) => l.id === createdLogId);
      expect(log).toBeDefined();
      // Work logs are encrypted in DB but decrypted in response.
      // Note: student_count is stored as encrypted string but returned as string because of decryption?
      // Actually `crypto.js` `decrypt` returns string usually, let's check expectations.
      // The API returns what decrypt returns.
      // If the original input was number 2, decrypt might return "2".
      expect(String(log.student_count)).toBe('2');
      expect(log.note).toBe('Test note');
    });

    it('should reject a query with no date range (prevents unbounded full-table scan)', async () => {
      const res = await request(app).get('/api/work_logs').set('Cookie', authCookies);
      expect(res.status).toBe(400);
    });

    it('should reject a date range wider than 366 days', async () => {
      const res = await request(app)
        .get('/api/work_logs')
        .query({ start_date: '2024-01-01', end_date: '2025-12-31' })
        .set('Cookie', authCookies);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/work_logs/:id', () => {
    it('should update an existing work log', async () => {
      const updateData = {
        date: '2025-01-01',
        work_type: 'class',
        schedule_slot_id: scheduleSlotId,
        student_count: 3, // changed
        duration_minutes: 90,
        note: 'Updated note',
        status: 'confirmed',
      };

      const res = await request(app)
        .put(`/api/work_logs/${createdLogId}`)
        .set('Cookie', authCookies)
        .send(updateData);

      expect(res.status).toBe(200);

      // Verify update
      const checkRes = await request(app)
        .get('/api/work_logs')
        .query({ start_date: '2025-01-01', end_date: '2025-01-01' })
        .set('Cookie', authCookies);

      const log = checkRes.body.data.find((l) => l.id === createdLogId);
      expect(String(log.student_count)).toBe('3');
      expect(log.note).toBe('Updated note');
    });
  });

  describe('DELETE /api/work_logs/:id', () => {
    it('should delete the work log', async () => {
      const res = await request(app)
        .delete(`/api/work_logs/${createdLogId}`)
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);

      // Verify gone
      const checkRes = await request(app)
        .get('/api/work_logs')
        .query({ start_date: '2025-01-01', end_date: '2025-01-01' })
        .set('Cookie', authCookies);

      const log = checkRes.body.data.find((l) => l.id === createdLogId);
      expect(log).toBeUndefined();
    });
  });

  describe('POST /api/work_logs/complete_all', () => {
    it('should complete all unconfirmed logs in range, leaving others untouched', async () => {
      // 範囲内: planned x2、範囲外: planned x1、範囲内: completed x1
      const make = (date, status) =>
        request(app).post('/api/work_logs').set('Cookie', authCookies).send({
          date,
          work_type: 'class',
          schedule_slot_id: scheduleSlotId,
          student_count: 1,
          status,
        });

      await make('2025-02-01', 'planned');
      await make('2025-02-10', 'confirmed');
      await make('2025-03-01', 'planned'); // 範囲外
      await make('2025-02-05', 'completed'); // 既に完了

      const res = await request(app)
        .post('/api/work_logs/complete_all')
        .set('Cookie', authCookies)
        .send({ start_date: '2025-02-01', end_date: '2025-02-28' });

      expect(res.status).toBe(200);
      expect(res.body.changes).toBe(2); // planned + confirmed の 2 件のみ

      const checkRes = await request(app)
        .get('/api/work_logs')
        .query({ start_date: '2025-02-01', end_date: '2025-03-31' })
        .set('Cookie', authCookies);
      const logs = checkRes.body.data;
      expect(
        logs.filter((l) => l.date <= '2025-02-28').every((l) => l.status === 'completed'),
      ).toBe(true);
      expect(logs.find((l) => l.date === '2025-03-01').status).toBe('planned');
    });

    it('should not touch logs of other users', async () => {
      // 別ユーザーを作成し planned ログを入れる
      const otherName = `worklogother_${Date.now()}`;
      let res = await request(app)
        .post('/api/auth/register')
        .send({ username: otherName, password: 'password123' });
      const otherId = res.body.user.id;
      res = await request(app)
        .post('/api/auth/login')
        .send({ username: otherName, password: 'password123' });
      const otherCookies = res.headers['set-cookie'];

      await request(app).post('/api/work_logs').set('Cookie', otherCookies).send({
        date: '2025-02-15',
        work_type: 'class',
        schedule_slot_id: scheduleSlotId,
        student_count: 1,
        status: 'planned',
      });

      await request(app)
        .post('/api/work_logs/complete_all')
        .set('Cookie', authCookies)
        .send({ start_date: '2025-02-01', end_date: '2025-02-28' });

      const checkRes = await request(app)
        .get('/api/work_logs')
        .query({ start_date: '2025-02-15', end_date: '2025-02-15' })
        .set('Cookie', otherCookies);
      expect(checkRes.body.data[0].status).toBe('planned');

      db.prepare('DELETE FROM work_logs WHERE user_id = ?').run(otherId);
      db.prepare('DELETE FROM rates WHERE user_id = ?').run(otherId);
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(otherId);
      db.prepare('DELETE FROM users WHERE id = ?').run(otherId);
    });

    it('should reject an inverted date range', async () => {
      const res = await request(app)
        .post('/api/work_logs/complete_all')
        .set('Cookie', authCookies)
        .send({ start_date: '2025-02-28', end_date: '2025-02-01' });
      expect(res.status).toBe(400);
    });
  });
});
