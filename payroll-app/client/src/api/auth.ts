import { apiClient, getResponse } from './client';
import type { AxiosRequestConfig } from 'axios';
import type { AccountSetup, User } from '@payroll/shared';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export const authApi = {
  /** パスワードでのログイン。認証アプリを登録している人は { mfaRequired: 'totp' } が返り、次に loginTotp を呼ぶ */
  login: (
    username: string,
    password: string,
  ): Promise<{ user?: User; mfaRequired?: string; methods?: SecondFactorMethod[] }> =>
    apiClient.post('/auth/login', { username, password }).then(getResponse),

  /** ログインの二段階目をパスキーで（その人のパスキーだけが候補に出る） */
  loginPasskeyOptions: (): Promise<PublicKeyCredentialRequestOptionsJSON> =>
    apiClient.post('/auth/login/passkey/options').then(getResponse),

  loginPasskeyVerify: (response: AuthenticationResponseJSON): Promise<{ user: User }> =>
    apiClient.post('/auth/login/passkey/verify', { response }).then(getResponse),

  /** 二段階目の画面を開き直したときに、使える手段を聞く（Authentik から戻ってきた等） */
  loginPending: (): Promise<{ methods: SecondFactorMethod[] }> =>
    apiClient.get('/auth/login/pending').then(getResponse),

  /** 大事な操作の前の本人確認を Authentik で（小さなウィンドウで開く URL） */
  reauthOidc: (): Promise<{ url: string }> => apiClient.post('/auth/reauth/oidc').then(getResponse),

  reauthStatus: (): Promise<{ fresh: boolean }> =>
    apiClient.get('/auth/reauth/status').then(getResponse),

  /** 大事な操作の前の本人確認をパスキーで */
  reauthPasskeyOptions: (): Promise<PublicKeyCredentialRequestOptionsJSON> =>
    apiClient.post('/auth/reauth/passkey/options').then(getResponse),

  reauthPasskeyVerify: (response: AuthenticationResponseJSON) =>
    apiClient.post('/auth/reauth/passkey/verify', { response }).then(getResponse),

  /** ログインの二段階目（認証アプリの 6 桁のコード、または回復コード） */
  loginTotp: (code: string, remember = false): Promise<{ user: User }> =>
    apiClient.post('/auth/login/totp', { code, remember }).then(getResponse),

  register: (
    username: string,
    password: string,
    rates?: unknown,
    email?: string,
    displayName?: string,
  ) =>
    apiClient
      .post('/auth/register', { username, password, rates, email, display_name: displayName })
      .then(getResponse),

  logout: (config?: AxiosRequestConfig) => apiClient.post('/auth/logout', {}, config),

  me: (config?: AxiosRequestConfig) => apiClient.get('/auth/me', config).then(getResponse),

  // --- Authentik（OIDC）連携 ---
  oidcConfig: (): Promise<{ enabled: boolean }> =>
    apiClient.get('/auth/oidc/config').then(getResponse),

  oidcStatus: (): Promise<{ enabled: boolean; linked: boolean }> =>
    apiClient.get('/auth/oidc/status').then(getResponse),

  /** 連携を始める。返ってきた URL（Authentik）へ画面ごと移動する */
  oidcLinkStart: (): Promise<{ url: string }> =>
    apiClient.post('/auth/oidc/link').then(getResponse),

  oidcUnlink: () => apiClient.delete('/auth/oidc/link').then(getResponse),

  // --- パスキー ---
  passkeyConfig: (): Promise<{ enabled: boolean }> =>
    apiClient.get('/auth/passkey/config').then(getResponse),

  passkeyRegisterOptions: (): Promise<PublicKeyCredentialCreationOptionsJSON> =>
    apiClient.post('/auth/passkey/register/options').then(getResponse),

  passkeyRegisterVerify: (response: RegistrationResponseJSON, name: string) =>
    apiClient.post('/auth/passkey/register/verify', { response, name }).then(getResponse),

  passkeyLoginOptions: (): Promise<PublicKeyCredentialRequestOptionsJSON> =>
    apiClient.post('/auth/passkey/login/options').then(getResponse),

  passkeyLoginVerify: (response: AuthenticationResponseJSON) =>
    apiClient.post('/auth/passkey/login/verify', { response }).then(getResponse),

  passkeyList: (): Promise<{
    passkeys: {
      id: string;
      name: string;
      created_at: string;
      last_used_at: string | null;
      synced: boolean;
    }[];
  }> => apiClient.get('/auth/passkeys').then(getResponse),

  // --- メールアドレス（確認・パスワード再設定） ---
  emailConfig: (): Promise<{ enabled: boolean }> =>
    apiClient.get('/auth/email/config').then(getResponse),

  emailStatus: (): Promise<{ enabled: boolean; email: string | null; pending: string | null }> =>
    apiClient.get('/auth/email').then(getResponse),

  emailRequestVerification: (email: string) =>
    apiClient.post('/auth/email', { email }).then(getResponse),

  emailConfirm: (token: string): Promise<{ email: string }> =>
    apiClient.post('/auth/email/verify', { token }).then(getResponse),

  emailRemove: () => apiClient.delete('/auth/email').then(getResponse),

  passwordForgot: (email: string): Promise<{ message: string }> =>
    apiClient.post('/auth/password/forgot', { email }).then(getResponse),

  passwordReset: (token: string, password: string) =>
    apiClient.post('/auth/password/reset', { token, password }).then(getResponse),

  passkeyDelete: (id: string) =>
    apiClient.delete(`/auth/passkeys/${encodeURIComponent(id)}`).then(getResponse),

  // --- ログイン中の端末・本人確認・セキュリティの記録 ---
  reauth: (password: string) => apiClient.post('/auth/reauth', { password }).then(getResponse),

  // --- 認証アプリ（TOTP）・回復コード ---
  mfaStatus: (): Promise<{
    totp: boolean;
    recoveryCodesLeft: number;
    trustedDevices: number;
    setup: AccountSetup;
  }> => apiClient.get('/auth/mfa').then(getResponse),

  /** 「コードを求めない」と記憶した端末をすべて解除する */
  trustedDevicesClear: () => apiClient.delete('/auth/trusted-devices').then(getResponse),

  totpSetup: (): Promise<{ secret: string; uri: string }> =>
    apiClient.post('/auth/totp/setup').then(getResponse),

  totpConfirm: (code: string): Promise<{ recoveryCodes: string[] }> =>
    apiClient.post('/auth/totp/confirm', { code }).then(getResponse),

  totpDisable: () => apiClient.delete('/auth/totp').then(getResponse),

  recoveryCodesRegenerate: (): Promise<{ recoveryCodes: string[] }> =>
    apiClient.post('/auth/recovery-codes').then(getResponse),

  sessionList: (): Promise<{ sessions: LoginSession[] }> =>
    apiClient.get('/auth/sessions').then(getResponse),

  sessionRevoke: (id: string) =>
    apiClient.delete(`/auth/sessions/${encodeURIComponent(id)}`).then(getResponse),

  sessionRevokeOthers: () => apiClient.post('/auth/sessions/revoke-others').then(getResponse),

  securityEvents: (): Promise<{ events: SecurityEvent[] }> =>
    apiClient.get('/auth/security-events').then(getResponse),
};

/** パスワードのあとの二段階目に使える手段 */
export type SecondFactorMethod = 'totp' | 'passkey' | 'oidc';

export interface LoginSession {
  id: string;
  method: 'password' | 'totp' | 'passkey' | 'oidc' | 'register' | 'legacy';
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
}

export interface SecurityEvent {
  id: number;
  type: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
}

/** Authentik でのログインを始める URL（画面ごと移動する。XHR では呼ばない） */
export const OIDC_LOGIN_URL = '/api/auth/oidc/login';

// --- Calendar Token ---
export const fetchCalendarToken = () => apiClient.get('/auth/calendar_token').then(getResponse);

export const resetCalendarToken = () =>
  apiClient.post('/auth/calendar_token/reset').then(getResponse);
