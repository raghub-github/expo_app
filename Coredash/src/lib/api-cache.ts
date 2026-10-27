import "server-only";

type Entry = { at: number; value: unknown; inflight?: Promise<unknown> };

const store = new Map<string, Entry>();

/** Short TTL cache + singleflight so slow dashboard queries don't stack and freeze the UI. */
export async function cachedQuery<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs && hit.value !== undefined && !hit.inflight) {
    return hit.value as T;
  }
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const inflight = run()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .catch((err) => {
      const prev = store.get(key);
      if (prev?.value !== undefined) {
        // Serve last good payload if a refresh fails.
        store.set(key, { at: prev.at, value: prev.value });
        return prev.value as T;
      }
      store.delete(key);
      throw err;
    });

  store.set(key, { at: hit?.at ?? 0, value: hit?.value, inflight });
  return inflight as Promise<T>;
}
