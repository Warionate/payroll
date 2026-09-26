/**
 * Passkey Service - パスキー（WebAuthn）の登録とログイン
 *
 * 既存アカウントに足すもの。登録はログイン中の本人が設定画面から行い、ログインはパスキーだけで
 * 行える（ユーザー名の入力も不要な discoverable credential）。パスワードは予備として残る。
 *
 * .env に WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN が無ければ機能ごと無効。
 */
import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import logger from '../utils/logger.js';
import { webauthnRepository } from '../repositories/webauthnRepository.js';
import { userRepository, type UserRow } from '../repositories/userRepository.js';

const MAX_PASSKEYS_PER_USER = 10;

function settings() {
  const rpID = process.env.WEBAUTHN_RP_ID;
  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!rpID || !origin) return null;
  return { rpID, origin, rpName: process.env.WEBAUTHN_RP_NAME || 'Payroll App' };
}

/**
 * パスキーに入れる利用者 ID（user handle）。同じ人の登録を端末側で1つにまとめるために安定させる。
 * 利用者番号をそのまま入れず、秘密鍵つきのハッシュにする（user handle は端末に平文で残るため）。
 */
function userHandle(userId: number): Uint8Array<ArrayBuffer> {
  // Buffer を直接渡すと型が Uint8Array<ArrayBufferLike> になり、ライブラリの型に合わない
  return Uint8Array.from(
    crypto.createHmac('sha256', process.env.JWT_SECRET!).update(`webauthn-user:${userId}`).digest(),
  );
}

export class PasskeyError extends Error {}

export const passkeyService = {
  isEnabled(): boolean {
    return settings() !== null;
  },

  /** 登録を始める。返り値の challengeId は httpOnly Cookie でブラウザに持たせる */
  async registrationOptions(user: { id: number; username: string }) {
    const s = settings()!;
    const existing = webauthnRepository.listByUser(user.id);
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      throw new PasskeyError(`パスキーは ${MAX_PASSKEYS_PER_USER} 個まで登録できます`);
    }
    const options = await generateRegistrationOptions({
      rpName: s.rpName,
      rpID: s.rpID,
      userID: userHandle(user.id),
      userName: user.username,
      attestationType: 'none',
      // 同じ端末に二重に登録しない
      excludeCredentials: existing.map((c) => ({
        id: c.id,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'required', // ユーザー名なしでログインするため
        userVerification: 'required', // パスワードの代わりなので、端末側の本人確認を必須にする
      },
    });
    const challengeId = crypto.randomBytes(32).toString('base64url');
    webauthnRepository.createChallenge({
      id: challengeId,
      challenge: options.challenge,
      purpose: 'register',
      user_id: user.id,
    });
    return { options, challengeId };
  },

  async verifyRegistration(
    userId: number,
    challengeId: string | undefined,
    response: RegistrationResponseJSON,
    name: string,
  ): Promise<void> {
    const s = settings()!;
    const row = challengeId ? webauthnRepository.takeChallenge(challengeId) : undefined;
    if (!row || row.purpose !== 'register' || row.user_id !== userId) {
      throw new PasskeyError('登録の有効期限が切れました。もう一度お試しください');
    }
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: s.origin,
      expectedRPID: s.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new PasskeyError('パスキーを確認できませんでした');
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    webauthnRepository.createCredential({
      id: credential.id,
      user_id: userId,
      public_key: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp ? 1 : 0,
      name: name.trim().slice(0, 50) || 'パスキー',
    });
    logger.info(`Passkey registered: user #${userId}`);
  },

  /** ログインを始める（ユーザー名は聞かない） */
  async authenticationOptions() {
    const s = settings()!;
    const options = await generateAuthenticationOptions({
      rpID: s.rpID,
      userVerification: 'required',
    });
    const challengeId = crypto.randomBytes(32).toString('base64url');
    webauthnRepository.createChallenge({
      id: challengeId,
      challenge: options.challenge,
      purpose: 'login',
      user_id: null,
    });
    return { options, challengeId };
  },

  /** ログインを検証し、その利用者を返す。失敗したら PasskeyError */
  async verifyAuthentication(
    challengeId: string | undefined,
    response: AuthenticationResponseJSON,
  ): Promise<UserRow> {
    const s = settings()!;
    const row = challengeId ? webauthnRepository.takeChallenge(challengeId) : undefined;
    if (!row || row.purpose !== 'login') {
      throw new PasskeyError('ログインの有効期限が切れました。もう一度お試しください');
    }
    const credential = webauthnRepository.findCredential(response.id);
    if (!credential) {
      // 削除済みのパスキーが端末に残っている場合もここに来る
      throw new PasskeyError('このパスキーは登録されていません');
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: s.origin,
      expectedRPID: s.rpID,
      requireUserVerification: true,
      credential: {
        id: credential.id,
        publicKey: Uint8Array.from(Buffer.from(credential.public_key, 'base64url')),
        counter: credential.counter,
        transports: credential.transports
          ? (JSON.parse(credential.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
    });
    if (!verification.verified) {
      throw new PasskeyError('パスキーを確認できませんでした');
    }
    webauthnRepository.markUsed(credential.id, verification.authenticationInfo.newCounter);

    const user = userRepository.findById(credential.user_id);
    if (!user) throw new PasskeyError('このパスキーは登録されていません');
    logger.info(`User logged in via passkey: ${user.username}`);
    return user;
  },

  list(userId: number) {
    return webauthnRepository.listByUser(userId).map((c) => ({
      id: c.id,
      name: c.name,
      created_at: c.created_at,
      last_used_at: c.last_used_at,
      synced: c.device_type === 'multiDevice',
    }));
  },

  remove(userId: number, id: string): boolean {
    const removed = webauthnRepository.deleteForUser(id, userId);
    if (removed) logger.info(`Passkey removed: user #${userId}`);
    return removed;
  },
};
