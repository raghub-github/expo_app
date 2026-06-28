/** Client-side cache + deduped prefetch for delivery rate slabs APIs. */

export type DeliveryRateSlabsKey = string;

export type DeliveryRateSlabsPayload = {
  ownSlabs: Record<string, unknown>[];
  applied: { level: string; refId: string } | null;
  effectiveSlabs: Record<string, unknown>[];
  fetchedAt: number;
};

const cache = new Map<DeliveryRateSlabsKey, DeliveryRateSlabsPayload>();
const inflight = new Map<DeliveryRateSlabsKey, Promise<DeliveryRateSlabsPayload>>();

export function deliveryRateSlabsCacheKey(args: {
  level: string;
  refId: string;
  serviceType: string;
  actorType: string;
}): DeliveryRateSlabsKey {
  return `${args.level}:${args.refId}:${args.serviceType}:${args.actorType}`;
}

export function getDeliveryRateSlabsCache(key: DeliveryRateSlabsKey): DeliveryRateSlabsPayload | null {
  return cache.get(key) ?? null;
}

export function invalidateDeliveryRateSlabsCache(key: DeliveryRateSlabsKey): void {
  cache.delete(key);
  inflight.delete(key);
}

export function invalidateDeliveryRateSlabsForNode(level: string, refId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${level}:${refId}:`)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

export async function fetchDeliveryRateSlabs(args: {
  level: string;
  refId: string;
  serviceType: string;
  actorType: string;
  force?: boolean;
}): Promise<DeliveryRateSlabsPayload> {
  const key = deliveryRateSlabsCacheKey(args);
  if (args.force) {
    cache.delete(key);
    inflight.delete(key);
  } else {
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const qs = new URLSearchParams({
      level: args.level,
      refId: args.refId,
      serviceType: args.serviceType,
      actorType: args.actorType,
    });
    const [ownRes, ctxRes] = await Promise.all([
      fetch(`/api/super-admin/geo/delivery-rate-slabs?${qs.toString()}`, { cache: "no-store" }),
      fetch(`/api/super-admin/geo/delivery-rate-slabs/context?${qs.toString()}`, { cache: "no-store" }),
    ]);
    const ownJson = (await ownRes.json()) as { error?: string; slabs?: Record<string, unknown>[] };
    const ctxJson = (await ctxRes.json()) as {
      error?: string;
      applied?: { level: string; refId: string } | null;
      slabs?: Record<string, unknown>[];
    };
    if (!ownRes.ok) throw new Error(ownJson.error ?? "Failed to load slabs");
    if (!ctxRes.ok) throw new Error(ctxJson.error ?? "Failed to load effective slabs");

    const payload: DeliveryRateSlabsPayload = {
      ownSlabs: ownJson.slabs ?? [],
      applied: ctxJson.applied ?? null,
      effectiveSlabs: ctxJson.slabs ?? [],
      fetchedAt: Date.now(),
    };
    cache.set(key, payload);
    return payload;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function prefetchDeliveryRateSlabs(args: {
  level: string;
  refId: string;
  serviceType: string;
  actorType: string;
}): void {
  void fetchDeliveryRateSlabs(args).catch(() => {
    /* warm cache */
  });
}
