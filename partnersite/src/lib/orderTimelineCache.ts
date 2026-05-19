import type { OrderTimelineEntry } from '@/app/api/food-orders/[id]/timeline/route';

const cache = new Map<number, OrderTimelineEntry[]>();
const inflight = new Map<number, Promise<OrderTimelineEntry[]>>();

export function getCachedOrderTimeline(
  ordersFoodId: number
): OrderTimelineEntry[] | undefined {
  if (!cache.has(ordersFoodId)) return undefined;
  return cache.get(ordersFoodId) ?? [];
}

export function setCachedOrderTimeline(ordersFoodId: number, entries: OrderTimelineEntry[]) {
  cache.set(ordersFoodId, entries);
}

export function prefetchOrderTimeline(
  ordersFoodId: number,
  timelineUrl = `/api/food-orders/${ordersFoodId}/timeline`
): void {
  if (ordersFoodId <= 0) return;
  if (cache.has(ordersFoodId)) return;
  if (inflight.has(ordersFoodId)) return;

  const p = fetch(timelineUrl)
    .then((res) => res.json())
    .then((json) => {
      if (json.error) return [] as OrderTimelineEntry[];
      const list = (json.timeline ?? []) as OrderTimelineEntry[];
      cache.set(ordersFoodId, list);
      return list;
    })
    .catch(() => [] as OrderTimelineEntry[])
    .finally(() => {
      inflight.delete(ordersFoodId);
    });

  inflight.set(ordersFoodId, p);
}

export async function fetchOrderTimelineCached(
  ordersFoodId: number,
  timelineUrl = `/api/food-orders/${ordersFoodId}/timeline`
): Promise<OrderTimelineEntry[]> {
  const cached = cache.get(ordersFoodId);
  if (cached) return cached;
  const pending = inflight.get(ordersFoodId);
  if (pending) return pending;

  prefetchOrderTimeline(ordersFoodId, timelineUrl);
  return inflight.get(ordersFoodId) ?? Promise.resolve([]);
}
