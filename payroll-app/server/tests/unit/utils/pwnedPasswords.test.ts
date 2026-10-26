import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { pwnedCount, isPwnedPassword } from '../../../src/utils/pwnedPasswords.js';

const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex').toUpperCase();

describe('pwnedPasswords', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends only the first 5 hex chars and matches the suffix locally', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const hash = sha1('hunter2');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:1234\r\n`,
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await pwnedCount('hunter2')).toBe(1234);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5));
  });

  it('returns 0 when the password is not listed (padding rows have count 0)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'ABCDEF:0\r\n' }),
    );

    expect(await isPwnedPassword('a-very-unusual-passphrase')).toBe(false);
  });

  it('lets the password through when HIBP is unreachable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    expect(await pwnedCount('anything')).toBeNull();
    expect(await isPwnedPassword('anything')).toBe(false);
  });

  it('does not call HIBP in tests or when PWNED_CHECK=off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PWNED_CHECK', 'off');

    expect(await pwnedCount('password')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
