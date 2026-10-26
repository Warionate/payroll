/**
 * Auth Controller - handles HTTP request/response for authentication
 */
import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.js';
import { oidcService } from '../services/oidcService.js';
import { passkeyService, PasskeyError } from '../services/passkeyService.js';
import { emailService, EmailError } from '../services/emailService.js';
import { userRepository } from '../repositories/userRepository.js';
import { mfaService, MfaError } from '../services/mfaService.js';
import type { AuthUser } from '../types/auth.js';
import logger from '../utils/logger.js';
import crypto from 'node:crypto';
import { securityEventRepository } from '../repositories/securityEventRepository.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { recordSecurityEvent, type RequestContext } from '../utils/securityLog.js';

const cookieOptions = (isProduction: boolean) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ('strict' as const) : ('lax' as const),
});

function setAuthCookies(res: Response, token: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    ...cookieOptions(isProduction),
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions(isProduction),
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

// 端末を見分ける Cookie（ランダムな値。DB にはハッシュだけを置く）。初めての端末からのログインを知らせるのに使う
const DEVICE_COOKIE = 'device_id';
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60 * 1000;

function deviceId(req: Request, res: Response): string {
  const existing = req.cookies?.[DEVICE_COOKIE];
  if (typeof existing === 'string' && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const id = crypto.randomBytes(32).toString('hex');
  res.cookie(DEVICE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Authentik からの戻り（別サイトからの遷移）でも届くように Lax
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  return id;
}

/** 記録用のリクエスト情報。ログインを始める経路では端末 Cookie も読む（無ければ発行する） */
function requestContext(req: Request, res?: Response): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    deviceId: res ? deviceId(req, res) : null,
  };
}

/** 画面に返す利用者情報に「済ませていない最初の設定」を足す（画面はこれを見て設定画面を出す） */
function withSetup(user: AuthUser) {
  const row = userRepository.findById(user.id);
  return {
    ...user,
    // トークンの中の値は古いことがある（ユーザー ID を変えた直後）。DB の値を返す
    username: row?.username ?? user.username,
    display_name: row?.display_name ?? row?.username ?? user.username,
    setup: mfaService.setupStatus(row),
  };
}

// パスワードが合ったあと、認証アプリのコードを待つ間の目印
const MFA_PENDING_COOKIE = 'mfa_pending';
// 二段階目の入口（/api/auth/login/totp・/api/auth/login/passkey/*）に届くように /api/auth にする
const MFA_PENDING_PATH = '/api/auth';

// Authentik へ送り出すときに state を入れる Cookie。コールバックで URL の state と突き合わせ、
// 「このブラウザで始めた」ことを確かめる（他人に URL を踏ませて紐づけさせる攻撃を防ぐ）。
// コールバックは Authentik からの遷移なので Strict では届かない。Lax にする。
const OIDC_STATE_COOKIE = 'oidc_state';
const OIDC_COOKIE_PATH = '/api/auth/oidc';

function setOidcStateCookie(res: Response, state: string) {
  res.cookie(OIDC_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: OIDC_COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
  });
}

// パスキーの登録・ログインの途中状態（challenge）の ID。本体は DB にあり、ここには ID だけを持たせる
const PASSKEY_CHALLENGE_COOKIE = 'passkey_challenge';
// パスキーの確認は /api/auth/passkey/* のほか、二段階目（/api/auth/login/passkey/*）と
// 本人確認（/api/auth/reauth/passkey/*）でも使うので /api/auth にする
const PASSKEY_COOKIE_PATH = '/api/auth';

function setPasskeyChallengeCookie(res: Response, id: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(PASSKEY_CHALLENGE_COOKIE, id, {
    ...cookieOptions(isProduction),
    path: PASSKEY_COOKIE_PATH,
    maxAge: 5 * 60 * 1000,
  });
}

function takePasskeyChallengeCookie(req: Request, res: Response): string | undefined {
  const id = req.cookies?.[PASSKEY_CHALLENGE_COOKIE];
  res.clearCookie(PASSKEY_CHALLENGE_COOKIE, { path: PASSKEY_COOKIE_PATH });
  return id;
}

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    const { username, password } = req.body;
    try {
      const result = await authService.login(username, password, requestContext(req, res));
      if (!result) {
        logger.warn(`Failed login attempt for username: ${username}`);
        res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています' });
        return;
      }
      if ('mfaPending' in result) {
        res.cookie(MFA_PENDING_COOKIE, result.mfaPending, {
          ...cookieOptions(process.env.NODE_ENV === 'production'),
          path: MFA_PENDING_PATH,
          maxAge: 5 * 60 * 1000,
        });
        // 使える二段階目の手段（サーバ側で無効な手段は出さない）
        const methods = [
          result.methods.totp && 'totp',
          result.methods.passkey && passkeyService.isEnabled() && 'passkey',
          result.methods.oidc && oidcService.isEnabled() && 'oidc',
        ].filter(Boolean) as string[];
        res.json({ mfaRequired: methods[0] ?? 'totp', methods });
        return;
      }

      setAuthCookies(res, result.token, result.refreshToken);
      res.json({ user: withSetup(result.user) });
    } catch (err) {
      next(err);
    }
  },

  /** ログインの二段階目（認証アプリのコード・回復コード） */
  async loginTotp(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.completeMfaLogin(
        req.cookies?.[MFA_PENDING_COOKIE],
        String(req.body?.code ?? ''),
        requestContext(req, res),
        req.body?.remember === true,
      );
      if (!result) {
        res.status(401).json({ error: 'コードが違います' });
        return;
      }
      res.clearCookie(MFA_PENDING_COOKIE, { path: MFA_PENDING_PATH });
      setAuthCookies(res, result.token, result.refreshToken);
      res.json({ user: withSetup(result.user) });
    } catch (err) {
      next(err);
    }
  },

  logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    authService.logout(refreshToken);
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  },

  refresh(req: Request, res: Response) {
    const oldRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!oldRefreshToken) {
      res.status(401).json({ error: 'リフレッシュトークンが必要です' });
      return;
    }

    const result = authService.refresh(oldRefreshToken, requestContext(req));
    if (!result) {
      res.clearCookie('token');
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(401).json({ error: 'リフレッシュトークンが無効または期限切れです' });
      return;
    }

    setAuthCookies(res, result.token, result.refreshToken);
    // Include the user so a cold PWA start can skip the extra /me round-trip
    // after a refresh (B-1). Older clients simply ignore the added field.
    res.json({ message: 'Token refreshed', user: withSetup(result.user) });
  },

  async register(req: Request, res: Response, next: NextFunction) {
    const { username, password, rates, email, display_name } = req.body;
    // メール送信が有効な環境では、登録時にメールアドレスも必須にする
    if (emailService.isEnabled() && !email) {
      res.status(400).json({ error: 'メールアドレスは必須です' });
      return;
    }
    try {
      const result = await authService.register(
        username,
        password,
        rates,
        requestContext(req, res),
        display_name,
      );
      setAuthCookies(res, result.token, result.refreshToken);

      // 確認メールを送る。失敗してもアカウントは作成済みのまま（設定画面から送り直せる）
      let emailVerificationSent = false;
      if (email && emailService.isEnabled()) {
        try {
          await emailService.requestVerification(result.user.id, email);
          emailVerificationSent = true;
        } catch (err) {
          logger.warn('Verification mail at registration failed', {
            userId: result.user.id,
            error: (err as Error).message,
          });
        }
      }
      res.json({ user: withSetup(result.user), emailVerificationSent });
    } catch (err) {
      const error = err as Error;
      if (
        error.message.includes('UNIQUE constraint failed') ||
        error.message.includes('already exists')
      ) {
        logger.warn(`Registration failed: Username ${username} already exists`);
        res.status(400).json({ error: 'このユーザーIDは既に使われています' });
        return;
      }
      if (error.message === 'Incomplete rate data provided.') {
        res.status(400).json({ error: error.message });
        return;
      }
      next(err);
    }
  },

  me(req: Request, res: Response) {
    const { id, username, role } = req.user!;
    res.json(withSetup({ id, username, role }));
  },

  getCalendarToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = authService.getOrCreateCalendarToken(req.user!.id);
      if (!token) {
        res.status(404).json({ error: 'ユーザーが見つかりません' });
        return;
      }
      res.json({ token });
    } catch (err) {
      next(err);
    }
  },

  resetCalendarToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = authService.resetCalendarToken(req.user!.id);
      res.json({ token });
    } catch (err) {
      next(err);
    }
  },

  /** ログイン画面が「Authentik でログイン」ボタンを出すかどうか */
  oidcConfig(_req: Request, res: Response) {
    res.json({ enabled: oidcService.isEnabled() });
  },

  /** 設定画面用: 連携の有無 */
  oidcStatus(req: Request, res: Response) {
    const user = userRepository.findById(req.user!.id);
    res.json({ enabled: oidcService.isEnabled(), linked: Boolean(user?.oidc_sub) });
  },

  /** Authentik でのログインを始める（紐づけ済みのアカウントだけが通る） */
  async oidcLogin(_req: Request, res: Response, next: NextFunction) {
    if (!oidcService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { url, state } = await oidcService.start('login', null);
      setOidcStateCookie(res, state);
      res.redirect(url);
    } catch (err) {
      logger.error('OIDC login start failed', { error: (err as Error).message });
      next(err);
    }
  },

  /** ログイン中の本人が Authentik との連携を始める。遷移先の URL を返す */
  async oidcLinkStart(req: Request, res: Response, next: NextFunction) {
    if (!oidcService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { url, state } = await oidcService.start('link', req.user!.id);
      setOidcStateCookie(res, state);
      res.json({ url });
    } catch (err) {
      logger.error('OIDC link start failed', { error: (err as Error).message });
      next(err);
    }
  },

  oidcUnlink(req: Request, res: Response) {
    authService.unlinkOidc(req.user!.id, requestContext(req));
    res.json({ linked: false });
  },

  /**
   * Authentik からの戻り先。結果は画面へのリダイレクトとクエリで返す。
   * ここで発行するログイン Cookie は Strict だが、Set-Cookie は別サイトからの遷移でも効く。
   */
  async oidcCallback(req: Request, res: Response) {
    const browserState = req.cookies?.[OIDC_STATE_COOKIE];
    res.clearCookie(OIDC_STATE_COOKIE, { path: OIDC_COOKIE_PATH });
    if (!oidcService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const query = req.originalUrl.split('?')[1] ?? '';

    // Authentik がエラーを返した。access_denied（アプリへのアクセス権が無い）だけを「拒否」と見せ、
    // それ以外（プロバイダ設定の誤りなど）は「失敗」にする。理由はログに残す
    const oidcError = new URLSearchParams(query).get('error');
    if (oidcError) {
      logger.warn('OIDC callback returned an error', {
        error: oidcError,
        description: req.query.error_description,
      });
      res.redirect(`/login?oidc_error=${oidcError === 'access_denied' ? 'denied' : 'failed'}`);
      return;
    }

    let result;
    try {
      result = await oidcService.finish(query, browserState);
    } catch (err) {
      logger.warn('OIDC callback rejected', { error: (err as Error).message });
      res.redirect('/login?oidc_error=failed');
      return;
    }

    if (result.purpose === 'link') {
      try {
        const outcome = await authService.linkOidc(
          result.userId!,
          result.sub,
          requestContext(req),
          result.amr,
        );
        res.redirect(`/settings/security?oidc=${outcome === 'linked' ? 'linked' : 'taken'}`);
      } catch (err) {
        logger.error('OIDC link failed', { error: (err as Error).message });
        res.redirect('/settings/security?oidc=failed');
      }
      return;
    }

    // 大事な操作の前の本人確認（小さなウィンドウで開いている）。結果の画面はウィンドウを閉じる
    if (result.purpose === 'reauth') {
      const ok = authService.completeOidcReauth(
        result.userId,
        result.sessionId,
        result.sub,
        result.amr,
      );
      res.redirect(`/reauth-complete?result=${ok ? 'ok' : 'mismatch'}`);
      return;
    }

    const login = authService.loginWithOidc(
      result.sub,
      result.groups,
      oidcService.adminGroupName(),
      requestContext(req, res),
      result.amr,
    );
    if (!login) {
      res.redirect('/login?oidc_error=not_linked');
      return;
    }
    // Authentik でパスワードだけだった人は、ログイン画面の二段階目（パスキー・認証アプリ）に進める
    if ('mfaPending' in login) {
      res.cookie(MFA_PENDING_COOKIE, login.mfaPending, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // Authentik からの遷移で付ける Cookie。次のログイン画面からの API 呼び出しで届けばよい
        sameSite: 'lax',
        path: MFA_PENDING_PATH,
        maxAge: 5 * 60 * 1000,
      });
      res.redirect('/login?second=1');
      return;
    }
    setAuthCookies(res, login.token, login.refreshToken);
    res.redirect('/');
  },

  passkeyConfig(_req: Request, res: Response) {
    res.json({ enabled: passkeyService.isEnabled() });
  },

  async passkeyRegisterOptions(req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { options, challengeId } = await passkeyService.registrationOptions(req.user!);
      setPasskeyChallengeCookie(res, challengeId);
      res.json(options);
    } catch (err) {
      if (err instanceof PasskeyError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },

  async passkeyRegisterVerify(req: Request, res: Response) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const challengeId = takePasskeyChallengeCookie(req, res);
    const { response, name } = req.body ?? {};
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'パスキーの応答がありません' });
      return;
    }
    try {
      await passkeyService.verifyRegistration(
        req.user!.id,
        challengeId,
        response,
        typeof name === 'string' ? name : '',
      );
      recordSecurityEvent(req.user!.id, 'passkey_added', requestContext(req));
      res.json({ registered: true });
    } catch (err) {
      if (err instanceof PasskeyError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.warn('Passkey registration failed', { error: (err as Error).message });
      res.status(400).json({ error: 'パスキーを登録できませんでした' });
    }
  },

  async passkeyLoginOptions(_req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { options, challengeId } = await passkeyService.authenticationOptions();
      setPasskeyChallengeCookie(res, challengeId);
      res.json(options);
    } catch (err) {
      next(err);
    }
  },

  async passkeyLoginVerify(req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const challengeId = takePasskeyChallengeCookie(req, res);
    const { response } = req.body ?? {};
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'パスキーの応答がありません' });
      return;
    }
    let user;
    try {
      user = await passkeyService.verifyAuthentication(challengeId, response);
    } catch (err) {
      const message =
        err instanceof PasskeyError ? err.message : 'パスキーでログインできませんでした';
      logger.warn('Passkey login failed', { error: (err as Error).message });
      res.status(401).json({ error: message });
      return;
    }
    try {
      const result = await authService.issueSession(user, requestContext(req, res));
      setAuthCookies(res, result.token, result.refreshToken);
      res.json({ user: withSetup(result.user) });
    } catch (err) {
      next(err);
    }
  },

  passkeyList(req: Request, res: Response) {
    res.json({ passkeys: passkeyService.list(req.user!.id) });
  },

  passkeyDelete(req: Request, res: Response) {
    const id = String(req.params.id);
    if (passkeyService.list(req.user!.id).some((p) => p.id === id)) {
      mfaService.assertKeepsSecondFactor(req.user!.id, 'passkey');
    }
    const removed = passkeyService.remove(req.user!.id, String(req.params.id));
    if (!removed) {
      res.status(404).json({ error: 'パスキーが見つかりません' });
      return;
    }
    recordSecurityEvent(req.user!.id, 'passkey_removed', requestContext(req));
    res.json({ removed: true });
  },

  // --- メールアドレス（確認・パスワード再設定） ---

  emailConfig(_req: Request, res: Response) {
    res.json({ enabled: emailService.isEnabled() });
  },

  emailStatus(req: Request, res: Response) {
    res.json({ enabled: emailService.isEnabled(), ...emailService.status(req.user!.id) });
  },

  async emailRequestVerification(req: Request, res: Response) {
    if (!emailService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      await emailService.requestVerification(req.user!.id, String(req.body?.email ?? ''));
      res.json({ sent: true });
    } catch (err) {
      if (err instanceof EmailError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.error('Verification mail failed', { error: (err as Error).message });
      res
        .status(502)
        .json({ error: '確認メールを送れませんでした。しばらくしてからお試しください' });
    }
  },

  emailConfirm(req: Request, res: Response) {
    if (!emailService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const email = emailService.confirmVerification(String(req.body?.token ?? ''));
      res.json({ email });
    } catch (err) {
      const message =
        err instanceof EmailError ? err.message : 'メールアドレスを確認できませんでした';
      res.status(400).json({ error: message });
    }
  },

  emailRemove(req: Request, res: Response) {
    emailService.removeEmail(req.user!.id);
    recordSecurityEvent(req.user!.id, 'email_removed', requestContext(req));
    res.json({ email: null });
  },

  /** 登録の有無にかかわらず同じ応答を返す（アドレスが登録されているかを探られないようにする） */
  async passwordForgot(req: Request, res: Response) {
    if (!emailService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      await emailService.requestPasswordReset(String(req.body?.email ?? ''));
    } catch (err) {
      logger.error('Password reset mail failed', { error: (err as Error).message });
    }
    res.json({
      message: '登録されているアドレスであれば、再設定のメールを送りました',
    });
  },

  async passwordReset(req: Request, res: Response, next: NextFunction) {
    if (!emailService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      await emailService.resetPassword(String(req.body?.token ?? ''), String(req.body?.password));
      res.json({ reset: true });
    } catch (err) {
      if (err instanceof EmailError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },

  // --- ログイン中の端末・本人確認・記録 ---

  sessionList(req: Request, res: Response) {
    res.json({ sessions: authService.listSessions(req.user!.id, req.sessionId) });
  },

  sessionRevoke(req: Request, res: Response) {
    const ok = authService.revokeSession(req.user!.id, String(req.params.id), requestContext(req));
    if (!ok) {
      res.status(404).json({ error: 'ログインが見つかりません' });
      return;
    }
    res.json({ revoked: true });
  },

  sessionRevokeOthers(req: Request, res: Response) {
    if (!req.sessionId) {
      res.status(400).json({ error: 'ログインし直してから操作してください' });
      return;
    }
    authService.revokeOtherSessions(req.user!.id, req.sessionId, requestContext(req));
    res.json({ revoked: true });
  },

  async reauth(req: Request, res: Response, next: NextFunction) {
    try {
      await authService.reauthenticate(
        req.user!.id,
        req.sessionId,
        String(req.body?.password ?? ''),
        requestContext(req),
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  securityEvents(req: Request, res: Response) {
    const events = securityEventRepository.listByUser(req.user!.id, 100).map((e) => ({
      id: e.id,
      type: e.type,
      ip: e.ip,
      user_agent: e.user_agent,
      detail: e.detail,
      created_at: e.created_at,
    }));
    res.json({ events });
  },

  // --- 認証アプリ（TOTP）・回復コード ---

  mfaStatus(req: Request, res: Response) {
    res.json({
      ...mfaService.status(req.user!.id),
      setup: mfaService.setupStatusById(req.user!.id),
    });
  },

  totpSetup(req: Request, res: Response) {
    try {
      res.json(mfaService.beginTotp(req.user!.id));
    } catch (err) {
      if (err instanceof MfaError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  },

  totpConfirm(req: Request, res: Response) {
    try {
      const recoveryCodes = mfaService.confirmTotp(
        req.user!.id,
        String(req.body?.code ?? ''),
        requestContext(req),
      );
      res.json({ recoveryCodes });
    } catch (err) {
      if (err instanceof MfaError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  },

  totpDisable(req: Request, res: Response) {
    mfaService.disableTotp(req.user!.id, requestContext(req));
    res.json({ totp: false });
  },

  /** 「コードを求めない」と記憶した端末をすべて解除する */
  trustedDevicesClear(req: Request, res: Response) {
    sessionRepository.clearTrustedDevices(req.user!.id);
    recordSecurityEvent(req.user!.id, 'trusted_devices_cleared', requestContext(req));
    res.json({ trustedDevices: 0 });
  },

  recoveryCodesRegenerate(req: Request, res: Response) {
    if (!mfaService.status(req.user!.id).totp) {
      res.status(400).json({ error: '先に認証アプリを登録してください' });
      return;
    }
    res.json({
      recoveryCodes: mfaService.regenerateRecoveryCodes(req.user!.id, requestContext(req)),
    });
  },

  // --- パスワードのあとの二段階目・大事な操作の前の本人確認をパスキーで ---

  async loginPasskeyOptions(req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const uid = authService.pendingUserId(req.cookies?.[MFA_PENDING_COOKIE]);
      const { options, challengeId } = await passkeyService.authenticationOptions(uid, 'login');
      setPasskeyChallengeCookie(res, challengeId);
      res.json(options);
    } catch (err) {
      if (err instanceof PasskeyError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },

  async loginPasskeyVerify(req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const challengeId = takePasskeyChallengeCookie(req, res);
    try {
      const uid = authService.pendingUserId(req.cookies?.[MFA_PENDING_COOKIE]);
      let user;
      try {
        user = await passkeyService.verifyAuthentication(challengeId, req.body?.response, {
          purpose: 'login',
          userId: uid,
        });
      } catch (err) {
        recordSecurityEvent(uid, 'login_failed', requestContext(req), 'passkey');
        const message =
          err instanceof PasskeyError ? err.message : 'パスキーを確認できませんでした';
        res.status(401).json({ error: message });
        return;
      }
      const result = await authService.completeMfaPasskeyLogin(user, requestContext(req, res));
      res.clearCookie(MFA_PENDING_COOKIE, { path: MFA_PENDING_PATH });
      setAuthCookies(res, result.token, result.refreshToken);
      res.json({ user: withSetup(result.user) });
    } catch (err) {
      next(err);
    }
  },

  async reauthPasskeyOptions(req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { options, challengeId } = await passkeyService.authenticationOptions(
        req.user!.id,
        'reauth',
      );
      setPasskeyChallengeCookie(res, challengeId);
      res.json(options);
    } catch (err) {
      if (err instanceof PasskeyError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },

  async reauthPasskeyVerify(req: Request, res: Response, next: NextFunction) {
    if (!passkeyService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const challengeId = takePasskeyChallengeCookie(req, res);
    try {
      await passkeyService.verifyAuthentication(challengeId, req.body?.response, {
        purpose: 'reauth',
        userId: req.user!.id,
      });
    } catch (err) {
      recordSecurityEvent(req.user!.id, 'reauth_failed', requestContext(req), 'passkey');
      const message = err instanceof PasskeyError ? err.message : 'パスキーを確認できませんでした';
      res.status(401).json({ error: message });
      return;
    }
    try {
      authService.markReauthenticated(req.user!.id, req.sessionId, requestContext(req));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  /** 二段階目の画面を開き直したとき（Authentik から戻ってきた等）に、使える手段を返す */
  loginPending(req: Request, res: Response, next: NextFunction) {
    try {
      const uid = authService.pendingUserId(req.cookies?.[MFA_PENDING_COOKIE]);
      const m = authService.pendingMethods(uid);
      const methods = [
        m.totp && 'totp',
        m.passkey && passkeyService.isEnabled() && 'passkey',
      ].filter(Boolean) as string[];
      res.json({ methods });
    } catch (err) {
      next(err);
    }
  },

  /** 大事な操作の前の本人確認を Authentik で始める（小さなウィンドウで開く URL を返す） */
  async reauthOidcStart(req: Request, res: Response, next: NextFunction) {
    if (!oidcService.isEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const user = userRepository.findById(req.user!.id);
    if (!user?.oidc_sub || !req.sessionId) {
      res.status(400).json({ error: 'Authentik と連携していません' });
      return;
    }
    try {
      const { url, state } = await oidcService.start('reauth', user.id, req.sessionId);
      setOidcStateCookie(res, state);
      res.json({ url });
    } catch (err) {
      logger.error('OIDC reauth start failed', { error: (err as Error).message });
      next(err);
    }
  },

  /** 本人確認が済んでいるか（Authentik のウィンドウを開いている間、画面が数秒ごとに見る） */
  reauthStatus(req: Request, res: Response) {
    res.json({ fresh: authService.isRecentlyAuthenticated(req.sessionId) });
  },
};
