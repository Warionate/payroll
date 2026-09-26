import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Cache } from '../../../src/utils/cache.js';

describe('Cache', () => {
  let cache;

  beforeEach(() => {
    cache = new Cache({ maxSize: 5, defaultTTL: 1 }); // 1秒TTL、最大5エントリ
  });

  afterEach(() => {
    clearInterval(cache.cleanupTimer);
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should store complex objects', () => {
      const obj = { name: 'test', data: [1, 2, 3] };
      cache.set('obj', obj);
      expect(cache.get('obj')).toEqual(obj);
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should increment misses stat on cache miss', () => {
      cache.get('nonexistent');
      expect(cache.stats.misses).toBe(1);
    });

    it('should increment hits stat on cache hit', () => {
      cache.set('key', 'value');
      cache.get('key');
      expect(cache.stats.hits).toBe(1);
    });

    it('should increment sets stat on set', () => {
      cache.set('key', 'value');
      expect(cache.stats.sets).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('expiring', 'value', 0.1); // 100ms TTL
      expect(cache.get('expiring')).toBe('value');

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cache.get('expiring')).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when max size exceeded', () => {
      // Use a separate cache with size 2
      const smallCache = new Cache({ maxSize: 2, defaultTTL: 60 });

      smallCache.set('first', 1);
      smallCache.set('second', 2);
      // Cache is now full (size=2)

      // Adding third entry should trigger eviction
      smallCache.set('third', 3);

      // Cache should still be at max size
      expect(smallCache.cache.size).toBe(2);
      // 'first' should have been evicted (LRU)
      expect(smallCache.cache.has('first')).toBe(false);
      expect(smallCache.cache.has('second')).toBe(true);
      expect(smallCache.cache.has('third')).toBe(true);

      clearInterval(smallCache.cleanupTimer);
    });
  });

  describe('del', () => {
    it('should delete a specific key', () => {
      cache.set('key', 'value');
      cache.del('key');
      expect(cache.get('key')).toBeNull();
    });
  });

  describe('invalidatePrefix', () => {
    it('should invalidate all keys with given prefix', () => {
      cache.set('user:1:profile', 'data1');
      cache.set('user:1:settings', 'data2');
      cache.set('user:2:profile', 'data3');

      const count = cache.invalidatePrefix('user:1');

      expect(count).toBe(2);
      expect(cache.get('user:1:profile')).toBeNull();
      expect(cache.get('user:1:settings')).toBeNull();
      expect(cache.get('user:2:profile')).toBe('data3');
    });
  });

  describe('invalidateUser', () => {
    it('should invalidate all cache for a specific user', () => {
      cache.set('user:42:data', 'value');
      cache.set('user:42:other', 'value2');
      cache.set('user:99:data', 'value3');

      cache.invalidateUser(42);

      expect(cache.get('user:42:data')).toBeNull();
      expect(cache.get('user:42:other')).toBeNull();
      expect(cache.get('user:99:data')).toBe('value3');
    });
  });

  describe('flush', () => {
    it('should clear all cache entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.flush();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(2);
      expect(stats.size).toBe(2);
      expect(stats.hitRate).toBe('66.7%');
    });

    it('should handle zero requests gracefully', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('0%');
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      cache.set('short', 'value', 0.05); // 50ms
      cache.set('long', 'value', 10); // 10s

      await new Promise((resolve) => setTimeout(resolve, 100));
      cache.cleanup();

      expect(cache.cache.has('short')).toBe(false);
      expect(cache.cache.has('long')).toBe(true);
    });
  });
});
