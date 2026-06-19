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
export async function cacheGet(key) {
    try {
        const redis = getRedis();
        const raw = await redis.get(NS + key);
        if (raw == null)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    catch {
        return null;
    }
}
export async function cacheSet(key, value, ttlSec) {
    if (ttlSec <= 0)
        throw new Error("cacheSet: ttlSec must be > 0");
    try {
        const redis = getRedis();
        await redis.set(NS + key, JSON.stringify(value), "EX", ttlSec);
    }
    catch {
        /* Redis optional / unavailable — caller falls back to compute path. */
    }
}
export async function cacheDel(key) {
    try {
        const redis = getRedis();
        await redis.del(NS + key);
    }
    catch {
        /* tolerated */
    }
}
/**
 * Optional stampede protection: only the first caller for an empty key
 * runs `compute`; others wait up to `maxWaitMs` polling at 50ms intervals.
 * If Redis is unreachable we fall through to `compute()` directly so the
 * caller never blocks forever.
 */
export async function cacheGetOrSet(key, ttlSec, compute, opts) {
    const cached = await cacheGet(key);
    if (cached != null)
        return cached;
    let redis;
    try {
        redis = getRedis();
    }
    catch {
        return compute();
    }
    const lockKey = `${NS}lock:${key}`;
    const wonLock = await redis.set(lockKey, "1", "PX", 5_000, "NX").catch(() => null);
    if (wonLock === "OK") {
        try {
            const fresh = await compute();
            await cacheSet(key, fresh, ttlSec);
            return fresh;
        }
        finally {
            await redis.del(lockKey).catch(() => undefined);
        }
    }
    const maxWait = opts?.maxWaitMs ?? 1500;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        await new Promise((r) => setTimeout(r, 50));
        const reread = await cacheGet(key);
        if (reread != null)
            return reread;
    }
    const fallback = await compute();
    await cacheSet(key, fallback, ttlSec);
    return fallback;
}
//# sourceMappingURL=cache.js.map