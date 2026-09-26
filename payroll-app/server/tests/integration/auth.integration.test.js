/**
 * Auth API Integration Tests
 * Tests authentication endpoints with real database
 *
 * Note: Environment variables are set in vitest.config.js
 */
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import { errorHandler } from '../../src/utils/errors';

// Create test app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use(errorHandler);

// Unique test username to avoid conflicts
const testUsername = `testuser_${Date.now()}`;
let testUserId;
let authCookies;

describe('Auth API Integration Tests', () => {
  afterAll(() => {
    // Cleanup: Delete test user
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

  describe('POST /api/auth/register', () => {
    it('should register a new user and auto-login (sets auth cookies)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: testUsername,
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('username', testUsername);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body).not.toHaveProperty('token');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'].some((c) => c.startsWith('token='))).toBe(true);
      testUserId = res.body.user.id;
    });

    it('should reject duplicate username', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: testUsername,
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('既に使用されています');
    });

    it('should reject invalid username (too short)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'ab',
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject weak password (too short)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'validuser123',
        password: '12345',
      });

      // Either validation error (400) or rate limit (429) is acceptable
      expect([400, 429]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully and NOT return token in body', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: testUsername,
        password: 'password123',
      });

      expect(res.status).toBe(200);
      // Token should NOT be in the response body (cookie-only)
      expect(res.body).not.toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('username', testUsername);

      // Save cookies for subsequent requests
      authCookies = res.headers['set-cookie'];
    });

    it('should set HTTP-only cookie on login', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: testUsername,
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('should reject wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: testUsername,
        password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject non-existent user', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: 'nonexistentuser999',
        password: 'password123',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid cookie', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', authCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', testUserId);
      expect(res.body).toHaveProperty('username', testUsername);
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', ['token=invalidtoken123']);

      // API returns 401 for invalid/malformed tokens
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates tokens and returns the user so a cold start can skip /me (B-1)', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: testUsername, password: 'password123' });
      const cookies = loginRes.headers['set-cookie'];

      const res = await request(app).post('/api/auth/refresh').set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Token refreshed');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toEqual({ id: testUserId, username: testUsername, role: 'user' });
      // New auth cookies are issued on rotation
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'].some((c) => c.startsWith('token='))).toBe(true);
    });

    it('rejects refresh without a refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear cookie on logout', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Logged out');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });
});
