import type { OrdersFoodRow } from '@/lib/types/food-orders';

/**
 * Id for store-scoped merchant order APIs.
 * Prefer orders_core.id (order.order_id) — matches URL ?orderId= and timeline/OTP tables.
 * Falls back to orders_food.id when needed.
 */
export function merchantOrderApiId(order: OrdersFoodRow): number {
  const corePk = Number(order.order_id);
  if (Number.isFinite(corePk) && corePk > 0) return corePk;
  if (order.orders_food_row_id != null && order.orders_food_row_id > 0) {
    return order.orders_food_row_id;
  }
  return order.id;
}

/** orders_food.id for actions that must target the food row explicitly */
export function merchantFoodRowId(order: OrdersFoodRow): number | null {
  if (order.orders_food_row_id != null && order.orders_food_row_id > 0) {
    return order.orders_food_row_id;
  }
  if (!order.core_only && order.id > 0) return order.id;
  return null;
}

/** Timeline API param — partnersite uses orders_food.id (see GET /api/food-orders/[id]/timeline). */
export function merchantOrderTimelineApiId(order: OrdersFoodRow): number {
  const foodId = merchantFoodRowId(order);
  if (foodId != null && foodId > 0) return foodId;
  const corePk = Number(order.order_id);
  if (Number.isFinite(corePk) && corePk > 0) return corePk;
  return order.id;
}

export function merchantOrderTimelineUrl(storeId: string | number, order: OrdersFoodRow): string {
  return `/api/merchant/stores/${storeId}/orders/${merchantOrderTimelineApiId(order)}/timeline`;
}

/** Alternate timeline URL when primary id fails (core pk vs food row id). */
export function merchantOrderTimelineFallbackUrls(
  storeId: string | number,
  order: OrdersFoodRow
): string[] {
  const primary = merchantOrderTimelineApiId(order);
  const corePk = Number(order.order_id);
  const foodId = merchantFoodRowId(order);
  const urls = new Set<string>();
  urls.add(`/api/merchant/stores/${storeId}/orders/${primary}/timeline`);
  if (Number.isFinite(corePk) && corePk > 0 && corePk !== primary) {
    urls.add(`/api/merchant/stores/${storeId}/orders/${corePk}/timeline`);
  }
  if (foodId != null && foodId > 0 && foodId !== primary) {
    urls.add(`/api/merchant/stores/${storeId}/orders/${foodId}/timeline`);
  }
  if (order.id > 0 && order.id !== primary) {
    urls.add(`/api/merchant/stores/${storeId}/orders/${order.id}/timeline`);
  }
  return Array.from(urls);
}
