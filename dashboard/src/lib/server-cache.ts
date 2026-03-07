/**
 * In-memory server cache for hot GET endpoints.
 * TTL in ms. Use for reference data and list responses that are safe to cache briefly.
 * For production at scale, replace with Redis (same key/ttl pattern).
 */

const cache = new Map<string, { value: unknown; expires: number }>();

const DEFAULT_TTL_MS = 60_000; // 60s

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expires) cache.delete(k);
    }
  }
}

export const CACHE_KEYS = {
  TICKETS_REFERENCE_DATA: "tickets:reference-data",
  TICKETS_AGENTS_LIST: "tickets:agents:list",
} as const;
