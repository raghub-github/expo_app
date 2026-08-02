import type { OrderSummary } from "@/services/order.service";

/**
 * List row heuristics when orderType is absent from summary API.
 *
 * Lives in its own module so `ride-fare-gate` can classify ride orders without
 * pulling in `person-ride-orders` (which needs the fare gate itself).
 */
export function isPersonRideOrderSummary(order: OrderSummary): boolean {
  if ((order.orderType ?? "").trim().toLowerCase() === "person_ride") return true;
  const ref = (order.formattedOrderId ?? order.orderId ?? "").trim().toUpperCase();
  if (/^GMP\d*/.test(ref)) return true;
  if ((order.rideType ?? "").trim().length > 0) return true;
  const items = order.items ?? [];
  if (order.merchantStoreId != null) return false;
  if (items.length > 0) return false;
  return true;
}
