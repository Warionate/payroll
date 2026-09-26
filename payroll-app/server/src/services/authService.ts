/**
 * Auth Service - authentication and authorization business logic
 */
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import db from '../db.js';
import { encrypt } from '../utils/crypto.js';
import { notifyNewUserRegistration, notifyRefreshTokenReuse } from '../utils/discord.js';
import { userRepository } from '../repositories/userRepository.js';
import {
  refreshTokenRepository,
  type RefreshTokenRow,
} from '../repositories/refreshTokenRepository.js';
import { rateRepository } from '../repositories/rateRepository.js';
import { authentikService } from './authentikService.js';
import type { AuthUser } from '../types/auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  logger.error('FATAL: JWT_SECRET must be set in .env and be at least 32 characters');
  process.exit(1);
}

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// 正常ローテーション直後の並行リフレッシュ競合を盗用と誤検知しないための猶予。
// この時間内に revoke 済みトークンが再利用されても全無効化せず再発行する。
// （盗用検知はこの猶予を過ぎた再利用に対しては従来どおり機能する）
const REFRESH_REUSE_GRACE_MS = 30_000;

// Precomputed bcrypt hash of a random string. When a login targets a
// non-existent username we still run one bcrypt comparison against this hash
// so the response time does not reveal whether the username exists
// (timing-based user enumeration mitigation).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

/**
 * Refresh tokens are stored as SHA-256 hashes so a DB leak does not expose
 * usable session tokens. Lookups fall back to the raw value for rows written
 * before this change (those rotate to hashed rows on first refresh).
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function findStoredToken(token: string): RefreshTokenRow | undefined {
  return (
    refreshTokenRepository.findByToken(hashToken(token)) ??
    refreshTokenRepository.findByToken(token)
  );
}

export const authService = {
  /**
   * Authenticate user with username and password
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ user: AuthUser; token: string; refreshToken: string } | null> {
    // ログイン欄はユーザー名とメールアドレスの両方を受ける。ユーザー名を先に探し、
    // 見つからず @ を含むときだけ確認済みのメールアドレスとして探す
    const user =
      userRepository.findByUsername(username) ??
      (username.includes('@') ? userRepository.findByEmail(username) : undefined);
    if (!user) {
      // Equalize timing with the valid-username path to avoid leaking which
      // usernames exist. The result is intentionally ignored.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      logger.warn(`Failed login attempt for username: ${username}`);
      return null;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return null;
    }

    // Authentik と連携済みなら、role の正は Authentik。パスワードでのログインでも確認しに行く。
    // Authentik に届かないとき（null）は DB の role を据え置く（ログインは止めない）。
    const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;

    const authUser: AuthUser = { id: user.id, username: user.username, role };
    const token = authService.generateToken(authUser);
    const refreshToken = authService.generateRefreshToken(user.id);

    logger.info(`User logged in: ${user.username}`);
    return { user: authUser, token, refreshToken };
  },

  /**
   * パスワード以外（パスキー）で本人確認が済んだ利用者にログインのトークンを発行する。
   * Authentik 連携済みなら、パスワードのときと同じく role を Authentik に合わせる。
   */
  async issueSession(user: {
    id: number;
    username: string;
    role: 'user' | 'admin';
    oidc_sub: string | null;
  }): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
    const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;
    const authUser: AuthUser = { id: user.id, username: user.username, role };
    const token = authService.generateToken(authUser);
    const refreshToken = authService.generateRefreshToken(user.id);
    return { user: authUser, token, refreshToken };
  },

  /**
   * Authentik の管理者グループを見て DB の role を合わせる。返り値は合わせた後の role。
   */
  async syncRoleFromAuthentik(user: {
    id: number;
    username: string;
    role: 'user' | 'admin';
    oidc_sub: string | null;
  }): Promise<'user' | 'admin'> {
    if (!user.oidc_sub) return user.role;
    const admin = await authentikService.isAdmin(user.oidc_sub);
    if (admin === null) return user.role;
    return authService.applyRole(user, admin ? 'admin' : 'user');
  },

  /** Authentik 側の判定を DB に反映する。メイン管理者（admin）の role は変えない */
  applyRole(
    user: { id: number; username: string; role: 'user' | 'admin' },
    role: 'user' | 'admin',
  ): 'user' | 'admin' {
    if (user.role === role) return role;
    if (user.username === 'admin') {
      logger.warn('Authentik says role differs for main admin; not changing', { role });
      return user.role;
    }
    userRepository.updateRole(user.id, role);
    logger.info(`Role synced from Authentik: ${user.username} ${user.role} -> ${role}`);
    return role;
  },

  /**
   * Authentik でのログイン。紐づけ済みの sub のときだけ通す（新しいアカウントは作らない）。
   * role は ID トークンの groups に管理者グループがあるかで決める。
   */
  loginWithOidc(
    sub: string,
    groups: string[],
    adminGroup: string | undefined,
  ): { user: AuthUser; token: string; refreshToken: string } | null {
    const user = userRepository.findByOidcSub(sub);
    if (!user) {
      logger.warn(`OIDC login for unlinked sub: ${sub}`);
      return null;
    }
    const role = adminGroup
      ? authService.applyRole(user, groups.includes(adminGroup) ? 'admin' : 'user')
      : user.role;

    const authUser: AuthUser = { id: user.id, username: user.username, role };
    const token = authService.generateToken(authUser);
    const refreshToken = authService.generateRefreshToken(user.id);
    logger.info(`User logged in via OIDC: ${user.username}`);
    return { user: authUser, token, refreshToken };
  },

  /**
   * ログイン中の本人に Authentik を紐づける。
   * 紐づけた瞬間はアプリ側の role を Authentik に書く（逆にすると、アプリで admin の人が
   * 連携した瞬間に admin を失う）。以後の正は Authentik。
   * Authentik への書き込みに失敗したら紐づけない。
   */
  async linkOidc(userId: number, sub: string): Promise<'linked' | 'taken' | 'no_user'> {
    const user = userRepository.findById(userId);
    if (!user) return 'no_user';
    const owner = userRepository.findByOidcSub(sub);
    if (owner && owner.id !== userId) {
      logger.warn(`OIDC sub already linked to another user (sub=${sub}, owner=${owner.id})`);
      return 'taken';
    }
    if (authentikService.isConfigured()) {
      await authentikService.setAdmin(sub, user.role === 'admin');
    }
    userRepository.setOidcSub(userId, sub);
    logger.info(`OIDC linked: ${user.username} (sub=${sub})`);
    return 'linked';
  },

  /** 連携を解除する。解除後はアプリ側の role が正に戻る（Authentik のグループには触らない） */
  unlinkOidc(userId: number): void {
    userRepository.setOidcSub(userId, null);
    logger.info(`OIDC unlinked: user #${userId}`);
  },

  /**
   * Register a new user with optional initial rates
   */
  async register(
    username: string,
    password: string,
    rates?: {
      start_date: string;
      wage_1_student: string | number;
      wage_2_students: string | number;
      wage_3_students: string | number;
      wage_4_students: string | number;
      hourly_wage: string | number;
      allowance_day: string | number;
      allowance_gap: string | number;
    },
  ): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
    const hash = await bcrypt.hash(password, 10);
    const calendarToken = crypto.randomBytes(32).toString('hex');

    const registerTransaction = db.transaction(() => {
      const userId = userRepository.create(username, hash, calendarToken);

      if (rates) {
        const {
          start_date,
          wage_1_student,
          wage_2_students,
          wage_3_students,
          wage_4_students,
          hourly_wage,
          allowance_day,
          allowance_gap,
        } = rates;

        const requiredFields = [
          start_date,
          wage_1_student,
          wage_2_students,
          wage_3_students,
          wage_4_students,
          hourly_wage,
          allowance_day,
          allowance_gap,
        ];
        if (
          requiredFields.some(
            (value: unknown) => value === undefined || value === null || value === '',
          )
        ) {
          throw new Error('Incomplete rate data provided.');
        }

        rateRepository.create(
          userId,
          start_date,
          encrypt(wage_1_student),
          encrypt(wage_2_students),
          encrypt(wage_3_students),
          encrypt(wage_4_students),
          encrypt(hourly_wage),
          encrypt(allowance_day),
          encrypt(allowance_gap),
        );
      }

      return userId;
    });

    const userId = registerTransaction();
    logger.info(`New user registered: ${username}`);
    notifyNewUserRegistration(username, userId);

    const numericId = typeof userId === 'bigint' ? Number(userId) : userId;
    const authUser: AuthUser = { id: numericId, username, role: 'user' };
    const token = authService.generateToken(authUser);
    const refreshToken = authService.generateRefreshToken(numericId);
    return { user: authUser, token, refreshToken };
  },

  /**
   * Logout - revoke refresh token
   */
  logout(refreshToken: string | undefined): void {
    if (refreshToken) {
      const row = findStoredToken(refreshToken);
      if (row) {
        refreshTokenRepository.revoke(row.token);
      }
    }
  },

  /**
   * Refresh access token using refresh token
   */
  refresh(oldRefreshToken: string): { token: string; refreshToken: string; user: AuthUser } | null {
    const row = findStoredToken(oldRefreshToken);
    if (!row) return null;

    if (row.revoked) {
      // 直前（GRACE_MS 以内）に正常ローテーションで revoke されたトークンの再利用は、
      // 盗用ではなく並行リフレッシュの競合（socket と API が同時にリフレッシュ等）と
      // みなす。全無効化（=強制ログアウト）はせず、新しいトークンを再発行する。
      // revoked_at が無い = revokeAllForUser による全無効化なので、グレース対象外。
      const revokedAt = row.revoked_at ? new Date(row.revoked_at).getTime() : 0;
      const withinGrace = revokedAt > 0 && Date.now() - revokedAt <= REFRESH_REUSE_GRACE_MS;

      if (withinGrace) {
        const user = userRepository.findById(row.user_id);
        if (!user) return null;
        const authUser: AuthUser = { id: user.id, username: user.username, role: user.role };
        const newToken = authService.generateToken(authUser);
        const newRefreshToken = authService.generateRefreshToken(user.id);
        return { token: newToken, refreshToken: newRefreshToken, user: authUser };
      }

      // グレース外の再利用は盗用の強いシグナル — ユーザーの全トークンを無効化する。
      logger.warn('Revoked refresh token reused — revoking all tokens for user', {
        userId: row.user_id,
      });
      refreshTokenRepository.revokeAllForUser(row.user_id);
      notifyRefreshTokenReuse({ userId: row.user_id });
      return null;
    }

    if (new Date(row.expires_at) < new Date()) {
      refreshTokenRepository.deleteByToken(row.token);
      return null;
    }

    const user = userRepository.findById(row.user_id);
    if (!user) return null;

    const authUser: AuthUser = { id: user.id, username: user.username, role: user.role };

    refreshTokenRepository.revoke(row.token);
    const newToken = authService.generateToken(authUser);
    const newRefreshToken = authService.generateRefreshToken(user.id);

    return { token: newToken, refreshToken: newRefreshToken, user: authUser };
  },

  /**
   * Get or create calendar token for user
   */
  getOrCreateCalendarToken(userId: number): string {
    const existing = userRepository.getCalendarToken(userId);
    if (existing) return existing;

    const token = crypto.randomBytes(32).toString('hex');
    userRepository.updateCalendarToken(userId, token);
    return token;
  },

  /**
   * Reset calendar token
   */
  resetCalendarToken(userId: number): string {
    const token = crypto.randomBytes(32).toString('hex');
    userRepository.updateCalendarToken(userId, token);
    return token;
  },

  /**
   * Generate JWT access token (15 min)
   */
  generateToken(user: { id: number; username: string; role: string }): string {
    return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET!, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
  },

  /**
   * Generate refresh token (30 days)
   */
  generateRefreshToken(userId: number): string {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    // Only the hash is persisted; the raw token goes to the client cookie.
    refreshTokenRepository.create(hashToken(token), userId, expiresAt);
    return token;
  },

  /**
   * Revoke all tokens for a user (password change)
   */
  revokeAllUserTokens(userId: number): void {
    refreshTokenRepository.revokeAllForUser(userId);
  },

  /**
   * Cleanup expired tokens
   */
  cleanupExpiredTokens(): number {
    return refreshTokenRepository.cleanupExpired();
  },
};
