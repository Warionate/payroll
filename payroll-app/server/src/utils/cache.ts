import cluster from 'node:cluster';
import type { Request, Response, NextFunction } from 'express';

interface CacheItem {
  value: unknown;
  expiry: number;
  hits: number;
  lastAccess: number;
}

interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
}

type CacheInvalidateOp = 'del' | 'invalidatePrefix' | 'flush';

/** クラスタワーカー間でやり取りする無効化メッセージ */
export interface CacheInvalidateMessage {
  __payrollCacheInvalidate: true;
  op: CacheInvalidateOp;
  arg?: string;
}

export function isCacheInvalidateMessage(msg: unknown): msg is CacheInvalidateMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as CacheInvalidateMessage).__payrollCacheInvalidate === true
  );
}

/**
 * 軽量インメモリキャッシュ（プロセスローカル）
 *
 * 本番のクラスタ構成ではワーカーごとに独立したインスタンスになるため、
 * del / invalidatePrefix / flush は publisher 経由で他ワーカーにも
 * ブロードキャストされる（プライマリがリレー、applyRemote で適用）。
 */
export class Cache {
  private cache: Map<string, CacheItem>;
  private maxSize: number;
  private defaultTTL: number;
  private stats: CacheStats;
  private cleanupTimer: ReturnType<typeof setInterval>;
  private publisher: ((op: CacheInvalidateOp, arg?: string) => void) | null = null;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 500;
    this.defaultTTL = options.defaultTTL || 300; // 5分（秒）

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };

    // 定期クリーンアップ（1分ごと）
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /** キャッシュから取得 */
  get(key: string): unknown {
    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    item.hits++;
    item.lastAccess = Date.now();
    this.stats.hits++;
    return item.value;
  }

  /** キャッシュに設定 */
  set(key: string, value: unknown, ttlSeconds: number = this.defaultTTL): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, {
      value,
      expiry,
      hits: 0,
      lastAccess: Date.now(),
    });
    this.stats.sets++;
  }

  /** 他ワーカーへの無効化伝播ハンドラを設定 */
  setPublisher(fn: (op: CacheInvalidateOp, arg?: string) => void): void {
    this.publisher = fn;
  }

  /** キャッシュから削除 */
  del(key: string): void {
    this.cache.delete(key);
    this.publisher?.('del', key);
  }

  /** プレフィックスで始まるキーを無効化 */
  invalidatePrefix(prefix: string): number {
    const count = this.invalidatePrefixLocal(prefix);
    this.publisher?.('invalidatePrefix', prefix);
    return count;
  }

  /** ユーザー関連のキャッシュを無効化 */
  invalidateUser(userId: number): number {
    return this.invalidatePrefix(`user:${userId}`);
  }

  /** 全キャッシュをクリア */
  flush(): void {
    this.cache.clear();
    this.publisher?.('flush');
  }

  /** 他ワーカーから届いた無効化を適用（再ブロードキャストしない） */
  applyRemoteInvalidate(op: CacheInvalidateOp, arg?: string): void {
    switch (op) {
      case 'del':
        if (arg !== undefined) this.cache.delete(arg);
        break;
      case 'invalidatePrefix':
        if (arg !== undefined) this.invalidatePrefixLocal(arg);
        break;
      case 'flush':
        this.cache.clear();
        break;
    }
  }

  private invalidatePrefixLocal(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /** 期限切れエントリをクリーンアップ */
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /** LRU方式で古いエントリを削除 */
  evictLRU(): void {
    let oldest: CacheItem | null = null;
    let oldestKey: string | null = null;

    for (const [key, item] of this.cache.entries()) {
      if (!oldest || item.lastAccess < oldest.lastAccess) {
        oldest = item;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /** 統計情報を取得 */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`,
    };
  }
}

// シングルトンインスタンス
const cache = new Cache({ maxSize: 500, defaultTTL: 300 });

// クラスタワーカーの場合: 無効化をプライマリ経由で全ワーカーに伝播する。
// （プライマリ側のリレーは index.ts を参照）
if (cluster.isWorker && typeof process.send === 'function') {
  cache.setPublisher((op, arg) => {
    try {
      process.send?.({ __payrollCacheInvalidate: true, op, arg } satisfies CacheInvalidateMessage);
    } catch {
      // IPC チャネルが閉じている場合（シャットダウン中など）は無視
    }
  });

  process.on('message', (msg: unknown) => {
    if (isCacheInvalidateMessage(msg)) {
      cache.applyRemoteInvalidate(msg.op, msg.arg);
    }
  });
}

interface CacheMiddlewareOptions {
  keyGenerator?: (req: Request) => string;
  ttl?: number;
}

/**
 * キャッシュミドルウェア生成
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const { keyGenerator = (req: Request) => `${req.method}:${req.originalUrl}`, ttl = 300 } =
    options;

  return (req: Request, res: Response, next: NextFunction) => {
    // GETリクエストのみキャッシュ
    if (req.method !== 'GET') {
      return next();
    }

    const key = keyGenerator(req);
    const cached = cache.get(key);

    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // レスポンスをインターセプト
    const originalJson = res.json.bind(res);
    res.json = (data: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, data, ttl);
      }
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

/**
 * ユーザースコープのキャッシュキー生成
 */
export function userCacheKey(prefix: string) {
  return (req: Request) => `user:${req.user?.id}:${prefix}`;
}

export default cache;
