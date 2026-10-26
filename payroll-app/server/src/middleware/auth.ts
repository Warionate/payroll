import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { userRepository } from '../repositories/userRepository.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { mfaService } from '../services/mfaService.js';
import { AuthorizationError, ErrorCodes } from '../utils/errors.js';
import type { AuthUser } from '../types/auth.js';
import '../types/auth.js'; // Ensure global Express.Request augmentation is loaded

export type { AuthUser };

// JWT_SECRET is required for secure token signing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  logger.error('FATAL: JWT_SECRET must be set in .env and be at least 32 characters');
  process.exit(1);
}

/**
 * JWT認証ミドルウェア
 * Authorization ヘッダーまたは cookie からトークンを取得して検証する
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // If no header token, check cookie
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token == null) {
    res.status(401).json({ error: '認証トークンが必要です' });
    return;
  }

  jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) {
      res.status(401).json({ error: 'トークンが無効または期限切れです' });
      return;
    }
    const { sid, ...payload } = decoded as AuthUser & { sid?: string };
    const user = payload as AuthUser;
    // ログイン（sessions）が切られていれば、アクセストークンの期限（15 分）を待たずに拒否する
    if (sid) {
      try {
        const session = sessionRepository.findById(sid);
        if (
          !session ||
          session.user_id !== user.id ||
          session.revoked_at ||
          new Date(session.expires_at) <= new Date()
        ) {
          res.status(401).json({ error: 'ログインの有効期限が切れました' });
          return;
        }
      } catch (e) {
        logger.warn('Failed to check session', { error: (e as Error).message });
      }
    }
    // Revalidate role from DB to handle role changes and deletions during
    // token lifetime. A missing row means the user was deleted — reject the
    // token immediately instead of honoring it until expiry.
    try {
      const row = userRepository.findById(user.id);
      if (!row) {
        res.status(401).json({ error: 'ユーザーが存在しません' });
        return;
      }
      user.role = row.role;
      user.username = row.username ?? user.username; // ユーザー ID を変えた直後でも DB の値を使う
      // 最初の設定（ユーザー ID・確認済みのメール・二段階）を済ませるまでは、ログインまわり（/api/auth）と
      // 自分のユーザー ID の変更しか使わせない
      const path = req.originalUrl.split('?')[0];
      const allowedDuringSetup =
        path.startsWith('/api/auth/') || path === `/api/users/${user.id}/login-id`;
      if (!allowedDuringSetup) {
        const setup = mfaService.setupStatus(row);
        if (setup.email || setup.mfa || setup.loginId) {
          res.status(403).json({
            error:
              '先に最初の設定（ユーザーID・メールアドレスの確認・二段階認証）を済ませてください',
            errorCode: ErrorCodes.AUTH_SETUP_REQUIRED,
            setup,
          });
          return;
        }
      }
    } catch (e) {
      // DB error only — fall back to the role embedded in the JWT
      logger.warn('Failed to revalidate user role from DB', {
        userId: user.id,
        error: (e as Error).message,
      });
    }
    req.user = user;
    req.sessionId = sid;
    next();
  });
}

/**
 * Require the authenticated user to have role 'admin'.
 * Must be chained after authenticateToken.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    return next(new AuthorizationError('管理者権限が必要です', ErrorCodes.ADMIN_REQUIRED));
  }
  next();
}

/** 大事な操作の前に、何分以内に本人確認（ログイン・再確認）していればよいか */
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

/**
 * 大事な操作（メールアドレス・パスキー・Authentik 連携の変更）の前に、直近の本人確認を求める。
 * 足りなければ 403 + reauth: true を返し、画面はパスワードを聞いて POST /api/auth/reauth の後にやり直す。
 * authenticateToken の後に置く。
 */
export function requireRecentAuth(req: Request, res: Response, next: NextFunction): void {
  const session = req.sessionId ? sessionRepository.findById(req.sessionId) : undefined;
  const authenticatedAt = session ? new Date(session.authenticated_at).getTime() : 0;
  if (Date.now() - authenticatedAt <= REAUTH_WINDOW_MS) {
    next();
    return;
  }
  res.status(403).json({
    error: '続けるには、もう一度パスワードを入力してください',
    errorCode: ErrorCodes.AUTH_REAUTH_REQUIRED,
    reauth: true,
  });
}

/**
 * 他人のアカウントへの操作（管理者による削除・パスワード変更）の前に、直近の本人確認を求める。
 * 自分のアカウントへの操作は、それぞれ今のパスワードを求めているので通す。:id を持つルートで使う
 */
export function requireRecentAuthForOthers(req: Request, res: Response, next: NextFunction): void {
  if (Number(req.params.id) === req.user?.id) {
    next();
    return;
  }
  requireRecentAuth(req, res, next);
}
