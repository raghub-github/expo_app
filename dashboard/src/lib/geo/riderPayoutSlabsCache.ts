/** Client-side cache + deduped prefetch for rider payout slabs API. */

export type RiderPayoutSlabsKey = string;

export type RiderPayoutSlabsPayload = {
  pickupSlabs: Record<string, unknown>[];
  dropSlabs: Record<string, unknown>[];
  fetchedAt: number;
};

const cache = new Map<RiderPayoutSlabsKey, RiderPayoutSlabsPayload>();
const inflight = new Map<RiderPayoutSlabsKey, Promise<RiderPayoutSlabsPayload>>();

export function riderPayoutSlabsCacheKey(args: {
  level: string;
  refId: string;
  service: string;
  vehicleType?: string;
}): RiderPayoutSlabsKey {
  return `${args.level}:${args.refId}:${args.service}:${args.vehicleType ?? ""}`;
}

export function getRiderPayoutSlabsCache(key: RiderPayoutSlabsKey): RiderPayoutSlabsPayload | null {
  return cache.get(key) ?? null;
}

export function invalidateRiderPayoutSlabsCache(key: RiderPayoutSlabsKey): void {
  cache.delete(key);
  inflight.delete(key);
}

export async function fetchRiderPayoutSlabs(args: {
  level: string;
  refId: string;
  service: string;
  vehicleType?: string;
  force?: boolean;
}): Promise<RiderPayoutSlabsPayload> {
  const key = riderPayoutSlabsCacheKey(args);
  if (args.force) {
    cache.delete(key);
    inflight.delete(key);
  }
  if (!args.force) {
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = inflight.get(key);
    if (pending) return pending;
  } else {
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const qs = (leg: "pickup" | "drop") => {
      const p = new URLSearchParams({
        level: args.level,
        refId: args.refId,
        service: args.service,
        leg,
      });
      if (args.service === "ride" && args.vehicleType) {
        p.set("vehicleType", args.vehicleType);
      }
      return p.toString();
    };

    const [pickupRes, dropRes] = await Promise.all([
      fetch(`/api/super-admin/geo/rider-payout-slabs?${qs("pickup")}`, { cache: "no-store" }),
      fetch(`/api/super-admin/geo/rider-payout-slabs?${qs("drop")}`, { cache: "no-store" }),
    ]);
    const pj = await pickupRes.json();
    const dj = await dropRes.json();
    if (!pickupRes.ok) throw new Error(pj.error ?? "Failed to load pickup slabs");
    if (!dropRes.ok) throw new Error(dj.error ?? "Failed to load drop slabs");

    const payload: RiderPayoutSlabsPayload = {
      pickupSlabs: pj.slabs ?? [],
      dropSlabs: dj.slabs ?? [],
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

export function prefetchRiderPayoutSlabs(args: {
  level: string;
  refId: string;
  service: string;
  vehicleType?: string;
}): void {
  void fetchRiderPayoutSlabs(args).catch(() => {
    /* warm cache */
  });
}
