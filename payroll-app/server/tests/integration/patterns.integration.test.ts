/**
 * Patterns API Integration Tests
 * Tests schedule patterns, slots, and pattern assignments with real database
 * Note: Pattern/slot creation requires admin role
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import patternsRouter from '../../src/routes/patterns';
import { errorHandler } from '../../src/utils/errors';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api', patternsRouter); // Patterns are mounted at /api
app.use(errorHandler);

const testUsername = `pat_test_${Date.now()}`;
const adminUsername = `pat_admin_${Date.now()}`;
let testUserId: number;
let adminUserId: number;
let userCookies: string[];
let adminCookies: string[];
let createdPatternId: number;
let createdSlotId: number;
let createdAssignmentId: number;

describe('Patterns API Integration Tests', () => {
  beforeAll(async () => {
    // Register normal user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: testUsername, password: 'password123' });
    testUserId = regRes.body.user.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: 'password123' });
    userCookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Register admin user
    const adminRegRes = await request(app)
      .post('/api/auth/register')
      .send({ username: adminUsername, password: 'password123' });
    adminUserId = adminRegRes.body.user.id;

    // Promote to admin
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(adminUserId);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: 'password123' });
    adminCookies = adminLoginRes.headers['set-cookie'] as unknown as string[];
  });

  afterAll(() => {
    try {
      // Clean up created test data
      if (createdAssignmentId) {
        db.prepare('DELETE FROM pattern_assignments WHERE id = ?').run(createdAssignmentId);
      }
      if (createdSlotId) {
        db.prepare('DELETE FROM schedule_slots WHERE id = ?').run(createdSlotId);
      }
      if (createdPatternId) {
        db.prepare('DELETE FROM schedule_patterns WHERE id = ?').run(createdPatternId);
      }
      for (const uid of [testUserId, adminUserId]) {
        if (uid) {
          db.prepare('DELETE FROM pattern_assignments WHERE user_id = ?').run(uid);
          db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(uid);
          db.prepare('DELETE FROM users WHERE id = ?').run(uid);
        }
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  // --- Patterns ---
  describe('GET /api/patterns', () => {
    it('should return patterns for authenticated user', async () => {
      const res = await request(app).get('/api/patterns').set('Cookie', userCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/patterns');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/patterns', () => {
    it('should create pattern as admin', async () => {
      const res = await request(app)
        .post('/api/patterns')
        .set('Cookie', adminCookies)
        .send({ name: `テストパターン_${Date.now()}` });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
      expect(res.body).toHaveProperty('id');
      createdPatternId = res.body.id;
    });

    it('should reject pattern creation by non-admin', async () => {
      const res = await request(app)
        .post('/api/patterns')
        .set('Cookie', userCookies)
        .send({ name: 'Should Fail' });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/patterns/:id', () => {
    it('should update pattern as admin', async () => {
      const res = await request(app)
        .put(`/api/patterns/${createdPatternId}`)
        .set('Cookie', adminCookies)
        .send({ name: '更新パターン名' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
    });

    it('should reject update by non-admin', async () => {
      const res = await request(app)
        .put(`/api/patterns/${createdPatternId}`)
        .set('Cookie', userCookies)
        .send({ name: 'nope' });

      expect(res.status).toBe(403);
    });
  });

  // --- Slots ---
  describe('POST /api/slots', () => {
    it('should create a slot as admin', async () => {
      const res = await request(app).post('/api/slots').set('Cookie', adminCookies).send({
        pattern_id: createdPatternId,
        period_name: 'テスト1限',
        start_time: '16:00',
        end_time: '17:20',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      createdSlotId = res.body.id;
    });

    it('should reject slot creation by non-admin', async () => {
      const res = await request(app).post('/api/slots').set('Cookie', userCookies).send({
        pattern_id: createdPatternId,
        period_name: 'NOPE',
        start_time: '16:00',
        end_time: '17:20',
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/slots/:id', () => {
    it('should update slot as admin', async () => {
      const res = await request(app)
        .put(`/api/slots/${createdSlotId}`)
        .set('Cookie', adminCookies)
        .send({
          period_name: '更新コマ名',
          start_time: '17:30',
          end_time: '18:50',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
    });
  });

  // --- Pattern Assignments ---
  describe('GET /api/pattern_assignments', () => {
    it('should return assignments for user', async () => {
      const res = await request(app).get('/api/pattern_assignments').set('Cookie', userCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/pattern_assignments', () => {
    it('should create assignment', async () => {
      const res = await request(app)
        .post('/api/pattern_assignments')
        .set('Cookie', userCookies)
        .send({
          user_id: testUserId,
          start_date: '2025-01-01',
          end_date: '2025-03-31',
          pattern_id: createdPatternId,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
      expect(res.body).toHaveProperty('id');
      createdAssignmentId = res.body.id;
    });
  });

  describe('DELETE /api/pattern_assignments/:id', () => {
    it('should delete assignment', async () => {
      const res = await request(app)
        .delete(`/api/pattern_assignments/${createdAssignmentId}`)
        .set('Cookie', userCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'deleted');
    });
  });

  // --- Cleanup: Delete pattern & slot ---
  describe('DELETE /api/slots/:id and /api/patterns/:id', () => {
    it('should delete slot as admin', async () => {
      const res = await request(app)
        .delete(`/api/slots/${createdSlotId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'deleted');
      createdSlotId = 0; // prevent double cleanup
    });

    it('should delete pattern as admin', async () => {
      const res = await request(app)
        .delete(`/api/patterns/${createdPatternId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'deleted');
      createdPatternId = 0; // prevent double cleanup
    });
  });
});
