/**
 * Users API Integration Tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import usersRouter from '../../src/routes/users';
import authRouter from '../../src/routes/auth'; // Needed to login/register
import { errorHandler } from '../../src/utils/errors';
import bcrypt from 'bcrypt';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use(errorHandler);

const adminUsername = `testadmin_${Date.now()}`;
const adminPassword = 'password123';
let adminUserId;
let adminCookies;

const regularUsername = `testuser_${Date.now()}`;
let regularUserId;

describe('Users API Integration Tests', () => {
  beforeAll(async () => {
    // 1. Create Admin User
    // Register first
    let res = await request(app)
      .post('/api/auth/register')
      .send({ username: adminUsername, password: adminPassword });
    adminUserId = res.body.user.id;

    // Manually promote to admin in DB
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', adminUserId);

    // Login to get token
    res = await request(app)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    adminCookies = res.headers['set-cookie'];

    // 2. Create Regular User (for deletion/interaction tests)
    res = await request(app)
      .post('/api/auth/register')
      .send({ username: regularUsername, password: adminPassword });
    regularUserId = res.body.user.id;
  });

  afterAll(() => {
    try {
      // Cleanup
      if (regularUserId) {
        db.prepare('DELETE FROM rates WHERE user_id = ?').run(regularUserId);
        db.prepare('DELETE FROM users WHERE id = ?').run(regularUserId);
      }
      if (adminUserId) {
        db.prepare('DELETE FROM users WHERE id = ?').run(adminUserId);
      }
    } catch (e) {
      console.error('Cleanup failed', e);
    }
  });

  describe('GET /api/users', () => {
    it('should return all users for admin', async () => {
      const res = await request(app).get('/api/users').set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should contain at least our two users
      const usernames = res.body.map((u) => u.username);
      expect(usernames).toContain(adminUsername);
      expect(usernames).toContain(regularUsername);
    });

    it('should deny access for non-admin', async () => {
      // Login as regular user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: regularUsername, password: adminPassword });
      const regularCookies = loginRes.headers['set-cookie'];

      const res = await request(app).get('/api/users').set('Cookie', regularCookies);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/users/:id/profile', () => {
    it('should reject username shorter than 3 chars', async () => {
      const res = await request(app)
        .put(`/api/users/${adminUserId}/profile`)
        .set('Cookie', adminCookies)
        .send({ username: 'ab' });

      expect(res.status).toBe(400);
    });

    it('should reject username longer than 50 chars', async () => {
      const res = await request(app)
        .put(`/api/users/${adminUserId}/profile`)
        .set('Cookie', adminCookies)
        .send({ username: 'a'.repeat(51) });

      expect(res.status).toBe(400);
    });

    it('should reject missing username', async () => {
      const res = await request(app)
        .put(`/api/users/${adminUserId}/profile`)
        .set('Cookie', adminCookies)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/:id/role', () => {
    it('should allow admin to change user role', async () => {
      const res = await request(app)
        .put(`/api/users/${regularUserId}/role`)
        .set('Cookie', adminCookies)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);

      // Verify in DB
      // Verify in DB
      const user = /** @type {{role: string}} */ (
        db.prepare('SELECT role FROM users WHERE id = ?').get(regularUserId)
      );
      expect(user.role).toBe('admin');

      // Find it back
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('user', regularUserId);
    });
  });

  // Note: Deleting users is complex due to FKs, tested minimally here to avoid breaking other things if cleanup fails
  // or we can skip it if we trust the manual cleanup.
  // Given the comprehensive cleanup in the actual route, it's good to test.
  // But we are using the regularUser for other tests in this suite?
  // Actually, let's create a temporary user just for deletion.

  describe('DELETE /api/users/:id', () => {
    it('should allow admin to delete a user', async () => {
      // Create temp user
      const tempUser = `temp_${Date.now()}`;
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ username: tempUser, password: 'password123' });
      const tempId = regRes.body.user.id;

      const res = await request(app).delete(`/api/users/${tempId}`).set('Cookie', adminCookies);

      expect(res.status).toBe(200);

      const check = db.prepare('SELECT * FROM users WHERE id = ?').get(tempId);
      expect(check).toBeUndefined();
    });

    it('should require password for self-deletion', async () => {
      // Bypass /api/auth/register because the registerLimiter (3/hour) is
      // already saturated by the suite. Seed the user directly with a known
      // password hash, then login to get cookies.
      const tempUser = `selfdel_${Date.now()}`;
      const tempPassword = 'password123';
      const tempHash = await bcrypt.hash(tempPassword, 10);
      const insertRes = db
        .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
        .run(tempUser, tempHash, 'user');
      const tempId = Number(insertRes.lastInsertRowid);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: tempUser, password: tempPassword });
      expect(loginRes.status).toBe(200);
      const tempCookies = loginRes.headers['set-cookie'];

      // Without password
      const noPwdRes = await request(app).delete(`/api/users/${tempId}`).set('Cookie', tempCookies);
      expect(noPwdRes.status).toBe(400);

      // With wrong password
      const wrongPwdRes = await request(app)
        .delete(`/api/users/${tempId}`)
        .set('Cookie', tempCookies)
        .send({ password: 'wrongpassword' });
      expect(wrongPwdRes.status).toBe(401);

      // With correct password
      const okRes = await request(app)
        .delete(`/api/users/${tempId}`)
        .set('Cookie', tempCookies)
        .send({ password: tempPassword });
      expect(okRes.status).toBe(200);

      const check = db.prepare('SELECT * FROM users WHERE id = ?').get(tempId);
      expect(check).toBeUndefined();
    });
  });
});
