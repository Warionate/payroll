import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALLOWED_OCTET_EXTS,
  resolveSafeExtension,
  validateMagicBytes,
} from '../../../src/utils/uploadValidation.js';

describe('resolveSafeExtension', () => {
  it('derives the extension from the validated MIME type, ignoring originalname', () => {
    // 攻撃: image/jpeg を装いつつ originalname に .html を指定しても、
    // 保存拡張子は MIME 由来の .jpg になる（同一オリジンの text/html 配信を防ぐ）
    expect(resolveSafeExtension({ mimetype: 'image/jpeg', originalname: 'evil.html' })).toBe(
      '.jpg',
    );
    expect(resolveSafeExtension({ mimetype: 'application/pdf', originalname: 'evil.js' })).toBe(
      '.pdf',
    );
    expect(resolveSafeExtension({ mimetype: 'image/png', originalname: 'x.svg' })).toBe('.png');
  });

  it('maps every allowed MIME type to a non-dangerous extension', () => {
    const dangerous = ['.html', '.htm', '.js', '.mjs', '.svg', '.xml', '.xhtml'];
    for (const file of [
      { mimetype: 'image/gif', originalname: 'a' },
      { mimetype: 'image/webp', originalname: 'a' },
      { mimetype: 'text/plain', originalname: 'a' },
      { mimetype: 'text/csv', originalname: 'a' },
      {
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'a',
      },
    ]) {
      expect(dangerous).not.toContain(resolveSafeExtension(file));
    }
  });

  it('honors only safe extensions for application/octet-stream and rejects dangerous ones', () => {
    expect(
      resolveSafeExtension({ mimetype: 'application/octet-stream', originalname: 'a.pdf' }),
    ).toBe('.pdf');
    // 危険拡張子は octet-stream 経路でも採用されず .bin (=ダウンロード) に落ちる
    expect(
      resolveSafeExtension({ mimetype: 'application/octet-stream', originalname: 'a.html' }),
    ).toBe('.bin');
    expect(
      resolveSafeExtension({ mimetype: 'application/octet-stream', originalname: 'a.js' }),
    ).toBe('.bin');
  });

  it('falls back to .bin for unknown MIME types', () => {
    expect(resolveSafeExtension({ mimetype: 'text/html', originalname: 'a.html' })).toBe('.bin');
    expect(resolveSafeExtension({ mimetype: 'image/svg+xml', originalname: 'a.svg' })).toBe('.bin');
  });

  it('never allows dangerous extensions in the octet-stream allow-list', () => {
    for (const bad of ['.html', '.js', '.svg', '.xml']) {
      expect(ALLOWED_OCTET_EXTS).not.toContain(bad);
    }
  });
});

describe('validateMagicBytes', () => {
  const tmpFiles: string[] = [];
  const writeTmp = (name: string, bytes: number[] | Buffer): string => {
    const p = path.join(
      os.tmpdir(),
      `uvtest-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`,
    );
    fs.writeFileSync(p, Buffer.from(bytes));
    tmpFiles.push(p);
    return p;
  };

  afterAll(() => {
    for (const p of tmpFiles) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }
  });

  it('accepts content whose signature matches the extension', () => {
    const jpg = writeTmp('a.jpg', [0xff, 0xd8, 0xff, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateMagicBytes(jpg, '.jpg')).toBe(true);

    const pdf = writeTmp('a.pdf', Buffer.from('%PDF-1.7 rest'));
    expect(validateMagicBytes(pdf, '.pdf')).toBe(true);
  });

  it('rejects HTML content disguised under a binary extension', () => {
    const html = writeTmp('a.jpg', Buffer.from('<html><script>alert(1)</script>'));
    expect(validateMagicBytes(html, '.jpg')).toBe(false);
    // 同じ中身を .pdf 扱いにしても弾かれる
    expect(validateMagicBytes(html, '.pdf')).toBe(false);
  });

  it('passes through extensions with no known signature (.txt/.csv/.bin)', () => {
    const txt = writeTmp('a.txt', Buffer.from('arbitrary text'));
    expect(validateMagicBytes(txt, '.txt')).toBe(true);
    expect(validateMagicBytes(txt, '.csv')).toBe(true);
    expect(validateMagicBytes(txt, '.bin')).toBe(true);
  });

  it('returns false when the file cannot be read', () => {
    expect(validateMagicBytes(path.join(os.tmpdir(), 'does-not-exist-uvtest'), '.jpg')).toBe(false);
  });
});
