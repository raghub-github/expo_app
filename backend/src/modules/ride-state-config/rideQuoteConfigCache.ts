/**
 * Short TTL in-process cache for near-static ride quote config
 * (vehicle limits, customer slabs, payout wait fields, fallback slabs).
 * Do not cache nearby rider GPS here.
 */

type Entry<T> = { value: T; expiresAt: number };

const DEFAULT_TTL_MS = 90_000;
const MAX_ENTRIES = 400;

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | null {
  const e = store.get(key);
  if (!e || Date.now() > e.expiresAt) {
    if (e) store.delete(key);
    return null;
  }
  return e.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey != null) store.delete(firstKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cachedRideQuoteValue<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit != null) return hit;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = loader()
    .then((value) => {
      setCached(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

export function clearRideQuoteConfigCache(): void {
  store.clear();
  inflight.clear();
}
