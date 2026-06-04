/** Merchant-marked food prep state (orders_food.order_status) — not rider timeline. */

const MERCHANT_READY_STATUSES = new Set([
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

export function isMerchantFoodOrderReady(foodStatus?: string | null): boolean {
  const s = String(foodStatus ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return MERCHANT_READY_STATUSES.has(s);
}

export function isMerchantFoodUnderPreparation(foodStatus?: string | null): boolean {
  const s = String(foodStatus ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return s === "ACCEPTED" || s === "PREPARING" || s === "CREATED";
}
