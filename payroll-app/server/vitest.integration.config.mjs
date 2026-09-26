import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Include integration tests only
    include: ['tests/integration/**/*.integration.test.{js,ts}'],
    exclude: [], // No exclusions
    // setup.db.js must run so each worker resolves its own DB_PATH before db.ts
    // is imported; globalSetup wipes leftover per-worker test DBs (C-1).
    setupFiles: ['./vitest.setup.js', './tests/integration/setup.db.js'],
    globalSetup: ['./tests/integration/globalSetup.db.js'],
    env: {
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      JWT_SECRET: 'testjwtsecret12345678901234567890',
      NODE_ENV: 'test',
    },
  },
});
