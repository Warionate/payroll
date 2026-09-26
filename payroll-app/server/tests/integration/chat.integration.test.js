import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import chatRouter from '../../src/routes/chat';
import { errorHandler } from '../../src/utils/errors';
import { authService } from '../../src/services/authService';

// Create test app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/chat', chatRouter);
app.use(errorHandler);

const testUser = { id: null, username: 'testuser_chat', role: 'user' };
let authToken;

// G-1: the 1:1 / group chat feature is removed. Its room/message endpoints must
// respond 410 Gone, while announcements (broadcasts) + unread stay available at
// the same `/api/chat/*` URLs.
describe('Chat API — removed room/message endpoints return 410', () => {
  beforeAll(() => {
    const userRes = db
      .prepare(
        'INSERT INTO users (username, password_hash, role, calendar_token) VALUES (?, ?, ?, ?) RETURNING id',
      )
      .get(testUser.username, 'hashed_password', testUser.role, 'test_token_g1');
    testUser.id = userRes.id;
    authToken = authService.generateToken(testUser);
  });

  afterAll(() => {
    if (testUser.id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(testUser.id);
    }
  });

  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  it.each([
    ['get', '/api/chat/users'],
    ['get', '/api/chat/rooms'],
    ['post', '/api/chat/rooms'],
    ['delete', '/api/chat/rooms/1'],
    ['post', '/api/chat/rooms/1/read'],
    ['get', '/api/chat/rooms/1/members'],
    ['get', '/api/chat/rooms/1/messages'],
    ['post', '/api/chat/rooms/1/messages'],
    ['delete', '/api/chat/messages/1'],
  ])('%s %s → 410 Gone', async (method, path) => {
    const res = await auth(request(app)[method](path));
    expect(res.status).toBe(410);
  });

  it('requires auth before reporting the endpoint gone (401 without token)', async () => {
    const res = await request(app).get('/api/chat/rooms/1/messages');
    expect(res.status).toBe(401);
  });

  it('keeps announcements (broadcasts) available', async () => {
    const res = await auth(request(app).get('/api/chat/broadcasts'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('keeps the unread endpoint available', async () => {
    const res = await auth(request(app).get('/api/chat/unread'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('broadcasts');
  });
});
