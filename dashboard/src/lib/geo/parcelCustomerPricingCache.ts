/** Client-side cache + deduped prefetch for parcel customer pricing slabs. */

export type ParcelCustomerPricingKey = string;

export type ParcelCustomerPricingPayload = {
  slabs: Record<string, unknown>[];
  fetchedAt: number;
};

const cache = new Map<ParcelCustomerPricingKey, ParcelCustomerPricingPayload>();
const inflight = new Map<ParcelCustomerPricingKey, Promise<ParcelCustomerPricingPayload>>();

export function parcelCustomerPricingCacheKey(args: {
  level: string;
  refId: string;
  vehicleType: string;
}): ParcelCustomerPricingKey {
  return `parcel:${args.level}:${args.refId}:${args.vehicleType}`;
}

export function getParcelCustomerPricingCache(
  key: ParcelCustomerPricingKey
): ParcelCustomerPricingPayload | null {
  return cache.get(key) ?? null;
}

export function invalidateParcelCustomerPricingCache(key: ParcelCustomerPricingKey): void {
  cache.delete(key);
  inflight.delete(key);
}

export async function fetchParcelCustomerPricing(args: {
  level: string;
  refId: string;
  vehicleType: string;
  force?: boolean;
}): Promise<ParcelCustomerPricingPayload> {
  const key = parcelCustomerPricingCacheKey(args);
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
      vehicleType: args.vehicleType,
    });
    const res = await fetch(`/api/super-admin/geo/parcel-customer-pricing?${qs}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as { error?: string; slabs?: Record<string, unknown>[] };
    if (!res.ok) throw new Error(json.error ?? "Failed");
    const payload: ParcelCustomerPricingPayload = {
      slabs: json.slabs ?? [],
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

export function prefetchParcelCustomerPricing(args: {
  level: string;
  refId: string;
  vehicleType: string;
}): void {
  void fetchParcelCustomerPricing(args).catch(() => {
    /* warm cache */
  });
}
