import { describe, it, expect } from 'vitest';
import {
  base32Decode,
  base32Encode,
  totpCode,
  verifyTotp,
  totpUri,
  generateTotpSecret,
} from '../../../src/utils/totp.js';

// RFC 6238 付録 B の SHA-1 の鍵（ASCII "12345678901234567890"）
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('round-trips base32', () => {
    const buf = Buffer.from('hello totp');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('matches the RFC 6238 test vectors (last 6 digits)', () => {
    // T = 59 / 1111111109 / 1234567890 / 2000000000 秒
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924');
    expect(totpCode(RFC_SECRET, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('accepts the previous/next window but not further, and never reuses a step', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), null, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), null, now)).toBeNull();
    // 同じ枠・それ以前は使えない
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', null, now)).toBeNull();
  });

  it('builds an otpauth URI and a 160-bit secret', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    const uri = totpUri(secret, 'staff', 'Payroll');
    expect(uri.startsWith('otpauth://totp/Payroll%3Astaff?')).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
  });
});
