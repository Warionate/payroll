/**
 * 漏洩済みパスワードの照合（Have I Been Pwned の Pwned Passwords、k-匿名方式）。
 *
 * SHA-1 の先頭 5 文字だけを送り、返ってきた候補（残り 35 文字の一覧）と手元で突き合わせる。
 * パスワードもハッシュ全体も外に出ない。HIBP に届かないときは通す（ログに残す）。
 * テスト環境（NODE_ENV=test）と PWNED_CHECK=off では照合しない。
 */
import crypto from 'node:crypto';
import logger from './logger.js';

const API = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3000;

function isDisabled(): boolean {
  return process.env.PWNED_CHECK === 'off' || process.env.NODE_ENV === 'test';
}

/** 漏洩済みなら出現回数、載っていなければ 0、照合できなければ null */
export async function pwnedCount(password: string): Promise<number | null> {
  if (isDisabled()) return 0;
  // HIBP の API が SHA-1 を前提にしている（保存や署名には使わない）
  // nosemgrep: ajinabraham.njsscan.crypto.crypto_node.node_sha1
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(API + prefix, {
      // Add-Padding: 応答の大きさから prefix を推測されないよう、ダミーの行を混ぜてもらう
      headers: { 'Add-Padding': 'true', 'User-Agent': 'payroll-app' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix) return Number(count) || 0;
    }
    return 0;
  } catch (err) {
    logger.warn('Pwned Passwords check failed; allowing password', {
      error: (err as Error).message,
    });
    return null;
  }
}

export const PWNED_PASSWORD_MESSAGE =
  'このパスワードは過去の情報漏洩で流出しています。別のパスワードにしてください';

/** 漏洩済みなら true（照合できないときは false = 通す） */
export async function isPwnedPassword(password: string): Promise<boolean> {
  const count = await pwnedCount(password);
  return count !== null && count > 0;
}
