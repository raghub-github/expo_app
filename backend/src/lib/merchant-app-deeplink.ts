/** Merchant Partner app routes for order pushes. */

/** Order-detail href. Food id must be the numeric `orders_food.id`. */
export function merchantAppOrderHref(foodOrderId: string | number | null | undefined): string {
  const id = String(foodOrderId ?? "").trim();
  return /^\d+$/.test(id) ? `/order/${id}` : "/(tabs)/orders";
}

/** Home dashboard — New orders tab (notification tap for CREATED orders). */
export function merchantAppHomeNewOrdersHref(): string {
  return "/(tabs)?orderTab=New";
}

/** Orders-board tab when a push has no numeric food id. */
export function merchantAppOrdersTabHref(stage?: string | null): string {
  const s = String(stage ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (s === "RTO") return "/(tabs)/orders?tab=rto";
  if (s === "SCHEDULED" || s === "PREORDER" || s === "PRE_ORDER") {
    return "/(tabs)/orders?tab=scheduled";
  }
  if (s === "DELIVERED" || s === "COMPLETED" || s === "CANCELLED" || s === "REJECTED") {
    return "/(tabs)/orders?tab=completed";
  }
  if (s === "READY" || s === "READY_FOR_PICKUP") return "/(tabs)/orders?tab=ready";
  if (
    s === "OUT_FOR_DELIVERY" ||
    s === "PICKED_UP" ||
    s === "IN_TRANSIT" ||
    s === "DISPATCHED"
  ) {
    return "/(tabs)/orders?tab=picked_up";
  }
  if (s === "CREATED" || s === "NEW" || s === "PLACED") return merchantAppHomeNewOrdersHref();
  return "/(tabs)/orders?tab=preparing";
}
