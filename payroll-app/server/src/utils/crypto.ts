import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Logger lazy-load to avoid circular dependencies at startup
let _logger: typeof import('./logger.js').default | null = null;
const _getLogger = async () => {
  if (!_logger) {
    const mod = await import('./logger.js');
    _logger = mod.default;
  }
  return _logger;
};

// ENCRYPTION_KEY must be exactly 32 bytes for AES-256
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || Buffer.byteLength(ENCRYPTION_KEY, 'utf8') !== 32) {
  // eslint-disable-next-line no-console -- Logger not available at startup
  console.error('FATAL: ENCRYPTION_KEY must be set in .env and be exactly 32 bytes');
  process.exit(1);
}

const KEY = Buffer.from(ENCRYPTION_KEY, 'utf8');

// AES-256-GCM (authenticated encryption): format is iv:authTag:ciphertext (hex)
const GCM_IV_LENGTH = 12;
const GCM_IV_HEX_LENGTH = GCM_IV_LENGTH * 2;
const GCM_TAG_BYTES = 16;
const GCM_TAG_HEX_LENGTH = GCM_TAG_BYTES * 2;

export function encrypt(text: string | number | null | undefined): string | null | undefined {
  if (text === null || text === undefined) return text;
  const strText = String(text);
  if (strText === '') return strText;
  try {
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv, { authTagLength: GCM_TAG_BYTES });
    const encrypted = Buffer.concat([cipher.update(strText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    const err = error as Error;
    // Lazy-load logger – use sync console as fallback
    // eslint-disable-next-line no-console
    console.error('Encryption error', err.message);
    throw new Error('Encryption failed - data not saved', { cause: error });
  }
}

export function decrypt(text: string | null | undefined): string | null | undefined {
  if (text === null || text === undefined) return text;
  if (text === '') return text;
  try {
    const textParts = text.split(':');

    // GCM format: iv(24 hex):authTag(32 hex):ciphertext
    if (
      textParts.length === 3 &&
      textParts[0].length === GCM_IV_HEX_LENGTH &&
      textParts[1].length === GCM_TAG_HEX_LENGTH
    ) {
      const iv = Buffer.from(textParts[0], 'hex');
      const authTag = Buffer.from(textParts[1], 'hex');
      const encryptedText = Buffer.from(textParts[2], 'hex');
      // タグ長を固定する。hex でない文字が混ざると Buffer.from が短いタグを作り、
      // 短いタグは改ざん検知を弱める（Node は長さを指定しないと短いタグも受け入れる）
      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv, {
        authTagLength: GCM_TAG_BYTES,
      });
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
      return decrypted.toString('utf8');
    }

    // Legacy CBC format: iv(32 hex):ciphertext — written before the GCM migration
    if (textParts.length === 2) {
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
      const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
      return decrypted.toString('utf8');
    }

    // Not an encrypted format - legacy plaintext data, return as-is
    return text;
  } catch (error) {
    const err = error as Error;
    // eslint-disable-next-line no-console
    console.error('Decryption error', err.message);
    throw new Error('Decryption failed - data may be corrupted', { cause: error });
  }
}
