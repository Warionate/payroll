import { apiClient, getResponse } from './client';
import type { AxiosRequestConfig } from 'axios';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export const authApi = {
  login: (username: string, password: string) =>
    apiClient.post('/auth/login', { username, password }).then(getResponse),

  register: (username: string, password: string, rates?: unknown, email?: string) =>
    apiClient.post('/auth/register', { username, password, rates, email }).then(getResponse),

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
};

/** Authentik でのログインを始める URL（画面ごと移動する。XHR では呼ばない） */
export const OIDC_LOGIN_URL = '/api/auth/oidc/login';

// --- Calendar Token ---
export const fetchCalendarToken = () => apiClient.get('/auth/calendar_token').then(getResponse);

export const resetCalendarToken = () =>
  apiClient.post('/auth/calendar_token/reset').then(getResponse);
