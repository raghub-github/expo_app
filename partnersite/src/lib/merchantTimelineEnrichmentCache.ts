import type { MerchantOrderActionForTimeline } from '@/lib/merchantVisibleTimeline';
import { prefetchOrderTimeline } from '@/lib/orderTimelineCache';

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

const cache = new Map<number, MerchantTimelineEnrichment>();
const inflight = new Map<number, Promise<MerchantTimelineEnrichment>>();

function parseRidersLog(data: {
  riders?: Array<{
    reached_merchant_at?: string | null;
    accepted_at?: string | null;
    assigned_at?: string | null;
  }>;
}): Pick<MerchantTimelineEnrichment, 'riderReachedAt' | 'riderAssignedAt'> {
  const riders = data.riders ?? [];
  return {
    riderReachedAt: riders.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null,
    riderAssignedAt:
      riders.find((r) => r.accepted_at)?.accepted_at ??
      riders.find((r) => r.assigned_at)?.assigned_at ??
      null,
  };
}

export function getCachedMerchantTimelineEnrichment(
  orderFoodId: number
): MerchantTimelineEnrichment | undefined {
  if (orderFoodId <= 0) return undefined;
  return cache.get(orderFoodId);
}

export function prefetchMerchantTimelineEnrichment(
  orderFoodId: number,
  storeId?: string | null
): void {
  if (orderFoodId <= 0) return;
  if (cache.has(orderFoodId) || inflight.has(orderFoodId)) return;

  const ridersP = fetch(`/api/food-orders/${orderFoodId}/riders-log`)
    .then((r) => (r.ok ? r.json() : { riders: [] }))
    .catch(() => ({ riders: [] }));

  const activityP = storeId
    ? fetch(
        `/api/food-orders/${orderFoodId}/activity?store_id=${encodeURIComponent(storeId)}`
      )
        .then((r) => (r.ok ? r.json() : { actions: [] }))
        .catch(() => ({ actions: [] }))
    : Promise.resolve({ actions: [] });

  const p = Promise.all([ridersP, activityP])
    .then(([ridersData, activityData]) => {
      const enrichment: MerchantTimelineEnrichment = {
        ...parseRidersLog(ridersData),
        actions: (activityData as { actions?: MerchantOrderActionForTimeline[] }).actions ?? [],
      };
      cache.set(orderFoodId, enrichment);
      return enrichment;
    })
    .catch(() => {
      cache.set(orderFoodId, EMPTY_ENRICHMENT);
      return EMPTY_ENRICHMENT;
    })
    .finally(() => {
      inflight.delete(orderFoodId);
    });

  inflight.set(orderFoodId, p);
}

export async function fetchMerchantTimelineEnrichmentCached(
  orderFoodId: number,
  storeId?: string | null
): Promise<MerchantTimelineEnrichment> {
  if (orderFoodId <= 0) return EMPTY_ENRICHMENT;
  const cached = cache.get(orderFoodId);
  if (cached) return cached;
  const pending = inflight.get(orderFoodId);
  if (pending) return pending;

  prefetchMerchantTimelineEnrichment(orderFoodId, storeId);
  return inflight.get(orderFoodId) ?? Promise.resolve(EMPTY_ENRICHMENT);
}

/** Timeline rows + rider/activity enrichment — call when an order becomes visible. */
export function prefetchMerchantOrderTimelineBundle(
  orderFoodId: number,
  storeId?: string | null,
  timelineUrl = `/api/food-orders/${orderFoodId}/timeline`
): void {
  if (orderFoodId <= 0) return;
  prefetchOrderTimeline(orderFoodId, timelineUrl);
  prefetchMerchantTimelineEnrichment(orderFoodId, storeId);
}
