/**
 * Notifications API Integration Tests
 * Tests VAPID key, push subscription endpoints
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import db from '../../src/db';
import authRouter from '../../src/routes/auth';
import notificationsRouter from '../../src/routes/notifications';
import { errorHandler } from '../../src/utils/errors';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/notifications', notificationsRouter);
app.use(errorHandler);

const testUsername = `notif_test_${Date.now()}`;
const testUsername2 = `notif_test_alt_${Date.now()}`;
let testUserId: number;
let authCookies: string[];
let testUserId2: number;
let authCookies2: string[];
const testEndpoint = `https://push.example.com/test_${Date.now()}`;
const testPublicKey =
  'BEl62iUYgUivhWyvY7zdVxJQ2lrX6A4L0j8fVwYUhc2awD9J1y1hIn4d5sQr7Qm-Qx8vPj7Y_ScQf0XpQ6a0QxI';

describe('Notifications API Integration Tests', () => {
  beforeAll(async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: testUsername, password: 'password123' });
    testUserId = regRes.body.user.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: 'password123' });
    authCookies = loginRes.headers['set-cookie'] as unknown as string[];

    const regRes2 = await request(app)
      .post('/api/auth/register')
      .send({ username: testUsername2, password: 'password123' });
    testUserId2 = regRes2.body.user.id;

    const loginRes2 = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername2, password: 'password123' });
    authCookies2 = loginRes2.headers['set-cookie'] as unknown as string[];
  });

  afterAll(() => {
    if (testUserId) {
      try {
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }

    if (testUserId2) {
      try {
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(testUserId2);
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(testUserId2);
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId2);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('GET /api/notifications/vapid-public-key', () => {
    it('should return 200 with public key when configured', async () => {
      const original = process.env.VAPID_PUBLIC_KEY;
      process.env.VAPID_PUBLIC_KEY = testPublicKey;

      const res = await request(app).get('/api/notifications/vapid-public-key');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ publicKey: testPublicKey });

      if (original !== undefined) {
        process.env.VAPID_PUBLIC_KEY = original;
      } else {
        delete process.env.VAPID_PUBLIC_KEY;
      }
    });

    it('should return 503 when public key is not configured', async () => {
      const original = process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PUBLIC_KEY;

      const res = await request(app).get('/api/notifications/vapid-public-key');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('error', 'プッシュ通知サービスは現在利用できません');

      if (original !== undefined) {
        process.env.VAPID_PUBLIC_KEY = original;
      }
    });
  });

  describe('POST /api/notifications/subscribe', () => {
    it('should subscribe to push notifications', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({
          subscription: {
            endpoint: testEndpoint,
            keys: {
              p256dh: 'test_p256dh_key_data',
              auth: 'test_auth_key_data',
            },
          },
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message', 'Subscribed');
    });

    it('should subscribe with raw payload format for backward compatibility', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({
          endpoint: `https://push.example.com/raw_${Date.now()}`,
          keys: {
            p256dh: 'BCQ5hH6AK2jJv2n5jTQmA9xvQNk4K5P2yBvv3-fdS3qY1mG7k2dP2kQj8bF1h5mL',
            auth: 'K2jJv2n5jTQmA9xvQNk4K5',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message', 'Subscribed');
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .send({
          subscription: {
            endpoint: 'https://push.example.com/another',
            keys: { p256dh: 'key', auth: 'auth' },
          },
        });

      expect(res.status).toBe(401);
    });

    it('should reject invalid subscription (no endpoint)', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({ subscription: {} });

      expect(res.status).toBe(400);
    });

    it('should reject invalid subscription (no keys)', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({ subscription: { endpoint: 'https://test.com' } });

      expect(res.status).toBe(400);
    });

    it('should reject invalid subscription endpoint protocol', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({
          subscription: {
            endpoint: 'http://push.example.com/insecure',
            keys: {
              p256dh: 'BCQ5hH6AK2jJv2n5jTQmA9xvQNk4K5P2yBvv3-fdS3qY1mG7k2dP2kQj8bF1h5mL',
              auth: 'K2jJv2n5jTQmA9xvQNk4K5',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '購読エンドポイントが無効です');
    });

    it('should reject invalid subscription key format', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({
          subscription: {
            endpoint: 'https://push.example.com/invalid-key',
            keys: {
              p256dh: 'short',
              auth: 'also-short',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '購読キーが無効です');
    });

    it('should reject endpoint already registered by another user', async () => {
      const duplicateEndpoint = `https://push.example.com/dup_${Date.now()}`;

      const first = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies)
        .send({
          subscription: {
            endpoint: duplicateEndpoint,
            keys: {
              p256dh: 'BCQ5hH6AK2jJv2n5jTQmA9xvQNk4K5P2yBvv3-fdS3qY1mG7k2dP2kQj8bF1h5mL',
              auth: 'K2jJv2n5jTQmA9xvQNk4K5',
            },
          },
        });

      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/notifications/subscribe')
        .set('Cookie', authCookies2)
        .send({
          subscription: {
            endpoint: duplicateEndpoint,
            keys: {
              p256dh: 'BCQ5hH6AK2jJv2n5jTQmA9xvQNk4K5P2yBvv3-fdS3qY1mG7k2dP2kQj8bF1h5mL',
              auth: 'K2jJv2n5jTQmA9xvQNk4K5',
            },
          },
        });

      expect(second.status).toBe(409);
      expect(second.body).toHaveProperty('error', 'この通知先は既に登録されています');
    });
  });

  describe('POST /api/notifications/unsubscribe', () => {
    it('should unsubscribe from push notifications', async () => {
      const res = await request(app)
        .post('/api/notifications/unsubscribe')
        .set('Cookie', authCookies)
        .send({ endpoint: testEndpoint });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Unsubscribed');
    });

    it('should reject without endpoint', async () => {
      const res = await request(app)
        .post('/api/notifications/unsubscribe')
        .set('Cookie', authCookies)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject invalid endpoint protocol', async () => {
      const res = await request(app)
        .post('/api/notifications/unsubscribe')
        .set('Cookie', authCookies)
        .send({ endpoint: 'http://push.example.com/insecure' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'エンドポイントが無効です');
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/notifications/unsubscribe')
        .send({ endpoint: testEndpoint });

      expect(res.status).toBe(401);
    });
  });
});
