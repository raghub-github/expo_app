/**
 * Commission resolver cache — Redis backed, multi-replica safe.
 *
 * Read path stays sync from the resolver's POV (returns null if no cache or
 * Redis unreachable). The resolver always falls back to a fresh DB query so
 * Redis being down degrades latency but never correctness.
 *
 * Layered design:
 *   - Process-local Map gives microsecond hit on hot stores within ONE request
 *     hop. Bounded TTL = 30 s so a stale value never lives long.
 *   - Redis is the source of truth for cross-replica consistency. TTL 5 min.
 *
 * Eviction contract: any mutator that changes a store's effective commission
 * (admin override write, subscription activation, default change) must call
 * `invalidateStore` — this evicts both layers, including across replicas via
 * Redis DEL.
 *
 * Keys:
 *   cache:commission:store:{id}
 */
import type { ResolvedCommission } from "./commission.resolver.js";
import { cacheGet, cacheSet, cacheDel } from "@gatimitra/redis";

const REDIS_TTL_SEC = 5 * 60;
const LOCAL_TTL_MS = 30_000;
const LOCAL_MAX_ENTRIES = 5000;

type LocalEntry = { value: ResolvedCommission; expiresAt: number };
const localStore = new Map<number, LocalEntry>();

function localGet(storeId: number): ResolvedCommission | null {
  const e = localStore.get(storeId);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    localStore.delete(storeId);
    return null;
  }
  // touch for LRU
  localStore.delete(storeId);
  localStore.set(storeId, e);
  return e.value;
}

function localSet(storeId: number, value: ResolvedCommission): void {
  if (localStore.size >= LOCAL_MAX_ENTRIES) {
    const oldest = localStore.keys().next().value;
    if (oldest !== undefined) localStore.delete(oldest);
  }
  localStore.set(storeId, { value, expiresAt: Date.now() + LOCAL_TTL_MS });
}

function redisKey(storeId: number): string {
  return `commission:store:${storeId}`;
}

/**
 * Returns the cached resolved commission, or null on miss / any error.
 * Resolver is responsible for repopulating on miss; this function never
 * throws so a transient Redis outage degrades latency only.
 */
export async function getCached(storeId: number): Promise<ResolvedCommission | null> {
  const local = localGet(storeId);
  if (local) return local;
  try {
    const remote = await cacheGet<ResolvedCommission>(redisKey(storeId));
    if (remote) {
      localSet(storeId, remote);
      return remote;
    }
  } catch {
    // Redis down — fall through to null so caller re-fetches from DB.
  }
  return null;
}

export async function setCached(
  storeId: number,
  value: ResolvedCommission,
): Promise<void> {
  localSet(storeId, value);
  try {
    await cacheSet(redisKey(storeId), value, REDIS_TTL_SEC);
  } catch {
    /* tolerated */
  }
}

export async function invalidateStore(storeId: number): Promise<void> {
  localStore.delete(storeId);
  try {
    await cacheDel(redisKey(storeId));
  } catch {
    /* tolerated */
  }
}

/**
 * Used when the global default changes — every store could be affected.
 * We can't scan-and-delete every Redis key cheaply, so we bump a generation
 * counter that the resolver mixes into its key. Existing keys orphan and
 * expire via TTL within 5 minutes.
 *
 * For now we just clear the local map; Redis stale entries expire naturally.
 * A future enhancement is the generation-counter trick if 5-min staleness
 * after a default change is too much.
 */
export function invalidateAll(): void {
  localStore.clear();
}
