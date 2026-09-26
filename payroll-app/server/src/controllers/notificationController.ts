/**
 * Notification Controller - push subscription management
 */
import type { Request, Response } from 'express';
import { notificationService } from '../services/notificationService.js';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isValidPushKey = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) return false;
  const normalized = value.replace(/=+$/g, '');
  return normalized.length >= 16 && BASE64URL_PATTERN.test(normalized);
};

export const notificationController = {
  getVapidPublicKey(_req: Request, res: Response) {
    const publicKey = notificationService.getVapidPublicKey();
    if (!isNonEmptyString(publicKey)) {
      res.status(503).json({ error: 'プッシュ通知サービスは現在利用できません' });
      return;
    }

    res.json({ publicKey });
  },

  subscribe(req: Request, res: Response) {
    // Accept both { subscription: {...} } and raw subscription payloads.
    const subscription = req.body?.subscription ?? req.body;
    if (!subscription || !isNonEmptyString(subscription.endpoint)) {
      res.status(400).json({ error: '購読情報が無効です' });
      return;
    }

    if (!isValidHttpsUrl(subscription.endpoint)) {
      res.status(400).json({ error: '購読エンドポイントが無効です' });
      return;
    }

    if (
      !subscription.keys ||
      !isValidPushKey(subscription.keys.p256dh) ||
      !isValidPushKey(subscription.keys.auth)
    ) {
      res.status(400).json({ error: '購読キーが無効です' });
      return;
    }

    const result = notificationService.subscribe(req.user!.id, subscription);
    if (result === 'conflict') {
      res.status(409).json({ error: 'この通知先は既に登録されています' });
      return;
    }

    res.status(201).json({ message: 'Subscribed' });
  },

  unsubscribe(req: Request, res: Response) {
    const { endpoint } = req.body;
    if (!isNonEmptyString(endpoint)) {
      res.status(400).json({ error: 'エンドポイントが必要です' });
      return;
    }

    if (!isValidHttpsUrl(endpoint)) {
      res.status(400).json({ error: 'エンドポイントが無効です' });
      return;
    }

    notificationService.unsubscribe(endpoint, req.user!.id);
    res.json({ message: 'Unsubscribed' });
  },
};
