/**
 * Distributed lock helpers built on Redis SET NX + Lua-based release.
 *
 * Why not the `redlock` library:
 *   - One file, zero extra deps.
 *   - We only need single-instance Redis semantics (no quorum across nodes)
 *     because our deployment has one Redis. Move to the formal Redlock
 *     algorithm if Redis becomes clustered.
 *   - Release is via Lua CAS so a process that lost the lock (TTL expired)
 *     can't accidentally release the next owner's lock.
 *
 * Usage:
 *   await withLock("tick:store-schedule", 40_000, async () => {
 *     // critical section — only one worker runs this at a time
 *   });
 */
import { randomBytes } from "node:crypto";
import { getRedis } from "./client.js";
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;
/**
 * Acquire a lock; returns null if it's already held by someone else.
 * Caller is responsible for releasing — or use `withLock()` which does it.
 */
export async function tryAcquireLock(key, ttlMs) {
    if (!key || ttlMs <= 0)
        throw new Error("tryAcquireLock: invalid key/ttl");
    const redis = getRedis();
    const token = randomBytes(16).toString("hex");
    const fullKey = `lock:${key}`;
    // SET with NX (only set if not exists) + PX (TTL in ms). Atomic.
    const ok = await redis.set(fullKey, token, "PX", ttlMs, "NX");
    if (ok !== "OK")
        return null;
    return {
        release: async () => {
            try {
                await redis.eval(RELEASE_SCRIPT, 1, fullKey, token);
            }
            catch {
                /* best-effort */
            }
        },
    };
}
/**
 * Run `fn` exclusively. If the lock is held elsewhere, returns `null`
 * (callers can distinguish "ran" vs "skipped"). If `fn` throws, the lock
 * is still released.
 */
export async function withLock(key, ttlMs, fn) {
    const handle = await tryAcquireLock(key, ttlMs);
    if (!handle)
        return null;
    try {
        return await fn();
    }
    finally {
        await handle.release();
    }
}
//# sourceMappingURL=lock.js.map