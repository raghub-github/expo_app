/** Client-side cache + deduped prefetch for ride customer pricing slabs. */

export type RideCustomerPricingKey = string;

export type RideCustomerPricingPayload = {
  slabs: Record<string, unknown>[];
  fetchedAt: number;
};

const cache = new Map<RideCustomerPricingKey, RideCustomerPricingPayload>();
const inflight = new Map<RideCustomerPricingKey, Promise<RideCustomerPricingPayload>>();

export function rideCustomerPricingCacheKey(args: {
  level: string;
  refId: string;
  vehicleType: string;
}): RideCustomerPricingKey {
  return `${args.level}:${args.refId}:${args.vehicleType}`;
}

export function getRideCustomerPricingCache(key: RideCustomerPricingKey): RideCustomerPricingPayload | null {
  return cache.get(key) ?? null;
}

export function invalidateRideCustomerPricingCache(key: RideCustomerPricingKey): void {
  cache.delete(key);
  inflight.delete(key);
}

export async function fetchRideCustomerPricing(args: {
  level: string;
  refId: string;
  vehicleType: string;
  force?: boolean;
}): Promise<RideCustomerPricingPayload> {
  const key = rideCustomerPricingCacheKey(args);
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
    const res = await fetch(`/api/super-admin/geo/ride-customer-pricing?${qs}`, { cache: "no-store" });
    const json = (await res.json()) as { error?: string; slabs?: Record<string, unknown>[] };
    if (!res.ok) throw new Error(json.error ?? "Failed");
    const payload: RideCustomerPricingPayload = {
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

export function prefetchRideCustomerPricing(args: {
  level: string;
  refId: string;
  vehicleType: string;
}): void {
  void fetchRideCustomerPricing(args).catch(() => {
    /* warm cache */
  });
}
