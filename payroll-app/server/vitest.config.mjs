import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Exclude integration tests which require env vars at module load time
    // Run integration tests locally with: npm test -- --include='**/*.integration.test.js'
    include: ['tests/unit/**/*.test.{js,ts}'],
    exclude: [],
    setupFiles: ['./vitest.setup.js'],
    env: {
      // 32 bytes required by crypto.ts (旧値は 30 文字で、crypto.ts を import する
      // 新規テストを書くと process.exit(1) する罠だった — E-4)
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      JWT_SECRET: 'testjwtsecret12345678901234567890',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['**/*.js'],
      exclude: ['**/*.test.js', 'logs/**', 'uploads/**', 'migrations/**', 'tools/**'],
    },
  },
});
