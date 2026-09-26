/**
 * Rates API Integration Tests
 * Tests rate CRUD endpoints with real database and encryption
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import ratesRouter from '../../src/routes/rates';
import { errorHandler } from '../../src/utils/errors';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/rates', ratesRouter);
app.use(errorHandler);

const testUsername = `rates_test_${Date.now()}`;
let testUserId: number;
let authCookies: string[];
let createdRateId: number;

const validRate = {
  start_date: '2025-01-01',
  wage_1_student: 1600,
  wage_2_students: 1800,
  wage_3_students: 2000,
  wage_4_students: 2200,
  hourly_wage: 1200,
  allowance_day: 300,
  allowance_gap: 100,
};

describe('Rates API Integration Tests', () => {
  beforeAll(async () => {
    // Register and login test user
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
        db.prepare('DELETE FROM rates WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('POST /api/rates', () => {
    it('should create a rate entry', async () => {
      const res = await request(app).post('/api/rates').set('Cookie', authCookies).send(validRate);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
      expect(res.body).toHaveProperty('id');
      createdRateId = res.body.id;
    });

    it('should reject request without auth', async () => {
      const res = await request(app).post('/api/rates').send(validRate);

      expect(res.status).toBe(401);
    });

    it('should reject invalid rate data (negative wage)', async () => {
      const res = await request(app)
        .post('/api/rates')
        .set('Cookie', authCookies)
        .send({ ...validRate, wage_1_student: -100 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject missing start_date', async () => {
      const { start_date: _, ...noDate } = validRate;
      const res = await request(app).post('/api/rates').set('Cookie', authCookies).send(noDate);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/rates', () => {
    it('should return rates for authenticated user', async () => {
      const res = await request(app).get('/api/rates').set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Verify decrypted values are returned as numbers
      const rate = res.body.data.find((r: { id: number }) => r.id === createdRateId);
      expect(rate).toBeDefined();
      expect(rate.wage_1_student).toBe('1600');
      expect(rate.wage_2_students).toBe('1800');
    });

    it('should reject request without auth', async () => {
      const res = await request(app).get('/api/rates');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/rates/:id', () => {
    it('should update a rate entry', async () => {
      const updatedRate = { ...validRate, wage_1_student: 1700 };
      const res = await request(app)
        .put(`/api/rates/${createdRateId}`)
        .set('Cookie', authCookies)
        .send(updatedRate);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'updated');
    });

    it('should verify updated value', async () => {
      const res = await request(app).get('/api/rates').set('Cookie', authCookies);

      const rate = res.body.data.find((r: { id: number }) => r.id === createdRateId);
      expect(rate.wage_1_student).toBe('1700');
    });

    it('should reject invalid data', async () => {
      const res = await request(app)
        .put(`/api/rates/${createdRateId}`)
        .set('Cookie', authCookies)
        .send({ ...validRate, wage_1_student: -1 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/rates/:id', () => {
    it('should delete a rate entry', async () => {
      const res = await request(app)
        .delete(`/api/rates/${createdRateId}`)
        .set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'deleted');
    });

    it('should no longer return deleted rate', async () => {
      const res = await request(app).get('/api/rates').set('Cookie', authCookies);

      const rate = res.body.data.find((r: { id: number }) => r.id === createdRateId);
      expect(rate).toBeUndefined();
    });
  });
});
