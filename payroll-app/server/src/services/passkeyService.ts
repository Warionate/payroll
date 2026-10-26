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
  type AuthenticatorTransport,
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
  // 鍵は JWT_SECRET と分ける（JWT_SECRET を入れ替えても user handle が変わらないように）。
  // 未設定なら従来どおり JWT_SECRET を使う（導入前の環境は .env に今の JWT_SECRET の値を入れて移す）
  const secret = process.env.WEBAUTHN_USER_HANDLE_SECRET || process.env.JWT_SECRET!;
  // Buffer を直接渡すと型が Uint8Array<ArrayBufferLike> になり、ライブラリの型に合わない
  return Uint8Array.from(
    crypto.createHmac('sha256', secret).update(`webauthn-user:${userId}`).digest(),
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
      userDisplayName: userRepository.findById(user.id)?.display_name ?? user.username,
      attestationType: 'none',
      // 同じ端末に二重に登録しない
      excludeCredentials: existing.map((c) => ({
        id: c.id,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransport[])
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

  /**
   * パスキーでの確認を始める。
   * - 利用者を指定しない: ユーザー名なしのログイン（端末に入っているパスキーから選ぶ）
   * - 利用者を指定する: パスワードのあとの二段階目（purpose 'login'）・大事な操作の前の本人確認
   *   （purpose 'reauth'）。その人のパスキーだけを候補に出し、確かめるときも本人のものかを見る
   */
  async authenticationOptions(userId?: number, purpose: 'login' | 'reauth' = 'login') {
    const s = settings()!;
    const allow = userId ? webauthnRepository.listByUser(userId) : [];
    if (userId && allow.length === 0) throw new PasskeyError('パスキーが登録されていません');
    const options = await generateAuthenticationOptions({
      rpID: s.rpID,
      userVerification: 'required',
      allowCredentials: userId
        ? allow.map((c) => ({
            id: c.id,
            transports: c.transports
              ? (JSON.parse(c.transports) as AuthenticatorTransport[])
              : undefined,
          }))
        : undefined,
    });
    const challengeId = crypto.randomBytes(32).toString('base64url');
    webauthnRepository.createChallenge({
      id: challengeId,
      challenge: options.challenge,
      purpose,
      user_id: userId ?? null,
    });
    return { options, challengeId };
  },

  /** ログインを検証し、その利用者を返す。失敗したら PasskeyError */
  async verifyAuthentication(
    challengeId: string | undefined,
    response: AuthenticationResponseJSON,
    expected: { purpose?: 'login' | 'reauth'; userId?: number } = {},
  ): Promise<UserRow> {
    const s = settings()!;
    const purpose = expected.purpose ?? 'login';
    const row = challengeId ? webauthnRepository.takeChallenge(challengeId) : undefined;
    if (
      !row ||
      row.purpose !== purpose ||
      (expected.userId !== undefined && row.user_id !== expected.userId)
    ) {
      throw new PasskeyError('確認の有効期限が切れました。もう一度お試しください');
    }
    const credential = webauthnRepository.findCredential(response.id);
    if (!credential) {
      // 削除済みのパスキーが端末に残っている場合もここに来る
      throw new PasskeyError('このパスキーは登録されていません');
    }
    // 利用者を指定して始めた確認では、その人のパスキーでなければ通さない
    if (row.user_id !== null && credential.user_id !== row.user_id) {
      throw new PasskeyError('このアカウントのパスキーではありません');
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
          ? (JSON.parse(credential.transports) as AuthenticatorTransport[])
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
