import {
  fetchFoodOrderTimeline,
  type FoodOrderTimelineEntry,
} from "@/services/ordersApi";

function cacheKey(storeId: number, foodId: number): string {
  return `${storeId}:${foodId}`;
}

const cache = new Map<string, FoodOrderTimelineEntry[]>();
const inflight = new Map<string, Promise<FoodOrderTimelineEntry[]>>();

export function getCachedOrderTimeline(
  storeId: number,
  foodId: number
): FoodOrderTimelineEntry[] | undefined {
  const k = cacheKey(storeId, foodId);
  if (!cache.has(k)) return undefined;
  return cache.get(k) ?? [];
}

export function setCachedOrderTimeline(
  storeId: number,
  foodId: number,
  entries: FoodOrderTimelineEntry[]
): void {
  cache.set(cacheKey(storeId, foodId), entries);
}

/** Partner Site: prefetch timeline rows as soon as order is known. */
export function prefetchOrderTimeline(
  storeId: number,
  foodId: number,
  token: string
): void {
  if (foodId <= 0 || !token) return;
  const k = cacheKey(storeId, foodId);
  if (cache.has(k) || inflight.has(k)) return;

  const p = fetchFoodOrderTimeline(storeId, foodId, token)
    .then((list) => {
      cache.set(k, list);
      return list;
    })
    .catch(() => [] as FoodOrderTimelineEntry[])
    .finally(() => {
      inflight.delete(k);
    });

  inflight.set(k, p);
}

export async function fetchOrderTimelineCached(
  storeId: number,
  foodId: number,
  token: string
): Promise<FoodOrderTimelineEntry[]> {
  const k = cacheKey(storeId, foodId);
  const cached = cache.get(k);
  if (cached) return cached;
  const pending = inflight.get(k);
  if (pending) return pending;

  prefetchOrderTimeline(storeId, foodId, token);
  return inflight.get(k) ?? Promise.resolve([]);
}
