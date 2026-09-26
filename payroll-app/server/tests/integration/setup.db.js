/**
 * Integration-test DB isolation (C-1).
 *
 * Runs before each integration test file (setupFiles). Assigns each vitest
 * worker its own SQLite database so the parallel `migrate()` calls in db.ts no
 * longer race on the shared server/payroll.db — the source of the known
 * intermittent failure right after a new migration is added.
 *
 * The real payroll.db path is untouched when DB_PATH is already set (it never is
 * in production, so prod resolution is unchanged).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..', '..');

if (!process.env.DB_PATH) {
  const workerId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || '1';
  process.env.DB_PATH = path.join(serverDir, `payroll.test.${workerId}.db`);
}
