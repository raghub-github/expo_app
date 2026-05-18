/**
 * In-process LRU cache for resolveStoreCommission().
 *
 * Why in-process and not Redis (for now):
 * commission rules change rarely, the hot path is every menu render, and an
 * in-process Map keyed by storeId with a TTL gives us microsecond reads. Redis
 * can be added later — the eviction contract (`invalidateStore`) is the same.
 * Any process that mutates rules must call `invalidateStore` so this node
 * doesn't serve stale data. Cross-node invalidation is out of scope here;
 * the TTL bounds the staleness window.
 */

import type { ResolvedCommission } from "./commission.resolver.js";

const TTL_MS = 5 * 60 * 1000; // 5 min — bounded staleness across nodes
const MAX_ENTRIES = 5000;

type Entry = { value: ResolvedCommission; expiresAt: number };

const store = new Map<number, Entry>();

export function getCached(storeId: number): ResolvedCommission | null {
  const e = store.get(storeId);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    store.delete(storeId);
    return null;
  }
  // LRU touch
  store.delete(storeId);
  store.set(storeId, e);
  return e.value;
}

export function setCached(storeId: number, value: ResolvedCommission): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest (Map preserves insertion order)
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(storeId, { value, expiresAt: Date.now() + TTL_MS });
}

export function invalidateStore(storeId: number): void {
  store.delete(storeId);
}

/** Used when the global default changes — every store could be affected. */
export function invalidateAll(): void {
  store.clear();
}
