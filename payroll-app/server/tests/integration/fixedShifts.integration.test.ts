/**
 * Fixed Shifts API Integration Tests
 * Tests fixed shift CRUD with real database
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import fixedShiftsRouter from '../../src/routes/fixed_shifts';
import { errorHandler } from '../../src/utils/errors';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/fixed-shifts', fixedShiftsRouter);
app.use(errorHandler);

const testUsername = `fs_test_${Date.now()}`;
let testUserId: number;
let authCookies: string[];
let createdShiftId: number;

// We need a valid schedule_slot_id. The default pattern (id=1) should exist.
let testSlotId: number;

describe('Fixed Shifts API Integration Tests', () => {
  beforeAll(async () => {
    // Register and login
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: testUsername, password: 'password123' });
    testUserId = regRes.body.user.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: 'password123' });
    authCookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Get an existing slot id from db
    const slot = db.prepare('SELECT id FROM schedule_slots LIMIT 1').get() as
      { id: number } | undefined;
    if (slot) {
      testSlotId = slot.id;
    } else {
      // Create a pattern and slot if none exist
      const patternResult = db
        .prepare("INSERT INTO schedule_patterns (name, is_default) VALUES ('test_pattern', 0)")
        .run();
      const slotResult = db
        .prepare(
          "INSERT INTO schedule_slots (pattern_id, period_name, start_time, end_time) VALUES (?, '1限', '16:00', '17:20')",
        )
        .run(patternResult.lastInsertRowid);
      testSlotId = Number(slotResult.lastInsertRowid);
    }
  });

  afterAll(() => {
    if (testUserId) {
      try {
        db.prepare('DELETE FROM fixed_shifts WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('POST /api/fixed-shifts', () => {
    it('should create a fixed shift', async () => {
      const res = await request(app).post('/api/fixed-shifts').set('Cookie', authCookies).send({
        day_of_week: 1,
        schedule_slot_id: testSlotId,
        student_count: 2,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
      expect(res.body).toHaveProperty('id');
      createdShiftId = res.body.id;
    });

    it('should reject invalid day_of_week', async () => {
      const res = await request(app).post('/api/fixed-shifts').set('Cookie', authCookies).send({
        day_of_week: 7,
        schedule_slot_id: testSlotId,
        student_count: 2,
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid student_count', async () => {
      const res = await request(app).post('/api/fixed-shifts').set('Cookie', authCookies).send({
        day_of_week: 1,
        schedule_slot_id: testSlotId,
        student_count: 5,
      });

      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/fixed-shifts')
        .send({ day_of_week: 1, schedule_slot_id: testSlotId, student_count: 2 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/fixed-shifts', () => {
    it('should return fixed shifts for user', async () => {
      const res = await request(app).get('/api/fixed-shifts').set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/fixed-shifts');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/fixed-shifts/bulk', () => {
    it('should bulk replace fixed shifts', async () => {
      const res = await request(app)
        .put('/api/fixed-shifts/bulk')
        .set('Cookie', authCookies)
        .send({
          shifts: [
            { day_of_week: 2, schedule_slot_id: testSlotId, student_count: 1 },
            { day_of_week: 3, schedule_slot_id: testSlotId, student_count: 3 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'success');
      expect(res.body).toHaveProperty('count', 2);
    });

    it('should reject invalid shifts array', async () => {
      const res = await request(app)
        .put('/api/fixed-shifts/bulk')
        .set('Cookie', authCookies)
        .send({ shifts: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should reject shifts with invalid data', async () => {
      const res = await request(app)
        .put('/api/fixed-shifts/bulk')
        .set('Cookie', authCookies)
        .send({
          shifts: [{ day_of_week: 8, schedule_slot_id: testSlotId, student_count: 1 }],
        });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/fixed-shifts/:id', () => {
    it('should delete a fixed shift', async () => {
      // Get a current shift id
      const getRes = await request(app).get('/api/fixed-shifts').set('Cookie', authCookies);

      if (getRes.body.data.length > 0) {
        const idToDelete = getRes.body.data[0].id;
        const res = await request(app)
          .delete(`/api/fixed-shifts/${idToDelete}`)
          .set('Cookie', authCookies);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'deleted');
      }
    });
  });
});
