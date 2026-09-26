/**
 * Upload validation helpers (no side-effecting imports, so they are safe to
 * unit-test in isolation).
 *
 * Security rationale: the stored file extension must be derived from a
 * server-controlled allow-list keyed on the validated MIME type — never from
 * the client-supplied originalname. Otherwise an attacker can upload content
 * with a forged mimetype (e.g. image/jpeg) and an originalname like
 * "evil.html"/"evil.js", get it stored under that extension, and have it
 * served from /uploads as same-origin text/html or JavaScript — a stored XSS.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Minimal shape we need from a multer file (avoids importing multer types). */
export interface UploadedFileLike {
  mimetype: string;
  originalname: string;
}

/** Validated MIME type → canonical, safe stored extension. */
export const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

/**
 * Extensions allowed when a client sends application/octet-stream (some clients
 * send this generic type for documents). Dangerous extensions (.html/.js/.svg…)
 * are intentionally excluded.
 */
export const ALLOWED_OCTET_EXTS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.csv',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
];

/**
 * Resolve a safe, server-controlled extension for the stored file.
 * Never derive the stored extension from the client-supplied originalname.
 * Returns '.bin' as a defensive fallback (served as application/octet-stream,
 * i.e. downloaded, never rendered) for anything unexpected.
 */
export function resolveSafeExtension(file: UploadedFileLike): string {
  const mapped = MIME_TO_EXT[file.mimetype];
  if (mapped) return mapped;
  if (file.mimetype === 'application/octet-stream') {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_OCTET_EXTS.includes(ext)) return ext;
  }
  return '.bin';
}

/**
 * Validate that a file's leading bytes match the signature expected for `ext`.
 * Extensions with no known binary signature (.txt/.csv/.bin) pass through.
 */
export function validateMagicBytes(filePath: string, ext: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    const magicMap: Record<string, () => boolean> = {
      '.jpg': () => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
      '.jpeg': () => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
      '.png': () => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
      '.gif': () => buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46,
      '.webp': () =>
        buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
      '.pdf': () => buf.toString('ascii', 0, 4) === '%PDF',
      '.doc': () => buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0,
      '.docx': () => buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04,
      '.xls': () => buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0,
      '.xlsx': () => buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04,
    };

    const validator = magicMap[ext];
    if (!validator) return true;
    return validator();
  } catch {
    return false;
  }
}
