/**
 * Vitest setup file
 * Sets required environment variables BEFORE any test modules are loaded
 */

// Set test environment variables.
// ENCRYPTION_KEY must be 32 bytes (crypto.ts exits if not) — E-4.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testjwtsecret12345678901234567890';
process.env.NODE_ENV = 'test';
