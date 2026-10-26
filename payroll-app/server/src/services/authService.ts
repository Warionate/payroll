/**
 * Auth Service - authentication and authorization business logic
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import db from '../db.js';
import { encrypt } from '../utils/crypto.js';
import { notifyNewUserRegistration, notifyRefreshTokenReuse } from '../utils/discord.js';
import { userRepository, type UserRow } from '../repositories/userRepository.js';
import {
  refreshTokenRepository,
  type RefreshTokenRow,
} from '../repositories/refreshTokenRepository.js';
import { rateRepository } from '../repositories/rateRepository.js';
import { authentikService } from './authentikService.js';
import { hashPassword, verifyPassword, needsRehash } from '../utils/password.js';
import { sessionRepository, type SessionRow } from '../repositories/sessionRepository.js';
import { recordSecurityEvent, type RequestContext } from '../utils/securityLog.js';
import { isPwnedPassword, PWNED_PASSWORD_MESSAGE } from '../utils/pwnedPasswords.js';
import {
  AuthenticationError,
  AuthorizationError,
  ErrorCodes,
  ValidationError,
} from '../utils/errors.js';
import { mailService } from './mailService.js';
import { mfaService } from './mfaService.js';
import { isStrongAmr } from './oidcService.js';
import { mfaRepository } from '../repositories/mfaRepository.js';
import { alertAdminGranted, alertAdminLogin } from '../utils/securityAlerts.js';
import { securityEventRepository } from '../repositories/securityEventRepository.js';
import type { AuthUser } from '../types/auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  logger.error('FATAL: JWT_SECRET must be set in .env and be at least 32 characters');
  process.exit(1);
}

// 「この端末では認証アプリのコードを求めない」の期間
export const MFA_TRUST_MS = 30 * 24 * 60 * 60 * 1000;

// ログイン（sessions）の有効期間。リフレッシュで入れ替わっても延びない（使い続けても 30 日で切れる）
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// 新規登録した人が最初の設定（メールの確認・二段階認証）を済ませる期限。過ぎたらアカウントごと消す
export const SETUP_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

// セキュリティの記録を残す期間
const SECURITY_EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export type SessionMethod = 'password' | 'totp' | 'passkey' | 'oidc' | 'register' | 'legacy';

// パスワードが合ったあと、認証アプリのコードを待つ間の目印（Cookie に入れる署名付きトークン）
const MFA_PENDING_AUDIENCE = 'mfa-pending';
const MFA_PENDING_TTL = '5m';

/**
 * 管理者はパスワードだけではログインさせない（パスキーか Authentik を使う）。
 * 締め出されたときの非常口として ADMIN_PASSWORD_LOGIN=allow で外せる。
 * テスト（NODE_ENV=test）では E2E が管理者をパスワードで作って入るので外す。
 */
function adminPasswordLoginAllowed(): boolean {
  return process.env.ADMIN_PASSWORD_LOGIN === 'allow' || process.env.NODE_ENV === 'test';
}

function deviceHash(deviceId: string): string {
  return crypto.createHash('sha256').update(`device:${deviceId}`).digest('hex');
}

function isSessionUsable(session: SessionRow | undefined): session is SessionRow {
  return Boolean(session && !session.revoked_at && new Date(session.expires_at) > new Date());
}

// 正常ローテーション直後の並行リフレッシュ競合を盗用と誤検知しないための猶予。
// この時間内に revoke 済みトークンが再利用されても全無効化せず再発行する。
// （盗用検知はこの猶予を過ぎた再利用に対しては従来どおり機能する）
const REFRESH_REUSE_GRACE_MS = 30_000;

// Precomputed Argon2id hash of a random string. When a login targets a
// non-existent username we still run one comparison against this hash
// so the response time does not reveal whether the username exists
// (timing-based user enumeration mitigation).
const DUMMY_PASSWORD_HASH = await hashPassword(crypto.randomBytes(32).toString('hex'));

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
    ctx: RequestContext = {},
  ): Promise<
    | { user: AuthUser; token: string; refreshToken: string }
    | { mfaPending: string; methods: { totp: boolean; passkey: boolean; oidc: boolean } }
    | null
  > {
    // ログイン欄はユーザー名とメールアドレスの両方を受ける。ユーザー名を先に探し、
    // 見つからず @ を含むときだけ確認済みのメールアドレスとして探す
    // ユーザー ID は小文字で持つ。大文字で打たれても通す（ルール導入前の ID は打たれたとおりで探す）
    const user =
      userRepository.findByUsername(username) ??
      userRepository.findByUsername(username.trim().toLowerCase()) ??
      (username.includes('@') ? userRepository.findByEmail(username) : undefined);
    if (!user) {
      // Equalize timing with the valid-username path to avoid leaking which
      // usernames exist. The result is intentionally ignored.
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      logger.warn(`Failed login attempt for username: ${username}`);
      return null;
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      logger.warn(`Failed login attempt for username: ${username}`);
      recordSecurityEvent(user.id, 'login_failed', ctx, 'password');
      return null;
    }

    // bcrypt 時代のハッシュ（や古いパラメータ）は、平文が手元にあるこの時点で作り直す
    if (needsRehash(user.password_hash)) {
      userRepository.updatePassword(user.id, await hashPassword(password));
      logger.info(`Password hash upgraded to Argon2id: user #${user.id}`);
    }

    // Authentik と連携済みなら、role の正は Authentik。パスワードでのログインでも確認しに行く。
    // Authentik に届かないとき（null）は DB の role を据え置く（ログインは止めない）。
    const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;

    // 認証アプリを登録している人は、コードの入力に進む（ここではまだログインさせない）。
    // ただし、前にコードを通して「この端末を記憶」した端末なら、期限まではコードを求めない
    if (
      mfaService.totpEnabled(user) &&
      ctx.deviceId &&
      sessionRepository.isDeviceTrusted(user.id, deviceHash(ctx.deviceId))
    ) {
      const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;
      const authUser: AuthUser = { id: user.id, username: user.username, role };
      logger.info(`User logged in on a trusted device: ${user.username}`);
      return { user: authUser, ...authService.startSession(authUser, 'totp', ctx) };
    }
    // 二つ目の手段を持つ人は、パスワードが合ったら二段階目（認証アプリのコード・パスキー・Authentik の
    // どれか）に進む。ここではまだログインさせない（パスワードだけでは入れない）
    const needsSecondStep = mfaService.enforced()
      ? mfaService.hasSecondFactor(user)
      : mfaService.totpEnabled(user);
    if (needsSecondStep) {
      const mfaPending = authService.issueMfaPending(user.id);
      return {
        mfaPending,
        methods: {
          totp: mfaService.totpEnabled(user),
          passkey: mfaRepository.countPasskeys(user.id) > 0,
          oidc: Boolean(user.oidc_sub),
        },
      };
    }

    // 管理者はパスワードが合っていても通さない（パスワードを当てられても全員の給与が見られないように）。
    // パスワードの照合の後で判定するので、この応答からパスワードの正誤は漏れるが、
    // 正しいパスワードを知っている相手にしか返らない
    if (role === 'admin' && !adminPasswordLoginAllowed()) {
      logger.warn(`Admin password-only login blocked: ${user.username}`);
      recordSecurityEvent(user.id, 'admin_mfa_blocked', ctx);
      throw new AuthorizationError(
        '管理者はパスキーか Authentik でログインしてください',
        ErrorCodes.AUTH_MFA_REQUIRED,
      );
    }

    const authUser: AuthUser = { id: user.id, username: user.username, role };
    logger.info(`User logged in: ${user.username}`);
    return { user: authUser, ...authService.startSession(authUser, 'password', ctx) };
  },

  /** パスワードが合ったあとの目印（mfa_pending）から利用者を取り出す。期限切れ・偽物なら 401 */
  pendingUserId(pendingToken: string | undefined): number {
    try {
      const payload = jwt.verify(pendingToken ?? '', JWT_SECRET!, {
        algorithms: ['HS256'],
        audience: MFA_PENDING_AUDIENCE,
      }) as { uid: number };
      return payload.uid;
    } catch {
      throw new AuthenticationError(
        'もう一度ユーザー名とパスワードから入力してください',
        ErrorCodes.AUTH_TOKEN_EXPIRED,
      );
    }
  },

  /** ログインの二段階目をパスキーで済ませた（passkeyService で本人のパスキーと確かめたあと） */
  async completeMfaPasskeyLogin(
    user: UserRow,
    ctx: RequestContext = {},
  ): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
    const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;
    const authUser: AuthUser = { id: user.id, username: user.username, role };
    logger.info(`User logged in with password + passkey: ${user.username}`);
    return { user: authUser, ...authService.startSession(authUser, 'passkey', ctx) };
  },

  /** 大事な操作の前の本人確認をパスキーで済ませた */
  markReauthenticated(userId: number, sessionId: string | undefined, ctx: RequestContext = {}) {
    if (!sessionId) throw new AuthenticationError('ログインし直してください');
    sessionRepository.markAuthenticated(sessionId);
    recordSecurityEvent(userId, 'reauth', ctx, 'passkey');
  },

  /**
   * ログインの二段階目。パスワードのあとに受け取った目印と、認証アプリのコード（または回復コード）で入る。
   * 合わなければ null
   */
  async completeMfaLogin(
    pendingToken: string | undefined,
    code: string,
    ctx: RequestContext = {},
    rememberDevice = false,
  ): Promise<{ user: AuthUser; token: string; refreshToken: string } | null> {
    const uid = authService.pendingUserId(pendingToken);
    const user = userRepository.findById(uid);
    if (!user) return null;
    const used = mfaService.verifyLoginCode(user, code);
    if (!used) {
      recordSecurityEvent(user.id, 'login_failed', ctx, 'totp');
      return null;
    }
    if (used === 'recovery') recordSecurityEvent(user.id, 'recovery_code_used', ctx);

    const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;
    const authUser: AuthUser = { id: user.id, username: user.username, role };
    logger.info(`User logged in with password + ${used}: ${user.username}`);
    // 先にログインを始める（初めての端末ならここで「新しい端末」のお知らせが出る）。そのあとで記憶する
    const session = authService.startSession(authUser, 'totp', ctx);
    // 回復コードで入ったとき（端末を失くした等）は記憶しない
    if (rememberDevice && used === 'totp' && ctx.deviceId) {
      sessionRepository.trustDevice(
        user.id,
        deviceHash(ctx.deviceId),
        new Date(Date.now() + MFA_TRUST_MS).toISOString(),
      );
      recordSecurityEvent(user.id, 'device_trusted', ctx);
    }
    return { user: authUser, ...session };
  },

  /**
   * ログインを1つ始める（sessions に1行）。端末の判定と記録もここでまとめて行う。
   * 返すのはアクセストークンとリフレッシュトークン。
   */
  startSession(
    user: AuthUser,
    method: SessionMethod,
    ctx: RequestContext = {},
  ): { token: string; refreshToken: string; sessionId: string } {
    const now = new Date();
    const sessionId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
    sessionRepository.create({
      id: sessionId,
      user_id: user.id,
      method,
      ip: ctx.ip ?? null,
      user_agent: ctx.userAgent ? ctx.userAgent.slice(0, 300) : null,
      created_at: now.toISOString(),
      last_used_at: now.toISOString(),
      authenticated_at: now.toISOString(),
      expires_at: expiresAt,
    });
    if (method !== 'legacy') {
      recordSecurityEvent(user.id, 'login', ctx, method);
      authService.checkDevice(user, ctx);
      if (user.role === 'admin') alertAdminLogin(user, method, ctx);
    }
    return {
      token: authService.generateToken(user, sessionId),
      refreshToken: authService.generateRefreshToken(user.id, sessionId, expiresAt),
      sessionId,
    };
  },

  /**
   * 端末 Cookie を見て、初めての端末からのログインならメールで知らせる。
   * 端末の記録が1件も無い利用者（この仕組みを入れる前からの利用者・新規登録直後）は、黙って記録だけする
   */
  checkDevice(user: AuthUser, ctx: RequestContext): void {
    if (!ctx.deviceId) return;
    try {
      const first = sessionRepository.countDevices(user.id) === 0;
      const isNew = sessionRepository.rememberDevice(user.id, deviceHash(ctx.deviceId));
      if (!isNew || first) return;
      recordSecurityEvent(user.id, 'new_device', ctx);
      const email = userRepository.findById(user.id)?.email;
      if (email && mailService.isEnabled()) {
        const when = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        void mailService
          .send(
            email,
            '新しい端末からログインがありました',
            [
              `${user.username} さん`,
              '',
              'これまでに使われていない端末から、あなたのアカウントにログインがありました。',
              '',
              `日時: ${when}`,
              `IP アドレス: ${ctx.ip ?? '不明'}`,
              `ブラウザ: ${ctx.userAgent ?? '不明'}`,
              '',
              'ご自身のログインであれば、このメールは無視してください。',
              '心当たりがない場合は、すぐにパスワードを変更し、設定画面の「ログイン中の端末」から',
              '覚えのない端末をログアウトさせてください。',
            ].join('\n'),
          )
          .catch((err: Error) =>
            logger.warn('New device mail failed', { userId: user.id, error: err.message }),
          );
      }
    } catch (err) {
      logger.warn('Device check failed', { userId: user.id, error: (err as Error).message });
    }
  },

  /** ログイン中の端末の一覧（本人分）。current は今のリクエストのログイン */
  listSessions(userId: number, currentSessionId: string | undefined) {
    return sessionRepository.listActive(userId).map((s) => ({
      id: s.id,
      method: s.method,
      ip: s.ip,
      user_agent: s.user_agent,
      created_at: s.created_at,
      last_used_at: s.last_used_at,
      expires_at: s.expires_at,
      current: s.id === currentSessionId,
    }));
  },

  /** 本人のログインを1つ切る。本人のものでなければ false */
  revokeSession(userId: number, sessionId: string, ctx: RequestContext = {}): boolean {
    const session = sessionRepository.findById(sessionId);
    if (!session || session.user_id !== userId || session.revoked_at) return false;
    sessionRepository.revoke(sessionId);
    recordSecurityEvent(userId, 'session_revoked', ctx, session.user_agent ?? undefined);
    return true;
  },

  /** 今のログイン以外を全部切る */
  revokeOtherSessions(userId: number, currentSessionId: string, ctx: RequestContext = {}): void {
    sessionRepository.revokeAllForUser(userId, currentSessionId);
    recordSecurityEvent(userId, 'session_revoked', ctx, 'others');
  },

  /**
   * 大事な操作の前の本人確認。パスワードが合えば、今のログインの「本人確認した時刻」を更新する
   */
  async reauthenticate(
    userId: number,
    sessionId: string | undefined,
    password: string,
    ctx: RequestContext = {},
  ): Promise<void> {
    const user = userRepository.findById(userId);
    if (!user || !sessionId) throw new AuthenticationError('ログインし直してください');
    if (!(await verifyPassword(password, user.password_hash))) {
      recordSecurityEvent(userId, 'reauth_failed', ctx);
      throw new AuthenticationError(
        'パスワードが間違っています',
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
      );
    }
    sessionRepository.markAuthenticated(sessionId);
    recordSecurityEvent(userId, 'reauth', ctx);
  },

  /** 新しいパスワードが漏洩済みなら ValidationError */
  async assertNotPwned(password: string): Promise<void> {
    if (await isPwnedPassword(password)) {
      throw new ValidationError(PWNED_PASSWORD_MESSAGE, { field: 'password' });
    }
  },

  /**
   * パスワード以外（パスキー）で本人確認が済んだ利用者にログインのトークンを発行する。
   * Authentik 連携済みなら、パスワードのときと同じく role を Authentik に合わせる。
   */
  async issueSession(
    user: {
      id: number;
      username: string;
      role: 'user' | 'admin';
      oidc_sub: string | null;
    },
    ctx: RequestContext = {},
  ): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
    const role = user.oidc_sub ? await authService.syncRoleFromAuthentik(user) : user.role;
    const authUser: AuthUser = { id: user.id, username: user.username, role };
    return { user: authUser, ...authService.startSession(authUser, 'passkey', ctx) };
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
    recordSecurityEvent(user.id, 'role_changed', {}, `${user.role} -> ${role} (Authentik)`);
    if (role === 'admin') alertAdminGranted(user, 'Authentik の管理者グループ');
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
    ctx: RequestContext = {},
    amr: string[] = ['mfa'],
  ):
    | { user: AuthUser; token: string; refreshToken: string }
    | { mfaPending: string; methods: { totp: boolean; passkey: boolean; oidc: boolean } }
    | null {
    const user = userRepository.findByOidcSub(sub);
    if (!user) {
      logger.warn(`OIDC login for unlinked sub: ${sub}`);
      return null;
    }
    const role = adminGroup
      ? authService.applyRole(user, groups.includes(adminGroup) ? 'admin' : 'user')
      : user.role;

    // Authentik の二段階は任意。二段階を済ませたログインかどうかを覚え、Authentik 連携を
    // 二段階の手段として数えるかに使う
    const strong = isStrongAmr(amr);
    userRepository.setOidcMfaAt(user.id, strong ? new Date().toISOString() : null);

    // Authentik でパスワードだけだった人は、payroll のパスキーか認証アプリでもう一段階確認する。
    // どちらも無い人はそのまま入れるが、最初の設定で二段階の登録を求められる
    if (!strong && mfaService.enforced()) {
      const methods = {
        totp: mfaService.totpEnabled(user),
        passkey: mfaRepository.countPasskeys(user.id) > 0,
        oidc: false,
      };
      if (methods.totp || methods.passkey) {
        logger.info(`OIDC login without MFA; asking for a second factor: ${user.username}`);
        return { mfaPending: authService.issueMfaPending(user.id), methods };
      }
    }

    const authUser: AuthUser = { id: user.id, username: user.username, role };
    logger.info(`User logged in via OIDC: ${user.username} (amr=${amr.join('+') || '-'})`);
    return { user: authUser, ...authService.startSession(authUser, 'oidc', ctx) };
  },

  /** 直近（10 分以内）に本人確認したログインか */
  isRecentlyAuthenticated(sessionId: string | undefined): boolean {
    const session = sessionId ? sessionRepository.findById(sessionId) : undefined;
    return Boolean(
      session && Date.now() - new Date(session.authenticated_at).getTime() <= 10 * 60 * 1000,
    );
  },

  /** パスワード（または二段階なしの Authentik）のあとの目印を作る。5 分だけ有効 */
  issueMfaPending(userId: number): string {
    return jwt.sign({ uid: userId }, JWT_SECRET!, {
      algorithm: 'HS256',
      audience: MFA_PENDING_AUDIENCE,
      expiresIn: MFA_PENDING_TTL,
    });
  },

  /** 目印の人が使える二段階目の手段（Authentik でログインし直す、は含めない） */
  pendingMethods(userId: number): { totp: boolean; passkey: boolean; oidc: boolean } {
    const user = userRepository.findById(userId);
    return {
      totp: user ? mfaService.totpEnabled(user) : false,
      passkey: user ? mfaRepository.countPasskeys(user.id) > 0 : false,
      oidc: Boolean(user?.oidc_sub),
    };
  },

  /**
   * 大事な操作の前の本人確認を、Authentik でログインし直して済ませた。
   * 紐づけている本人の Authentik アカウントであることを確かめる
   */
  completeOidcReauth(
    userId: number | null,
    sessionId: string | null,
    sub: string,
    amr: string[],
  ): boolean {
    const user = userId ? userRepository.findById(userId) : undefined;
    if (!user || !sessionId || user.oidc_sub !== sub) return false;
    const session = sessionRepository.findById(sessionId);
    if (!session || session.user_id !== user.id || session.revoked_at) return false;
    sessionRepository.markAuthenticated(sessionId);
    if (isStrongAmr(amr)) userRepository.setOidcMfaAt(user.id, new Date().toISOString());
    recordSecurityEvent(user.id, 'reauth', {}, 'oidc');
    return true;
  },

  /**
   * ログイン中の本人に Authentik を紐づける。
   * 紐づけた瞬間はアプリ側の role を Authentik に書く（逆にすると、アプリで admin の人が
   * 連携した瞬間に admin を失う）。以後の正は Authentik。
   * Authentik への書き込みに失敗したら紐づけない。
   */
  async linkOidc(
    userId: number,
    sub: string,
    ctx: RequestContext = {},
    amr: string[] = [],
  ): Promise<'linked' | 'taken' | 'no_user'> {
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
    userRepository.setOidcMfaAt(userId, isStrongAmr(amr) ? new Date().toISOString() : null);
    recordSecurityEvent(userId, 'oidc_linked', ctx);
    logger.info(`OIDC linked: ${user.username} (sub=${sub})`);
    return 'linked';
  },

  /** 連携を解除する。解除後はアプリ側の role が正に戻る（Authentik のグループには触らない） */
  unlinkOidc(userId: number, ctx: RequestContext = {}): void {
    mfaService.assertKeepsSecondFactor(userId, 'oidc');
    userRepository.setOidcSub(userId, null);
    userRepository.setOidcMfaAt(userId, null);
    recordSecurityEvent(userId, 'oidc_unlinked', ctx);
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
    ctx: RequestContext = {},
    displayName?: string,
  ): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
    await authService.assertNotPwned(password);
    const hash = await hashPassword(password);
    const calendarToken = crypto.randomBytes(32).toString('hex');

    const registerTransaction = db.transaction(() => {
      const userId = userRepository.create(username, hash, calendarToken, displayName || username);

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
    // 強制しない環境（テスト等）では期限を付けない
    if (mfaService.enforced()) {
      userRepository.setSetupDeadline(
        Number(userId),
        new Date(Date.now() + SETUP_DEADLINE_MS).toISOString(),
      );
    }
    logger.info(`New user registered: ${username}`);
    notifyNewUserRegistration(username, userId);

    const numericId = typeof userId === 'bigint' ? Number(userId) : userId;
    const authUser: AuthUser = { id: numericId, username, role: 'user' };
    return { user: authUser, ...authService.startSession(authUser, 'register', ctx) };
  },

  /**
   * Logout - revoke refresh token
   */
  logout(refreshToken: string | undefined): void {
    if (refreshToken) {
      const row = findStoredToken(refreshToken);
      if (row) {
        refreshTokenRepository.revoke(row.token);
        if (row.session_id) sessionRepository.revoke(row.session_id);
      }
    }
  },

  /**
   * Refresh access token using refresh token
   */
  refresh(
    oldRefreshToken: string,
    ctx: RequestContext = {},
  ): { token: string; refreshToken: string; user: AuthUser } | null {
    const row = findStoredToken(oldRefreshToken);
    if (!row) return null;

    // ログイン（sessions）が切られた・30 日を過ぎたなら、トークンが生きていても通さない
    const session = row.session_id ? sessionRepository.findById(row.session_id) : undefined;
    if (row.session_id && !isSessionUsable(session)) {
      refreshTokenRepository.revoke(row.token);
      return null;
    }

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
        return { ...authService.continueSession(authUser, session, ctx), user: authUser };
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
    return { ...authService.continueSession(authUser, session, ctx), user: authUser };
  },

  /**
   * リフレッシュで同じログインを続ける。期限はログインしたときのまま。
   * sessions を入れる前に発行されたトークン（session が無い）は、ここで新しいログインとして登録する
   */
  continueSession(
    user: AuthUser,
    session: SessionRow | undefined,
    ctx: RequestContext,
  ): { token: string; refreshToken: string } {
    if (!session) {
      const started = authService.startSession(user, 'legacy', ctx);
      return { token: started.token, refreshToken: started.refreshToken };
    }
    sessionRepository.touch(session.id, ctx.ip ?? session.ip, ctx.userAgent ?? session.user_agent);
    return {
      token: authService.generateToken(user, session.id),
      refreshToken: authService.generateRefreshToken(user.id, session.id, session.expires_at),
    };
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
  generateToken(user: { id: number; username: string; role: string }, sessionId: string): string {
    return jwt.sign(
      { id: user.id, username: user.username, role: user.role, sid: sessionId },
      JWT_SECRET!,
      {
        algorithm: 'HS256',
        expiresIn: '15m',
      },
    );
  },

  /**
   * Generate refresh token. 期限はログイン（sessions）の期限と同じ
   */
  generateRefreshToken(userId: number, sessionId: string, expiresAt: string): string {
    const token = crypto.randomBytes(64).toString('hex');
    // Only the hash is persisted; the raw token goes to the client cookie.
    refreshTokenRepository.create(hashToken(token), userId, expiresAt, sessionId);
    return token;
  },

  /**
   * Revoke all tokens for a user (password change). ログイン（sessions）もすべて切る
   */
  revokeAllUserTokens(userId: number): void {
    sessionRepository.revokeAllForUser(userId);
    // パスワード変更・再設定・二段階のリセットでは、記憶した端末も解除する
    sessionRepository.clearTrustedDevices(userId);
    refreshTokenRepository.revokeAllForUser(userId);
  },

  /**
   * Cleanup expired tokens
   */
  cleanupExpiredTokens(): number {
    // 終わったログイン（30 日経過）とセキュリティの記録（180 日経過）もここで片付ける
    sessionRepository.cleanup();
    securityEventRepository.deleteOlderThan(
      new Date(Date.now() - SECURITY_EVENT_RETENTION_MS).toISOString(),
    );
    return refreshTokenRepository.cleanupExpired();
  },
};
