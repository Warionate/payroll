/**
 * パスワードのハッシュ化と照合。
 *
 * 新しいハッシュは Argon2id（OWASP 推奨値: m=19MiB, t=2, p=1）で作る。
 * 移行前の bcrypt ハッシュ（$2a$/$2b$/$2y$）も照合でき、ログイン成功時に
 * needsRehash() で検出して Argon2id に作り直す。
 */
import argon2 from 'argon2';
import bcrypt from 'bcrypt';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    // 形式が壊れたハッシュは不一致として扱う
    return false;
  }
}

/** bcrypt のまま、または Argon2 のパラメータが現行と違うなら true */
export function needsRehash(hash: string): boolean {
  if (isBcryptHash(hash)) return true;
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}
