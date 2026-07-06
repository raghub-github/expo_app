/**
 * In-memory cache for growth insight routes (live-preview + business-insights).
 * Includes single-flight dedup and stale fallback so tab-focus double-fetches and
 * slow cold queries don't surface 504s to the UI.
 */
type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

export function peekGrowthCache<T>(key: string, maxStaleMs = 10 * 60_000): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxStaleMs) return null;
  return hit.value as T;
}

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

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const run = (async () => {
    try {
      const value = await compute();
      if (store.size >= MAX_ENTRIES) {
        const firstKey = store.keys().next().value;
        if (firstKey !== undefined) store.delete(firstKey);
      }
      store.set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      if (hit) return hit.value as T;
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, run);
  return run;
}
