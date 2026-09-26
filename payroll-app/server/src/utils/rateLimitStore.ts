/**
 * SQLite-backed store for express-rate-limit.
 *
 * 本番はクラスタ（CPU 数分のワーカー）で動くため、デフォルトの MemoryStore だと
 * 実効上限が「設定値 × ワーカー数」になる。ログイン等のセキュリティ目的の
 * リミッターはこのストアでプロセス間共有する。
 *
 * カウントは揮発性の運用データなので、本体の payroll.db ではなく専用の
 * rate_limits.db に保存する（バックアップ・マイグレーション対象外）。
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Options, Store, IncrementResponse, ClientRateLimitInfo } from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'rate_limits.db');
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const BUSY_TIMEOUT_MS = 5000;
/** チェックポイント時だけ適用する短い待ち時間（取れなければ次の10分に回す） */
const CHECKPOINT_BUSY_TIMEOUT_MS = 200;

let db: Database.Database | null = null;

/**
 * WAL を TRUNCATE モードでチェックポイントする。
 *
 * better-sqlite3 は同期 API なので、本番のように複数ワーカーが同じ DB を
 * 開いていると TRUNCATE がロック待ちに入り、通常の busy_timeout (5s) の間
 * そのワーカーのイベントループを丸ごとブロックしてしまう。切り詰めは
 * 10 分ごとに何度でも再試行できる性質のものなので、待ち時間を一時的に
 * 詰めて「すぐ取れなければ諦める」挙動にする。
 */
function checkpointWal(): void {
  if (!db) return;
  try {
    db.pragma(`busy_timeout = ${CHECKPOINT_BUSY_TIMEOUT_MS}`);
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  }
}

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
    db.pragma('synchronous = NORMAL');
    db.exec(`CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    )`);

    // 期限切れ行の定期削除（プロセスごとに走っても冪等）。
    // 本番の WAL 切り詰めも実質ここが担う（checkpointRateLimitDb() の JSDoc 参照）。
    const timer = setInterval(() => {
      try {
        db?.prepare('DELETE FROM rate_limit_hits WHERE reset_at <= ?').run(Date.now());
      } catch {
        // cleanup failure is non-critical
      }
      // DELETE の失敗で checkpoint がスキップされないよう try/catch を分ける
      try {
        checkpointWal();
      } catch {
        // checkpoint failure is non-critical
      }
    }, CLEANUP_INTERVAL_MS);
    timer.unref();
  }
  return db;
}

interface HitRow {
  count: number;
  reset_at: number;
}

export class SqliteRateLimitStore implements Store {
  /** Keys written by this store are shared across processes */
  localKeys = false;

  private keyPrefix: string;
  private windowMs = 60 * 1000;

  constructor(prefix: string) {
    this.keyPrefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  get(key: string): ClientRateLimitInfo | undefined {
    const row = getDb()
      .prepare('SELECT count, reset_at FROM rate_limit_hits WHERE key = ?')
      .get(this.fullKey(key)) as HitRow | undefined;
    if (!row || row.reset_at <= Date.now()) return undefined;
    return { totalHits: row.count, resetTime: new Date(row.reset_at) };
  }

  increment(key: string): IncrementResponse {
    const now = Date.now();
    // Atomic upsert: start a new window when the previous one has expired
    const row = getDb()
      .prepare(
        `INSERT INTO rate_limit_hits (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
           reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
         RETURNING count, reset_at`,
      )
      .get(this.fullKey(key), now + this.windowMs, now, now) as HitRow;

    return { totalHits: row.count, resetTime: new Date(row.reset_at) };
  }

  decrement(key: string): void {
    getDb()
      .prepare('UPDATE rate_limit_hits SET count = MAX(count - 1, 0) WHERE key = ?')
      .run(this.fullKey(key));
  }

  resetKey(key: string): void {
    getDb().prepare('DELETE FROM rate_limit_hits WHERE key = ?').run(this.fullKey(key));
  }

  resetAll(): void {
    getDb().prepare('DELETE FROM rate_limit_hits WHERE key LIKE ?').run(`${this.keyPrefix}:%`);
  }
}

/**
 * 本番（クラスタ）のみ共有ストアを返す。開発・テストでは undefined を返し、
 * express-rate-limit のデフォルト MemoryStore を使う（テストの独立性を保つため）。
 */
export function createSqliteRateLimitStore(prefix: string): SqliteRateLimitStore | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;
  return new SqliteRateLimitStore(prefix);
}

/**
 * rate_limits.db の WAL をチェックポイント(TRUNCATE)する。
 *
 * **本番ではこの関数は常に no-op である。** scheduler.ts の週次メンテは primary
 * プロセスで動くが、rate_limits.db を実際に開くのはリクエストを処理する worker
 * だけで、primary の `db` は null のまま先頭で return するため。
 * 本番の実際の切り詰めは getDb() 内の CLEANUP_INTERVAL_MS タイマー
 * （db を開いた worker 自身で動く）が担う。
 *
 * 開発・テストの単一プロセス構成では正しく動くので残してある。
 */
export function checkpointRateLimitDb(): void {
  if (!db) return;
  try {
    checkpointWal();
  } catch {
    // WAL チェックポイント失敗は非致命的（次回メンテで再試行）
  }
}
