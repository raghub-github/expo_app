/**
 * Acquire a lock; returns null if it's already held by someone else.
 * Caller is responsible for releasing — or use `withLock()` which does it.
 */
export declare function tryAcquireLock(key: string, ttlMs: number): Promise<{
    release: () => Promise<void>;
} | null>;
/**
 * Run `fn` exclusively. If the lock is held elsewhere, returns `null`
 * (callers can distinguish "ran" vs "skipped"). If `fn` throws, the lock
 * is still released.
 */
export declare function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null>;
//# sourceMappingURL=lock.d.ts.map