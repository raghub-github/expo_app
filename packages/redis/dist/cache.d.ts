export declare function cacheGet<T>(key: string): Promise<T | null>;
export declare function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void>;
export declare function cacheDel(key: string): Promise<void>;
/**
 * Optional stampede protection: only the first caller for an empty key
 * runs `compute`; others wait up to `maxWaitMs` polling at 50ms intervals.
 * If Redis is unreachable we fall through to `compute()` directly so the
 * caller never blocks forever.
 */
export declare function cacheGetOrSet<T>(key: string, ttlSec: number, compute: () => Promise<T>, opts?: {
    maxWaitMs?: number;
}): Promise<T>;
//# sourceMappingURL=cache.d.ts.map