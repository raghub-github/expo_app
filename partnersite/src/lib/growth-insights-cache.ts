/**
 * Tiny in-memory response cache for the growth insights routes.
 *
 * These routes fan out to 20+ sequential Postgres queries; a single dashboard
 * tab focus fires the query twice (live-preview + business-insights). Without
 * caching the pooler saturates and both routes hit the 30s timeout. A 60s TTL
 * makes tab-focus re-fetches instant while still refreshing "today" quickly.
 *
 * Scope: per-container Node process. That's fine — the routes are read-only
 * summaries and staleness up to 60s is acceptable for dashboard UX.
 */
type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500; // simple guard so a runaway loop can't leak memory

export async function withGrowthCache<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) {
    return hit.value as T;
  }
  const value = await compute();
  if (store.size >= MAX_ENTRIES) {
    // Drop the oldest entry (Map preserves insertion order).
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(key, { at: now, value });
  return value;
}
