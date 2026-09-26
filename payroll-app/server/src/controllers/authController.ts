/**
 * Auth Controller - handles HTTP request/response for authentication
 */
import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.js';
import { oidcService } from '../services/oidcService.js';
import { passkeyService, PasskeyError } from '../services/passkeyService.js';
import { emailService, EmailError } from '../services/emailService.js';
import { userRepository } from '../repositories/userRepository.js';
import logger from '../utils/logger.js';

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
const PASSKEY_COOKIE_PATH = '/api/auth/passkey';

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
      const result = await authService.login(username, password);
      if (!result) {
        logger.warn(`Failed login attempt for username: ${username}`);
        res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています' });
        return;
      }

      setAuthCookies(res, result.token, result.refreshToken);
      res.json({ user: result.user });
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

    const result = authService.refresh(oldRefreshToken);
    if (!result) {
      res.clearCookie('token');
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(401).json({ error: 'リフレッシュトークンが無効または期限切れです' });
      return;
    }

    setAuthCookies(res, result.token, result.refreshToken);
    // Include the user so a cold PWA start can skip the extra /me round-trip
    // after a refresh (B-1). Older clients simply ignore the added field.
    res.json({ message: 'Token refreshed', user: result.user });
  },

  async register(req: Request, res: Response, next: NextFunction) {
    const { username, password, rates, email } = req.body;
    // メール送信が有効な環境では、登録時にメールアドレスも必須にする
    if (emailService.isEnabled() && !email) {
      res.status(400).json({ error: 'メールアドレスは必須です' });
      return;
    }
    try {
      const result = await authService.register(username, password, rates);
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
      res.json({ user: result.user, emailVerificationSent });
    } catch (err) {
      const error = err as Error;
      if (
        error.message.includes('UNIQUE constraint failed') ||
        error.message.includes('already exists')
      ) {
        logger.warn(`Registration failed: Username ${username} already exists`);
        res.status(400).json({ error: 'このユーザー名は既に使用されています' });
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
    res.json({ id, username, role });
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
    authService.unlinkOidc(req.user!.id);
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
        const outcome = await authService.linkOidc(result.userId!, result.sub);
        res.redirect(`/settings?oidc=${outcome === 'linked' ? 'linked' : 'taken'}`);
      } catch (err) {
        logger.error('OIDC link failed', { error: (err as Error).message });
        res.redirect('/settings?oidc=failed');
      }
      return;
    }

    const login = authService.loginWithOidc(
      result.sub,
      result.groups,
      oidcService.adminGroupName(),
    );
    if (!login) {
      res.redirect('/login?oidc_error=not_linked');
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
      const result = await authService.issueSession(user);
      setAuthCookies(res, result.token, result.refreshToken);
      res.json({ user: result.user });
    } catch (err) {
      next(err);
    }
  },

  passkeyList(req: Request, res: Response) {
    res.json({ passkeys: passkeyService.list(req.user!.id) });
  },

  passkeyDelete(req: Request, res: Response) {
    const removed = passkeyService.remove(req.user!.id, String(req.params.id));
    if (!removed) {
      res.status(404).json({ error: 'パスキーが見つかりません' });
      return;
    }
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
};
