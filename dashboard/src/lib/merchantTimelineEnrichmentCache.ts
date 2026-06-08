import type { MerchantOrderActionForTimeline } from '@/lib/merchantVisibleTimeline';
import { prefetchOrderTimeline } from '@/lib/orderTimelineCache';

export type MerchantTimelineEnrichment = {
  riderReachedAt: string | null;
  actions: MerchantOrderActionForTimeline[];
};

const EMPTY_ENRICHMENT: MerchantTimelineEnrichment = {
  riderReachedAt: null,
  actions: [],
};

function cacheKey(storeId: string | number, orderId: number): string {
  return `${storeId}:${orderId}`;
}

const cache = new Map<string, MerchantTimelineEnrichment>();
const inflight = new Map<string, Promise<MerchantTimelineEnrichment>>();

export function getCachedMerchantTimelineEnrichment(
  storeId: string | number,
  orderId: number
): MerchantTimelineEnrichment | undefined {
  if (orderId <= 0) return undefined;
  return cache.get(cacheKey(storeId, orderId));
}

export function prefetchMerchantTimelineEnrichment(
  storeId: string | number,
  orderId: number
): void {
  if (orderId <= 0) return;
  const key = cacheKey(storeId, orderId);
  if (cache.has(key) || inflight.has(key)) return;

  const base = `/api/merchant/stores/${storeId}/orders/${orderId}`;
  const p = Promise.all([
    fetch(`${base}/riders-log`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { riders: [] }))
      .catch(() => ({ riders: [] })),
    fetch(`${base}/activity`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { actions: [] }))
      .catch(() => ({ actions: [] })),
  ])
    .then(([ridersData, activityData]) => {
      const enrichment: MerchantTimelineEnrichment = {
        riderReachedAt:
          (ridersData as { riders?: Array<{ reached_merchant_at?: string | null }> }).riders?.find(
            (r) => r.reached_merchant_at
          )?.reached_merchant_at ?? null,
        actions:
          (activityData as { actions?: MerchantOrderActionForTimeline[] }).actions ?? [],
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
  storeId: string | number,
  orderId: number
): Promise<MerchantTimelineEnrichment> {
  if (orderId <= 0) return EMPTY_ENRICHMENT;
  const key = cacheKey(storeId, orderId);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  prefetchMerchantTimelineEnrichment(storeId, orderId);
  return inflight.get(key) ?? Promise.resolve(EMPTY_ENRICHMENT);
}

export function prefetchMerchantOrderTimelineBundle(
  storeId: string | number,
  orderId: number,
  timelineUrl: string
): void {
  if (orderId <= 0 || !timelineUrl) return;
  prefetchOrderTimeline(timelineUrl);
  prefetchMerchantTimelineEnrichment(storeId, orderId);
}
