/** Client-side cache + deduped prefetch for rider surge catalog API. */

export type RiderSurgeCatalogSettings = {
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
};

export type RiderSurgeCatalog = {
  definitions: Record<string, unknown>[];
  timeSlots: Record<string, unknown>[];
  settings: RiderSurgeCatalogSettings;
  fetchedAt: number;
};

let cache: RiderSurgeCatalog | null = null;
let inflight: Promise<RiderSurgeCatalog> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function getRiderSurgeCatalogCache(): RiderSurgeCatalog | null {
  return cache;
}

export function subscribeRiderSurgeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function fetchRiderSurgeCatalog(opts?: {
  force?: boolean;
}): Promise<RiderSurgeCatalog> {
  if (opts?.force) {
    cache = null;
    inflight = null;
  }
  if (!opts?.force && cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/super-admin/geo/rider-surges", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load surge catalog");
    const next: RiderSurgeCatalog = {
      definitions: json.definitions ?? [],
      timeSlots: json.timeSlots ?? [],
      settings: json.settings ?? { maxTotalSurgeAmount: null, surgeWaitMaxOnly: false },
      fetchedAt: Date.now(),
    };
    cache = next;
    notify();
    return next;
  })()
    .catch((e) => {
      throw e;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function prefetchRiderSurgeCatalog(): void {
  void fetchRiderSurgeCatalog().catch(() => {
    /* warm cache; errors surfaced when panel loads */
  });
}

export function patchRiderSurgeCatalogCache(patch: Partial<RiderSurgeCatalog>): void {
  if (!cache) return;
  cache = { ...cache, ...patch, fetchedAt: Date.now() };
  notify();
}
