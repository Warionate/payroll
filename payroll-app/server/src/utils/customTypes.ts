/**
 * Drizzle custom column types for transparent AES-256-CBC encryption/decryption.
 *
 * Usage in schema:
 *   import { encryptedText, encryptedInteger } from './customTypes.js';
 *   export const rates = sqliteTable('rates', {
 *     wage_1_student: encryptedInteger('wage_1_student'),
 *     // ...
 *   });
 *
 * The value is automatically encrypted on INSERT/UPDATE and decrypted on SELECT.
 * Database column stores the cipher text as plain TEXT.
 */
import { customType } from 'drizzle-orm/sqlite-core';
import { encrypt, decrypt } from '../utils/crypto.js';

/**
 * Encrypted TEXT column.
 * Stores ciphertext in the DB; exposes plaintext to the application layer.
 */
export const encryptedText = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'text';
  },
  fromDriver(value: string): string {
    const decrypted = decrypt(value);
    return decrypted ?? value;
  },
  toDriver(value: string): string {
    const encrypted = encrypt(value);
    return encrypted ?? value;
  },
});

/**
 * Encrypted INTEGER column.
 * Stores the number as encrypted text in the DB; exposes a number to the app.
 */
export const encryptedInteger = customType<{
  data: number;
  driverData: string;
}>({
  dataType() {
    return 'text';
  },
  fromDriver(value: string): number {
    const decrypted = decrypt(value);
    return Number(decrypted ?? value);
  },
  toDriver(value: number): string {
    const encrypted = encrypt(String(value));
    return encrypted ?? String(value);
  },
});
