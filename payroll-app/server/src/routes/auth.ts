import express from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate, registerValidation, loginValidation } from '../middleware/validate.js';
import { z } from 'zod';
import { passwordSchema } from '@payroll/shared';
import { authController } from '../controllers/authController.js';
import { notifyRateLimitExceeded } from '../utils/discord.js';
import { createSqliteRateLimitStore } from '../utils/rateLimitStore.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // 本番はクラスタ動作のため、ワーカー間で共有される SQLite ストアを使う
  store: createSqliteRateLimitStore('login'),
  skipSuccessfulRequests: true, // Don't count successful logins toward rate limit
  message: { error: 'ログイン試行回数が上限に達しました。15分後に再度お試しください。' },
  handler: (req: Request, res: Response) => {
    logger.warn(`Login rate limit exceeded for IP: ${req.ip}`);
    notifyRateLimitExceeded({
      kind: 'login',
      ip: req.ip,
      username: typeof req.body?.username === 'string' ? req.body.username : undefined,
      userAgent: req.get('user-agent'),
    });
    res
      .status(429)
      .json({ error: 'ログイン試行回数が上限に達しました。15分後に再度お試しください。' });
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSqliteRateLimitStore('register'),
  message: { error: '登録試行回数が上限に達しました。1時間後に再度お試しください。' },
  handler: (req: Request, res: Response) => {
    logger.warn(`Register rate limit exceeded for IP: ${req.ip}`);
    notifyRateLimitExceeded({
      kind: 'register',
      ip: req.ip,
      username: typeof req.body?.username === 'string' ? req.body.username : undefined,
      userAgent: req.get('user-agent'),
    });
    res
      .status(429)
      .json({ error: '登録試行回数が上限に達しました。1時間後に再度お試しください。' });
  },
});

// A-3: refresh / logout は無認証で叩ける書き込みエンドポイント（DB 参照 +
// トークン発行/失効）。全体リミッター（5000/15分/ワーカー）より厳しめの IP 単位
// SQLite ストアで DoS 面と防御の一貫性を担保する。正常系はアクセストークン失効
// ごと（≒15分に1回）+ 並行リフレッシュのグレース程度なので、塾の NAT 共有環境
// でも当たらない十分に高い上限にしている。refresh と logout で 1 ストアを共有。
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSqliteRateLimitStore('refresh'),
  message: { error: 'リクエストが多すぎます。しばらくしてから再度お試しください。' },
  handler: (req: Request, res: Response) => {
    logger.warn(`Refresh/logout rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ error: 'リクエストが多すぎます。しばらくしてから再度お試しください。' });
  },
});

// Authentik（OIDC）。送り出しと戻りの両方を数える。正常系は1回のログインで2リクエスト
const oidcLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSqliteRateLimitStore('oidc'),
  message: { error: 'リクエストが多すぎます。しばらくしてから再度お試しください。' },
});

router.post('/login', loginLimiter, validate(loginValidation), authController.login);
router.post('/logout', refreshLimiter, authController.logout);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/register', registerLimiter, validate(registerValidation), authController.register);
router.get('/me', authenticateToken, authController.me);
router.get('/calendar_token', authenticateToken, authController.getCalendarToken);
router.post('/calendar_token/reset', authenticateToken, authController.resetCalendarToken);

router.get('/oidc/config', authController.oidcConfig);
router.get('/oidc/status', authenticateToken, authController.oidcStatus);
router.get('/oidc/login', oidcLimiter, authController.oidcLogin);
router.get('/oidc/callback', oidcLimiter, authController.oidcCallback);
router.post('/oidc/link', oidcLimiter, authenticateToken, authController.oidcLinkStart);
router.delete('/oidc/link', authenticateToken, authController.oidcUnlink);

// パスキー。ログインの検証はパスワードと同じリミッター（失敗だけを数える）
router.get('/passkey/config', authController.passkeyConfig);
router.post('/passkey/register/options', authenticateToken, authController.passkeyRegisterOptions);
router.post('/passkey/register/verify', authenticateToken, authController.passkeyRegisterVerify);
router.post('/passkey/login/options', refreshLimiter, authController.passkeyLoginOptions);
router.post('/passkey/login/verify', loginLimiter, authController.passkeyLoginVerify);
router.get('/passkeys', authenticateToken, authController.passkeyList);
router.delete('/passkeys/:id', authenticateToken, authController.passkeyDelete);

// メールアドレス（確認・パスワード再設定）。メールを送る入口は IP ごとにも絞る
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSqliteRateLimitStore('mail'),
  message: { error: 'リクエストが多すぎます。しばらくしてから再度お試しください。' },
});
const passwordResetValidation = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

router.get('/email/config', authController.emailConfig);
router.get('/email', authenticateToken, authController.emailStatus);
router.post('/email', mailLimiter, authenticateToken, authController.emailRequestVerification);
router.post('/email/verify', refreshLimiter, authController.emailConfirm);
router.delete('/email', authenticateToken, authController.emailRemove);
router.post('/password/forgot', mailLimiter, authController.passwordForgot);
router.post(
  '/password/reset',
  loginLimiter,
  validate(passwordResetValidation),
  authController.passwordReset,
);

export default router;
