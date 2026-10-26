import express from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import { authenticateToken, requireRecentAuth } from '../middleware/auth.js';
import { validate, registerValidation, loginValidation } from '../middleware/validate.js';
import { z } from 'zod';
import { passwordSchema } from '@payroll/shared';
import { authController } from '../controllers/authController.js';
import { notifyRateLimitExceeded } from '../utils/discord.js';
import { createSqliteRateLimitStore } from '../utils/rateLimitStore.js';
import { userRepository } from '../repositories/userRepository.js';
import { recordSecurityEvent } from '../utils/securityLog.js';
import jwt from 'jsonwebtoken';

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

// ユーザー名ごとの失敗回数。IP を変えながら1つのアカウントを狙う総当たりを止める。
// 15 分で 10 回失敗したら、そのユーザー名へのログインを 15 分止める（成功は数えない）
const loginUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSqliteRateLimitStore('login-user'),
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) =>
    `user:${String(req.body?.username ?? '')
      .trim()
      .toLowerCase()}`,
  handler: (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : undefined;
    logger.warn(`Per-user login limit exceeded for username: ${username}`);
    notifyRateLimitExceeded({
      kind: 'login',
      ip: req.ip,
      username,
      userAgent: req.get('user-agent'),
    });
    const user = username ? userRepository.findByUsername(username) : undefined;
    if (user) {
      recordSecurityEvent(user.id, 'login_locked', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
    res.status(429).json({
      error: 'このアカウントへのログイン失敗が続いたため、15分間ログインを止めています',
    });
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

router.post(
  '/login',
  loginLimiter,
  validate(loginValidation),
  loginUserLimiter,
  authController.login,
);
// 二段階目（認証アプリのコード）。6 桁なので、IP ごとに加えて「パスワードが合った人ごと」にも絞る
const mfaUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSqliteRateLimitStore('mfa-user'),
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => {
    const pending = req.cookies?.mfa_pending;
    const uid =
      typeof pending === 'string'
        ? (jwt.decode(pending) as { uid?: number } | null)?.uid
        : undefined;
    return `mfa:${uid ?? 'none'}`;
  },
  message: { error: 'コードの入力に続けて失敗したため、15分間止めています' },
});
router.post('/login/totp', loginLimiter, mfaUserLimiter, authController.loginTotp);
// パスワードのあとの二段階目をパスキーで（その人のパスキーだけを候補に出す）
router.post('/login/passkey/options', refreshLimiter, authController.loginPasskeyOptions);
router.post(
  '/login/passkey/verify',
  loginLimiter,
  mfaUserLimiter,
  authController.loginPasskeyVerify,
);
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
router.post(
  '/oidc/link',
  oidcLimiter,
  authenticateToken,
  requireRecentAuth,
  authController.oidcLinkStart,
);
router.delete('/oidc/link', authenticateToken, requireRecentAuth, authController.oidcUnlink);

// パスキー。ログインの検証はパスワードと同じリミッター（失敗だけを数える）
router.get('/passkey/config', authController.passkeyConfig);
router.post(
  '/passkey/register/options',
  authenticateToken,
  requireRecentAuth,
  authController.passkeyRegisterOptions,
);
router.post('/passkey/register/verify', authenticateToken, authController.passkeyRegisterVerify);
router.post('/passkey/login/options', refreshLimiter, authController.passkeyLoginOptions);
router.post('/passkey/login/verify', loginLimiter, authController.passkeyLoginVerify);
router.get('/passkeys', authenticateToken, authController.passkeyList);
router.delete('/passkeys/:id', authenticateToken, requireRecentAuth, authController.passkeyDelete);

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
router.post(
  '/email',
  mailLimiter,
  authenticateToken,
  requireRecentAuth,
  authController.emailRequestVerification,
);
router.post('/email/verify', refreshLimiter, authController.emailConfirm);
router.delete('/email', authenticateToken, requireRecentAuth, authController.emailRemove);
router.post('/password/forgot', mailLimiter, authController.passwordForgot);
router.post(
  '/password/reset',
  loginLimiter,
  validate(passwordResetValidation),
  authController.passwordReset,
);

// ログイン中の端末・大事な操作の前の本人確認・セキュリティの記録
router.get('/sessions', authenticateToken, authController.sessionList);
router.delete('/sessions/:id', authenticateToken, authController.sessionRevoke);
router.post('/sessions/revoke-others', authenticateToken, authController.sessionRevokeOthers);
router.post('/reauth', loginLimiter, authenticateToken, authController.reauth);
router.post('/reauth/passkey/options', authenticateToken, authController.reauthPasskeyOptions);
router.post('/reauth/oidc', oidcLimiter, authenticateToken, authController.reauthOidcStart);
router.get('/reauth/status', authenticateToken, authController.reauthStatus);
router.get('/login/pending', refreshLimiter, authController.loginPending);
router.post(
  '/reauth/passkey/verify',
  loginLimiter,
  authenticateToken,
  authController.reauthPasskeyVerify,
);
router.get('/security-events', authenticateToken, authController.securityEvents);

// 認証アプリ（TOTP）・回復コード。登録・解除・作り直しは大事な操作として本人確認を求める
router.get('/mfa', authenticateToken, authController.mfaStatus);
router.post('/totp/setup', authenticateToken, requireRecentAuth, authController.totpSetup);
router.post(
  '/totp/confirm',
  loginLimiter,
  authenticateToken,
  requireRecentAuth,
  authController.totpConfirm,
);
router.delete('/totp', authenticateToken, requireRecentAuth, authController.totpDisable);
router.delete('/trusted-devices', authenticateToken, authController.trustedDevicesClear);
router.post(
  '/recovery-codes',
  authenticateToken,
  requireRecentAuth,
  authController.recoveryCodesRegenerate,
);

export default router;
