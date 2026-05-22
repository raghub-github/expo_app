/**
 * Typed JSON cache helpers over Redis.
 *
 * Semantics:
 *   - Values are stored as JSON. Use `cacheGet<T>` to type the result.
 *   - `cacheGetOrSet` provides a single-flight stampede-safe pattern: if the
 *     key is empty, only one caller computes the value and others wait
 *     for the result via a short polling loop.
 *   - All keys live under a `cache:` namespace so they're easy to scan / FLUSH.
 *
 * NOT included here (intentional):
 *   - LFU/LRU eviction tuning (Redis handles that via maxmemory-policy)
 *   - Tag-based invalidation (we don't need it yet; add when the first
 *     real cache-invalidation pain happens)
 */
import { getRedis } from "./client.js";

const NS = "cache:";

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const raw = await redis.get(NS + key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void> {
  if (ttlSec <= 0) throw new Error("cacheSet: ttlSec must be > 0");
  const redis = getRedis();
  await redis.set(NS + key, JSON.stringify(value), "EX", ttlSec);
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(NS + key);
}

/**
 * Optional stampede protection: only the first caller for an empty key
 * runs `compute`; others wait up to `maxWaitMs` polling at 50ms intervals.
 * If Redis is unreachable we fall through to `compute()` directly so the
 * caller never blocks forever.
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSec: number,
  compute: () => Promise<T>,
  opts?: { maxWaitMs?: number },
): Promise<T> {
  const cached = await cacheGet<T>(key).catch(() => null);
  if (cached != null) return cached;

  const lockKey = `${NS}lock:${key}`;
  const redis = getRedis();
  const wonLock = await redis.set(lockKey, "1", "PX", 5_000, "NX").catch(() => null);

  if (wonLock === "OK") {
    try {
      const fresh = await compute();
      await cacheSet(key, fresh, ttlSec).catch(() => undefined);
      return fresh;
    } finally {
      await redis.del(lockKey).catch(() => undefined);
    }
  }

  // Lost the race — wait briefly for the winner to populate the cache.
  const maxWait = opts?.maxWaitMs ?? 1500;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 50));
    const reread = await cacheGet<T>(key).catch(() => null);
    if (reread != null) return reread;
  }
  // Cache miss + waited too long → compute ourselves (no SETNX this time).
  const fallback = await compute();
  await cacheSet(key, fallback, ttlSec).catch(() => undefined);
  return fallback;
}
