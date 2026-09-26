/**
 * Broadcast helpers - rate limiter for the announcement (broadcast) endpoint.
 */
import rateLimit from 'express-rate-limit';

export const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ブロードキャスト送信が上限に達しました。1時間後に再度お試しください。' },
});
