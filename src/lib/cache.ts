/**
 * Lightweight, zero-dependency in-memory cache and request deduplication manager.
 * - Deduplicates concurrent in-flight promises (prevents 20+ simultaneous requests hitting Supabase).
 * - Provides short-lived stale-while-revalidate caching for rarely-changing datasets (stages, suppliers, items).
 * - Allows explicit invalidation when records are created, updated, or deleted.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cacheStore = new Map<string, CacheEntry<unknown>>();
const inFlightPromises = new Map<string, Promise<unknown>>();

// Default TTLs in milliseconds
export const CACHE_TTL = {
  STAGES: 10 * 60 * 1000,    // 10 minutes (stages almost never change)
  SUPPLIERS: 2 * 60 * 1000,  // 2 minutes
  ITEMS: 2 * 60 * 1000,      // 2 minutes
  SHORT: 30 * 1000,          // 30 seconds
} as const;

/**
 * Executes `fetcher` with in-flight deduplication and optional TTL caching.
 * If a request with `key` is already in flight, all callers await the same single promise.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 0
): Promise<T> {
  // 1. Check TTL cache if enabled
  if (ttlMs > 0) {
    const entry = cacheStore.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }
  }

  // 2. Check if identical request is currently in-flight
  const existingPromise = inFlightPromises.get(key) as Promise<T> | undefined;
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Initiate request and register promise for deduplication
  const promise = fetcher()
    .then((data) => {
      if (ttlMs > 0) {
        cacheStore.set(key, {
          data,
          timestamp: Date.now(),
          ttl: ttlMs,
        });
      }
      return data;
    })
    .finally(() => {
      inFlightPromises.delete(key);
    });

  inFlightPromises.set(key, promise);
  return promise;
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Manually update the cache entry for a given key.
 */
export function setCacheData<T>(key: string, data: T, ttlMs: number): void {
  cacheStore.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}
