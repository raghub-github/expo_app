import type { ApiFoodOrder } from "@/services/ordersApi";

function cacheKey(storeId: number, foodId: number): string {
  return `${storeId}:${foodId}`;
}

const cache = new Map<string, ApiFoodOrder>();

export function setCachedFoodOrder(
  storeId: number,
  foodId: number,
  order: ApiFoodOrder
): void {
  if (!Number.isFinite(storeId) || storeId <= 0) return;
  if (!Number.isFinite(foodId) || foodId <= 0) return;
  cache.set(cacheKey(storeId, foodId), order);
}

export function cacheFoodOrders(storeId: number, orders: ApiFoodOrder[]): void {
  for (const order of orders) {
    if (order.core_only) continue;
    const foodId = Number(order.orders_food_id);
    if (Number.isFinite(foodId) && foodId > 0) {
      setCachedFoodOrder(storeId, foodId, order);
    }
  }
}

/** Prefer store-scoped hit; otherwise any cached row for this food id. */
export function getCachedFoodOrder(
  foodId: number,
  preferredStoreId?: number | null
): { storeId: number; order: ApiFoodOrder } | undefined {
  if (!Number.isFinite(foodId) || foodId <= 0) return undefined;
  if (preferredStoreId != null && preferredStoreId > 0) {
    const hit = cache.get(cacheKey(preferredStoreId, foodId));
    if (hit) return { storeId: preferredStoreId, order: hit };
  }
  for (const [k, order] of cache) {
    if (Number(order.orders_food_id) === foodId) {
      const storeId = Number(k.split(":")[0]);
      if (Number.isFinite(storeId) && storeId > 0) {
        return { storeId, order };
      }
    }
  }
  return undefined;
}
