/**
 * OIDC Service - Authentik とのやり取り（認可リクエストの組み立てとコールバックの検証）
 *
 * 既存アカウントが主で、Authentik はそこに紐づける補助の入口。
 *   - purpose 'link'  : ログイン中の本人が設定画面から始める。戻ってきた sub をその本人に紐づける
 *   - purpose 'login' : 紐づけ済みの sub のときだけログインさせる。新しいアカウントは作らない
 *
 * .env に OIDC_* が揃っていなければ機能ごと無効（ルートは 404 相当の応答を返す）。
 */
import * as client from 'openid-client';
import logger from '../utils/logger.js';
import { oidcStateRepository, type OidcPurpose } from '../repositories/oidcStateRepository.js';

function settings() {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  return { issuer, clientId, clientSecret, redirectUri };
}

let configPromise: Promise<client.Configuration> | null = null;

function getConfig(): Promise<client.Configuration> {
  const s = settings()!;
  if (!configPromise) {
    configPromise = client.discovery(new URL(s.issuer), s.clientId, s.clientSecret).catch((err) => {
      // 失敗を覚えない。Authentik が戻れば次の呼び出しでやり直す
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export interface OidcResult {
  purpose: OidcPurpose;
  userId: number | null;
  sub: string;
  groups: string[];
}

export const oidcService = {
  isEnabled(): boolean {
    return settings() !== null;
  },

  /** 管理者とみなす Authentik のグループ名（ID トークンの groups と照合する） */
  adminGroupName(): string | undefined {
    return process.env.OIDC_ADMIN_GROUP || undefined;
  },

  /**
   * 認可リクエストの URL を作り、state を DB に残す。返す state はブラウザの Cookie にも入れて
   * コールバックで突き合わせる（他人に URL を踏ませて紐づけさせる攻撃を防ぐ）。
   */
  async start(
    purpose: OidcPurpose,
    userId: number | null,
  ): Promise<{ url: string; state: string }> {
    const s = settings()!;
    const config = await getConfig();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    oidcStateRepository.create({
      state,
      code_verifier: codeVerifier,
      nonce,
      purpose,
      user_id: userId,
    });

    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: s.redirectUri,
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, state };
  },

  /**
   * コールバックを検証する。query はコールバックのクエリ文字列（先頭の ? なし）。
   * 前段（Cloudflare）越しなので、URL は req からではなく OIDC_REDIRECT_URI から組み立てる。
   */
  async finish(query: string, browserState: string | undefined): Promise<OidcResult> {
    const s = settings()!;
    const params = new URLSearchParams(query);
    const state = params.get('state');
    if (!state) throw new Error('state がない');
    if (!browserState || browserState !== state) {
      throw new Error('state がこのブラウザで始めたものと一致しない');
    }
    const row = oidcStateRepository.take(state);
    if (!row) throw new Error('state が無いか期限切れ');

    const config = await getConfig();
    const currentUrl = new URL(`${s.redirectUri}?${params.toString()}`);
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: row.code_verifier,
      expectedState: state,
      expectedNonce: row.nonce,
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error('ID トークンに sub が無い');

    const groups = Array.isArray(claims.groups) ? (claims.groups as unknown[]).map(String) : [];
    logger.info(`OIDC callback verified (purpose=${row.purpose}, sub=${claims.sub})`);
    return { purpose: row.purpose, userId: row.user_id, sub: claims.sub, groups };
  },
};
