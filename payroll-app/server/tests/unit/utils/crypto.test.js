import { describe, it, expect, beforeAll } from 'vitest';

// Set required env vars before importing
beforeAll(() => {
  process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
  process.env.JWT_SECRET = '12345678901234567890123456789012';
});

describe('crypto utils', () => {
  let encrypt, decrypt;

  beforeAll(async () => {
    const crypto = await import('../../../src/utils/crypto.js');
    encrypt = crypto.encrypt;
    decrypt = crypto.decrypt;
  });

  describe('encrypt', () => {
    it('should encrypt a string value', () => {
      const result = encrypt('1500');
      expect(result).toBeDefined();
      expect(result).not.toBe('1500');
      // Encrypted format (AES-256-GCM): iv:authTag:ciphertext (hex:hex:hex)
      expect(result).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
    });

    it('should encrypt numeric values', () => {
      const result = encrypt(1500);
      expect(result).toBeDefined();
      expect(result).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
    });

    it('should return null for null input', () => {
      const result = encrypt(null);
      expect(result).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      // encrypt returns early without explicit return for undefined
      const result = encrypt(undefined);
      expect(result).toBeUndefined();
    });

    it('should generate different ciphertexts for same plaintext (due to random IV)', () => {
      const result1 = encrypt('test');
      const result2 = encrypt('test');
      expect(result1).not.toBe(result2);
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string back to original', () => {
      const original = '1500';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should decrypt encrypted numbers correctly', () => {
      const original = 2500;
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(String(original));
    });

    it('should return null for null input', () => {
      const result = decrypt(null);
      expect(result).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      const result = decrypt(undefined);
      expect(result).toBeUndefined();
    });

    it('should return original value for non-encrypted format (legacy data)', () => {
      // decrypt returns original data if it doesn't match encrypted format
      const result = decrypt('invalid-format');
      expect(result).toBe('invalid-format');
    });

    it('should throw for corrupted data (with colon but invalid IV)', () => {
      // decrypt throws on decryption failure to prevent silently returning corrupted data
      expect(() => decrypt('abc123:def456')).toThrow('Decryption failed - data may be corrupted');
    });

    it('should throw for tampered GCM ciphertext (auth tag mismatch)', () => {
      const encrypted = encrypt('secret-value');
      const parts = encrypted.split(':');
      // Flip a character in the ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -1)}${parts[2].endsWith('0') ? '1' : '0'}`;
      expect(() => decrypt(tampered)).toThrow('Decryption failed - data may be corrupted');
    });

    it('should decrypt legacy AES-256-CBC data (iv:ciphertext format)', async () => {
      const nodeCrypto = await import('node:crypto');
      const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8');
      const iv = nodeCrypto.randomBytes(16);
      const cipher = nodeCrypto.createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update('legacy-data', 'utf8'), cipher.final()]);
      const legacyFormat = iv.toString('hex') + ':' + encrypted.toString('hex');

      expect(decrypt(legacyFormat)).toBe('legacy-data');
    });

    it('should return plaintext with multiple colons as-is (legacy time strings)', () => {
      expect(decrypt('10:30:45')).toBe('10:30:45');
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should correctly round-trip various values', () => {
      const testCases = ['hello', '12345', '日本語テスト', '', '0', 'special!@#$%'];

      for (const original of testCases) {
        const encrypted = encrypt(original);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(original);
      }
    });
  });
});
