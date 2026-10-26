/**
 * 二段階認証と「最初の設定」（確認済みのメールアドレス + 二つ目の手段）。
 *
 * 二つ目の手段は、パスキー・認証アプリ（TOTP）・Authentik 連携のどれか。
 * - 認証アプリを持つ人は、パスワード + 6 桁のコード（または回復コード）でログインする
 * - パスキー・Authentik だけの人は、パスワードだけではログインできない（それぞれの手段で入る）
 * - まだ何も持っていない人はパスワードで入れるが、設定を済ませるまでアプリを使えない（setup ゲート）
 *
 * テスト（NODE_ENV=test）と ACCOUNT_SETUP_REQUIRED=off では、ゲートと「パスワードだけの拒否」を外す
 * （ACCOUNT_SETUP_REQUIRED=on なら、テストでも強制する）。
 */
import crypto from 'node:crypto';
import { mfaRepository } from '../repositories/mfaRepository.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { userRepository, type UserRow } from '../repositories/userRepository.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { currentStep, generateTotpSecret, totpUri, verifyTotp } from '../utils/totp.js';
import { recordSecurityEvent, type RequestContext } from '../utils/securityLog.js';
import { mailService } from './mailService.js';
import { ValidationError } from '../utils/errors.js';
import { isValidLoginId } from '@payroll/shared';

const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Payroll';

export class MfaError extends Error {}

export interface AccountSetup {
  /** 確認済みのメールアドレスが要る */
  email: boolean;
  /** 二つ目の手段（パスキー・認証アプリ・Authentik）が要る */
  mfa: boolean;
  /** ユーザー ID を決め直す必要がある（文字種のルールより前に作られた ID） */
  loginId: boolean;
  /** この日時までに済ませないとアカウントが消える（新規登録した人だけ） */
  deadline?: string | null;
}

function hashRecoveryCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(`recovery:${code.replace(/[\s-]/g, '').toLowerCase()}`)
    .digest('hex');
}

/** xxxx-xxxx（英小文字と数字、紛らわしい文字を除く） */
function newRecoveryCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const mfaService = {
  enforced(): boolean {
    if (process.env.ACCOUNT_SETUP_REQUIRED === 'on') return true; // テストで強制を確かめるとき
    return process.env.ACCOUNT_SETUP_REQUIRED !== 'off' && process.env.NODE_ENV !== 'test';
  },

  totpEnabled(user: Pick<UserRow, 'totp_enabled_at' | 'totp_secret'>): boolean {
    return Boolean(user.totp_enabled_at && user.totp_secret);
  },

  hasSecondFactor(
    user: Pick<UserRow, 'id' | 'oidc_sub' | 'oidc_mfa_at' | 'totp_enabled_at' | 'totp_secret'>,
  ): boolean {
    return (
      mfaService.totpEnabled(user) ||
      mfaService.oidcCountsAsFactor(user) ||
      mfaRepository.countPasskeys(user.id) > 0
    );
  },

  /**
   * Authentik 連携を二段階の手段として数えるか。Authentik の二段階は任意なので、
   * 最後に Authentik で二段階を済ませてログインしたとき（oidc_mfa_at）だけ数える
   */
  oidcCountsAsFactor(user: { oidc_sub: string | null; oidc_mfa_at?: string | null }): boolean {
    return Boolean(user.oidc_sub && user.oidc_mfa_at);
  },

  /** 済ませていない設定。強制しない環境では常に何も要らない */
  setupStatus(user: UserRow | undefined): AccountSetup {
    if (!user || !mfaService.enforced()) return { email: false, mfa: false, loginId: false };
    return {
      // メール送信が無効な環境では確認メールを送れないので求めない
      email: !user.email && mailService.isEnabled(),
      mfa: !mfaService.hasSecondFactor(user),
      loginId: !isValidLoginId(user.username),
      deadline: user.setup_deadline ?? null,
    };
  },

  setupStatusById(userId: number): AccountSetup {
    return mfaService.setupStatus(userRepository.findById(userId));
  },

  /** 設定画面用の状態 */
  status(userId: number) {
    const user = userRepository.findById(userId);
    return {
      totp: user ? mfaService.totpEnabled(user) : false,
      recoveryCodesLeft: user ? mfaRepository.countUnusedRecoveryCodes(userId) : 0,
      trustedDevices: user ? sessionRepository.countTrustedDevices(userId) : 0,
    };
  },

  /** 認証アプリの登録を始める。確認するまで有効にはならない */
  beginTotp(userId: number): { secret: string; uri: string } {
    const user = userRepository.findById(userId);
    if (!user) throw new MfaError('ユーザーが見つかりません');
    if (mfaService.totpEnabled(user)) throw new MfaError('認証アプリは登録済みです');
    const secret = generateTotpSecret();
    mfaRepository.setPendingTotp(userId, encrypt(secret)!);
    return { secret, uri: totpUri(secret, user.username, TOTP_ISSUER) };
  },

  /** 認証アプリのコードで登録を確定し、回復コードを返す（この1回しか見せない） */
  confirmTotp(userId: number, code: string, ctx: RequestContext = {}): string[] {
    const user = userRepository.findById(userId);
    if (!user?.totp_secret || mfaService.totpEnabled(user)) {
      throw new MfaError('最初からやり直してください');
    }
    const step = verifyTotp(decrypt(user.totp_secret) as string, code, null);
    if (step === null)
      throw new MfaError('コードが違います。時計がずれていないかも確かめてください');
    mfaRepository.enableTotp(userId, step);
    recordSecurityEvent(userId, 'totp_enabled', ctx);
    return mfaService.regenerateRecoveryCodes(userId, ctx, false);
  },

  regenerateRecoveryCodes(userId: number, ctx: RequestContext = {}, record = true): string[] {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    mfaRepository.replaceRecoveryCodes(userId, codes.map(hashRecoveryCode));
    if (record) recordSecurityEvent(userId, 'recovery_codes_regenerated', ctx);
    return codes;
  },

  disableTotp(userId: number, ctx: RequestContext = {}): void {
    mfaService.assertKeepsSecondFactor(userId, 'totp');
    mfaRepository.disableTotp(userId);
    sessionRepository.clearTrustedDevices(userId);
    recordSecurityEvent(userId, 'totp_disabled', ctx);
  },

  /**
   * ログインの二段階目。6 桁のコード、または回復コード（xxxx-xxxx）を受ける。
   * 合えば 'totp' / 'recovery'、合わなければ null
   */
  verifyLoginCode(user: UserRow, code: string): 'totp' | 'recovery' | null {
    if (!mfaService.totpEnabled(user)) return null;
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed.replace(/\s/g, ''))) {
      const step = verifyTotp(
        decrypt(user.totp_secret!) as string,
        trimmed,
        user.totp_last_step ?? null,
      );
      if (step === null) return null;
      // 同じコードを並行して2回通さない（DB 側で時間枠を進められた方だけ通す）
      return mfaRepository.advanceTotpStep(user.id, step) ? 'totp' : null;
    }
    return mfaRepository.useRecoveryCode(user.id, hashRecoveryCode(trimmed)) ? 'recovery' : null;
  },

  /**
   * 二つ目の手段を外す前に呼ぶ。外すと何も残らないなら断る（強制しない環境では何もしない）
   */
  assertKeepsSecondFactor(userId: number, removing: 'totp' | 'passkey' | 'oidc'): void {
    if (!mfaService.enforced()) return;
    const user = userRepository.findById(userId);
    if (!user) return;
    const totp = removing !== 'totp' && mfaService.totpEnabled(user);
    const oidc = removing !== 'oidc' && mfaService.oidcCountsAsFactor(user);
    const passkeys = mfaRepository.countPasskeys(userId) - (removing === 'passkey' ? 1 : 0);
    if (!totp && !oidc && passkeys <= 0) {
      throw new ValidationError(
        '二段階認証の手段がなくなるため外せません。先に別の手段（パスキー・認証アプリ）を登録してください',
      );
    }
  },

  /** 現在の時間枠（テスト用） */
  currentStep,
};
