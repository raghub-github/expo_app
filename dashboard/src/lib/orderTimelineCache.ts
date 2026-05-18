import type { OrderTimelineEntry } from '@/lib/orderTimelineTypes';

const cache = new Map<string, OrderTimelineEntry[]>();
const inflight = new Map<string, Promise<OrderTimelineEntry[]>>();

export function getCachedOrderTimeline(timelineUrl: string): OrderTimelineEntry[] | undefined {
  if (!timelineUrl || !cache.has(timelineUrl)) return undefined;
  return cache.get(timelineUrl);
}

export function clearCachedOrderTimeline(timelineUrl: string): void {
  cache.delete(timelineUrl);
  inflight.delete(timelineUrl);
}

export function prefetchOrderTimeline(timelineUrl: string): void {
  if (!timelineUrl) return;
  if (cache.has(timelineUrl)) return;
  if (inflight.has(timelineUrl)) return;

  const p = fetch(timelineUrl, { credentials: 'include' })
    .then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        clearCachedOrderTimeline(timelineUrl);
        return [] as OrderTimelineEntry[];
      }
      const list = (json.timeline ?? []) as OrderTimelineEntry[];
      cache.set(timelineUrl, list);
      return list;
    })
    .catch(() => {
      clearCachedOrderTimeline(timelineUrl);
      return [] as OrderTimelineEntry[];
    })
    .finally(() => {
      inflight.delete(timelineUrl);
    });

  inflight.set(timelineUrl, p);
}

export async function fetchOrderTimelineCached(timelineUrl: string): Promise<OrderTimelineEntry[]> {
  if (!timelineUrl) return [];
  const cached = cache.get(timelineUrl);
  if (cached) return cached;
  const pending = inflight.get(timelineUrl);
  if (pending) return pending;

  prefetchOrderTimeline(timelineUrl);
  return inflight.get(timelineUrl) ?? Promise.resolve([]);
}
