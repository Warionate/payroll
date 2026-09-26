import Database, { type Database as DatabaseType } from 'better-sqlite3';
import cluster from 'node:cluster';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import logger from './utils/logger.js';
import { notifyFatalProcessError } from './utils/discord.js';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// データベースファイルのパス (serverフォルダと同じ場所に作成)。
// DB_PATH 環境変数で上書き可能（統合テストがワーカーごとに一意な DB を使い、
// 共有 payroll.db への並列 migrate() 競合を避けるため — C-1）。未設定なら従来どおり。
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '..', 'payroll.db');

let db: Database.Database;

try {
  db = new Database(dbPath);
  logger.info('Connected to SQLite database (better-sqlite3)');

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  logger.info('WAL mode enabled');

  // Enable foreign key constraints
  db.pragma('foreign_keys = ON');
  logger.info('Foreign key constraints enabled');

  // Performance optimizations for ARM A1.Flex (4 OCPU / 24GB RAM)
  db.pragma('busy_timeout = 5000'); // 5 seconds busy timeout
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('temp_store = MEMORY'); // Use memory for temp storage
  db.pragma('mmap_size = 2147483648'); // 2GB memory-mapped I/O
  // WAL モードでは NORMAL が SQLite 推奨。FULL は commit ごとに fsync するため
  // 書き込みが直列化し、負荷テストでは書き込みスループットが約半分・I/O 待ちで
  // CPU を使い切れない状態だった（FULL 245/s → NORMAL 423/s、コアスケールも改善）。
  // NORMAL でも DB 破損は起きず、リスクは「電源断/OS クラッシュ時に直近数コミットを
  // 失う可能性」のみ。日次バックアップ＋自己申告データの再入力可能性を踏まえ妥当。
  db.pragma('synchronous = NORMAL');

  logger.info('Performance optimizations applied (ARM optimized)');
} catch (err) {
  const error = err as Error;
  logger.error('Could not connect to database', { error: error.message });
  process.exit(1);
}

// Drizzle ORM instance (type-safe query builder)
export const drizzleDb = drizzle(db!, { schema });

// Apply migrations (creates tables/indexes on fresh databases, skips on existing ones).
// In production the primary process imports this module (and therefore migrates)
// before forking — workers skip to avoid N processes racing on the same migration.
if (cluster.isWorker) {
  logger.info('Worker process — skipping migrations (already applied by primary)');
} else {
  try {
    // For existing databases: check if tables exist but migrations haven't been tracked yet
    const existingTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    const migrationsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
      .get();

    if (existingTable && !migrationsTable) {
      // Existing DB without migration tracking — mark initial migration as applied
      db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL,
            created_at NUMERIC
        )`);
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        '0000_daffy_wonder_man',
        Date.now(),
      );
      logger.info('Existing database detected — initial migration marked as applied');
    }

    migrate(drizzleDb, { migrationsFolder: path.resolve(__dirname, '../drizzle') });
    logger.info('Database migrations applied');
  } catch (err) {
    const error = err as Error;
    logger.error('Migration error', { error: error.message });
    // This failure happens before the scheduler and HTTP server exist, so no
    // other path reports it — without this the process just dies and PM2
    // restart-loops in silence. Bounded await: a dead webhook must not stall
    // the exit (same 3s pattern as the fatal handlers in index.ts).
    await Promise.race([
      notifyFatalProcessError({
        reason: 'DB マイグレーション失敗',
        details: `${error.message}\n${error.stack || ''}`,
      }),
      new Promise((resolve) => setTimeout(resolve, 3000).unref()),
    ]);
    process.exit(1);
  }
}

export default db! as DatabaseType;
