import Database, { type Database as BetterSqlite3Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 既定は本番/開発の status.db。テスト時は STATUS_DB_PATH で一時 DB に差し替える。
const dbPath = process.env.STATUS_DB_PATH || path.join(__dirname, '../../status.db');
const sqlite: BetterSqlite3Database = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Initialize default settings if they don't exist
const initSetting = sqlite.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
);
initSetting.run('redirect_enabled', 'true');
initSetting.run('redirect_auto_disabled', 'false');
initSetting.run('maintenance_mode', 'false');
initSetting.run('status_override', 'auto');
initSetting.run('last_health_status', 'unknown');
initSetting.run('consecutive_failures', '0');

// 30秒ごとのヘルスチェック書き込みで WAL が肥大化する（SQLite の PASSIVE
// autocheckpoint は書き込み位置を戻すだけで WAL ファイルを切り詰めない）。
// payroll-app が週次メンテで行っている wal_checkpoint(TRUNCATE) 相当を、
// scheduler を持たない本アプリでは内部インターバルで定期実行してディスクを切り詰める。
const WAL_CHECKPOINT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const checkpointTimer = setInterval(() => {
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // WAL チェックポイント失敗は非致命的（次回インターバルで再試行）
  }
}, WAL_CHECKPOINT_INTERVAL_MS);
checkpointTimer.unref();

export const db = drizzle(sqlite, { schema });
export { sqlite };
