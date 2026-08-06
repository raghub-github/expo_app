export type RiderActivityLogApiRow = {
  id: number;
  createdAt: string;
  provider: string;
  trackingOrderId: string;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  status: string;
  updatedBy: string;
  reason: string | null;
  distanceCxKm: number | null;
  distanceMxKm: number | null;
  trackingUrl: string | null;
};

export type RiderActivityLogSummary = {
  total: number;
  cancelled: number;
  delivered: number;
  distinctRiders: number;
};

export type RiderActivityLogCacheEntry = {
  logs: RiderActivityLogApiRow[];
  summary: RiderActivityLogSummary;
  trackingOrderId?: string | null;
};

const EMPTY_SUMMARY: RiderActivityLogSummary = {
  total: 0,
  cancelled: 0,
  delivered: 0,
  distinctRiders: 0,
};

const cache = new Map<number, RiderActivityLogCacheEntry>();
const inflight = new Map<number, Promise<RiderActivityLogCacheEntry>>();

export function seedRiderActivityLogCache(
  orderId: number,
  entry: RiderActivityLogCacheEntry
): void {
  if (!Number.isFinite(orderId)) return;
  cache.set(orderId, entry);
}

export function getCachedRiderActivityLog(
  orderId: number
): RiderActivityLogCacheEntry | undefined {
  return cache.get(orderId);
}

export function invalidateRiderActivityLogCache(orderId: number): void {
  if (!Number.isFinite(orderId)) return;
  cache.delete(orderId);
  inflight.delete(orderId);
}

export function prefetchRiderActivityLog(orderId: number, force = false): void {
  if (!Number.isFinite(orderId)) return;
  if (!force && (cache.has(orderId) || inflight.has(orderId))) return;
  void fetchRiderActivityLogCached(orderId, { force }).catch(() => {
    /* network / backend down — ignore for background prefetch */
  });
}

export async function fetchRiderActivityLogCached(
  orderId: number,
  options?: { force?: boolean }
): Promise<RiderActivityLogCacheEntry> {
  if (!Number.isFinite(orderId)) {
    return { logs: [], summary: EMPTY_SUMMARY };
  }

  if (options?.force) {
    invalidateRiderActivityLogCache(orderId);
  } else {
    const cached = cache.get(orderId);
    if (cached) return cached;

    const pending = inflight.get(orderId);
    if (pending) return pending;
  }

  const request = fetch(`/api/orders/${orderId}/rider-activity-log`, {
    credentials: "include",
  })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as {
        logs?: RiderActivityLogApiRow[];
        summary?: RiderActivityLogSummary;
        trackingOrderId?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || "Failed to load rider activity log");
      }
      const entry: RiderActivityLogCacheEntry = {
        logs: Array.isArray(body.logs) ? body.logs : [],
        summary: body.summary ?? {
          ...EMPTY_SUMMARY,
          total: body.logs?.length ?? 0,
        },
        trackingOrderId: body.trackingOrderId ?? null,
      };
      cache.set(orderId, entry);
      return entry;
    })
    .catch((err: unknown) => {
      // Backend down / network blip — do not cache so a later retry can succeed.
      if (err instanceof TypeError) {
        return { logs: [], summary: EMPTY_SUMMARY, trackingOrderId: null };
      }
      throw err;
    })
    .finally(() => {
      inflight.delete(orderId);
    });

  inflight.set(orderId, request);
  return request;
}
