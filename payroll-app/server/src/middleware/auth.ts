import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { userRepository } from '../repositories/userRepository.js';
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
    const user = decoded as AuthUser;
    // Revalidate role from DB to handle role changes and deletions during
    // token lifetime. A missing row means the user was deleted — reject the
    // token immediately instead of honoring it until expiry.
    try {
      const role = userRepository.getRole(user.id);
      if (!role) {
        res.status(401).json({ error: 'ユーザーが存在しません' });
        return;
      }
      user.role = role as 'admin' | 'user';
    } catch (e) {
      // DB error only — fall back to the role embedded in the JWT
      logger.warn('Failed to revalidate user role from DB', {
        userId: user.id,
        error: (e as Error).message,
      });
    }
    req.user = user;
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
