/**
 * Integration-test DB cleanup (C-1).
 *
 * Removes any per-worker test databases (payroll.test.*.db and their -wal/-shm
 * sidecars) before and after the integration run, so each run starts from a
 * freshly migrated schema and no stale test DBs linger in the repo.
 */
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..', '..');

const TEST_DB_RE = /^payroll\.test\..*\.db(-wal|-shm)?$/;

function cleanup() {
  for (const file of readdirSync(serverDir)) {
    if (!TEST_DB_RE.test(file)) continue;
    try {
      rmSync(path.join(serverDir, file), { force: true });
    } catch {
      // Best-effort: on Windows the SQLite handle may still be held as the
      // worker exits (EBUSY). The next run's setup() deletes it once that
      // process is gone. Test DBs are gitignored, so a lingering file is fine.
    }
  }
}

export function setup() {
  cleanup();
}

export function teardown() {
  cleanup();
}
