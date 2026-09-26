/**
 * Salary Adjustments API Integration Tests
 * Tests salary adjustment CRUD with real database
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import salaryAdjustmentsRouter from '../../src/routes/salary_adjustments';
import { errorHandler } from '../../src/utils/errors';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/salary-adjustments', salaryAdjustmentsRouter);
app.use(errorHandler);

const testUsername = `sa_test_${Date.now()}`;
let testUserId: number;
let authCookies: string[];
let createdId: number;

const validAdjustment = {
  year_month: '2025-01',
  adjustment_type: 'incentive',
  amount: 5000,
  note: 'テストインセンティブ',
};

describe('Salary Adjustments API Integration Tests', () => {
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
        db.prepare('DELETE FROM salary_adjustments WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('POST /api/salary-adjustments', () => {
    it('should create a salary adjustment', async () => {
      const res = await request(app)
        .post('/api/salary-adjustments')
        .set('Cookie', authCookies)
        .send(validAdjustment);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
      expect(res.body).toHaveProperty('id');
      createdId = res.body.id;
    });

    it('should reject request without auth', async () => {
      const res = await request(app).post('/api/salary-adjustments').send(validAdjustment);

      expect(res.status).toBe(401);
    });

    it('should reject invalid year_month format', async () => {
      const res = await request(app)
        .post('/api/salary-adjustments')
        .set('Cookie', authCookies)
        .send({ ...validAdjustment, year_month: '2025' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid adjustment_type', async () => {
      const res = await request(app)
        .post('/api/salary-adjustments')
        .set('Cookie', authCookies)
        .send({ ...validAdjustment, adjustment_type: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/salary-adjustments', () => {
    it('should return adjustments for authenticated user', async () => {
      const res = await request(app).get('/api/salary-adjustments').set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by year query parameter', async () => {
      const res = await request(app)
        .get('/api/salary-adjustments?year=2025')
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for a year with no data', async () => {
      const res = await request(app)
        .get('/api/salary-adjustments?year=2000')
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('should reject request without auth', async () => {
      const res = await request(app).get('/api/salary-adjustments');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/salary-adjustments/:id', () => {
    it('should update a salary adjustment', async () => {
      const updated = { ...validAdjustment, amount: 7000, note: '更新テスト' };
      const res = await request(app)
        .put(`/api/salary-adjustments/${createdId}`)
        .set('Cookie', authCookies)
        .send(updated);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'updated');
    });

    it('should reject invalid data on update', async () => {
      const res = await request(app)
        .put(`/api/salary-adjustments/${createdId}`)
        .set('Cookie', authCookies)
        .send({ ...validAdjustment, adjustment_type: 'bad' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/salary-adjustments/:id', () => {
    it('should delete a salary adjustment', async () => {
      const res = await request(app)
        .delete(`/api/salary-adjustments/${createdId}`)
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'deleted');
    });

    it('should return empty list after delete', async () => {
      const res = await request(app)
        .get('/api/salary-adjustments?year=2025')
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);
      const found = res.body.data.find((a: { id: number }) => a.id === createdId);
      expect(found).toBeUndefined();
    });
  });
});
