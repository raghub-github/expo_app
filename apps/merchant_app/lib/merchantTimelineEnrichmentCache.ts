import {
  fetchFoodOrderActions,
  fetchFoodOrderRidersLog,
  type MerchantOrderActionForTimeline,
} from "@/services/ordersApi";

export type MerchantTimelineEnrichment = {
  riderReachedAt: string | null;
  riderAssignedAt: string | null;
  actions: MerchantOrderActionForTimeline[];
};

const EMPTY_ENRICHMENT: MerchantTimelineEnrichment = {
  riderReachedAt: null,
  riderAssignedAt: null,
  actions: [],
};

function cacheKey(storeId: number, foodId: number): string {
  return `${storeId}:${foodId}`;
}

const cache = new Map<string, MerchantTimelineEnrichment>();
const inflight = new Map<string, Promise<MerchantTimelineEnrichment>>();

export function getCachedMerchantTimelineEnrichment(
  storeId: number,
  foodId: number
): MerchantTimelineEnrichment | undefined {
  if (foodId <= 0) return undefined;
  return cache.get(cacheKey(storeId, foodId));
}

export function prefetchMerchantTimelineEnrichment(
  storeId: number,
  foodId: number,
  token: string
): void {
  if (foodId <= 0 || !token) return;
  const key = cacheKey(storeId, foodId);
  if (cache.has(key) || inflight.has(key)) return;

  const p = Promise.all([
    fetchFoodOrderRidersLog(storeId, foodId, token),
    fetchFoodOrderActions(storeId, foodId, token),
  ])
    .then(([riders, actions]) => {
      const enrichment: MerchantTimelineEnrichment = {
        riderReachedAt: riders.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null,
        riderAssignedAt:
          riders.find((r) => r.accepted_at)?.accepted_at ??
          riders.find((r) => r.assigned_at)?.assigned_at ??
          null,
        actions,
      };
      cache.set(key, enrichment);
      return enrichment;
    })
    .catch(() => {
      cache.set(key, EMPTY_ENRICHMENT);
      return EMPTY_ENRICHMENT;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
}

export async function fetchMerchantTimelineEnrichmentCached(
  storeId: number,
  foodId: number,
  token: string
): Promise<MerchantTimelineEnrichment> {
  if (foodId <= 0 || !token) return EMPTY_ENRICHMENT;
  const key = cacheKey(storeId, foodId);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  prefetchMerchantTimelineEnrichment(storeId, foodId, token);
  return inflight.get(key) ?? Promise.resolve(EMPTY_ENRICHMENT);
}
