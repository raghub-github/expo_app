import type { IncomingDispatchOrder } from "@/src/components/orders/IncomingRideOrderModal";
import { resolveRiderDisplayedEarning } from "./rider-earning-display";

/**
 * The in-app offer, flattened into the keys the native alert card reads (the
 * same keys the backend's FCM dispatch payload uses).
 *
 * An alert the app starts from a WebSocket offer used to reach native with no
 * details, so the floating card over other apps read "Address unavailable /
 * Distance unavailable". With these the card shows exactly what the in-app
 * IncomingOrderModal shows: same total, same breakdown, same distances.
 */
export function buildRiderNativeAlertDetails(
  order: IncomingDispatchOrder | null | undefined
): Record<string, string | number> | null {
  if (!order) return null;
  const out: Record<string, string | number> = {};
  const put = (key: string, value: unknown) => {
    if (typeof value === "number") {
      if (Number.isFinite(value) && value > 0) out[key] = Math.round(value * 100) / 100;
      return;
    }
    const s = String(value ?? "").trim();
    if (s) out[key] = s;
  };

  put("serviceType", order.category === "ride" ? "person_ride" : order.category);
  put("formattedOrderId", order.formattedOrderId);

  // Money: the very number the in-app sheet promises, and its parts.
  const total = Math.round(resolveRiderDisplayedEarning(order));
  put("amount", total);
  put("waitingEarning", Math.round(order.waitingEarning ?? 0));
  const surgeSum = (order.appliedSurges ?? []).reduce((sum, s) => sum + Math.round(Number(s.amount) || 0), 0);
  put("surgeEarning", surgeSum);
  // Only the COMPANY-funded first-mile sits on top of the pool (in-app rule).
  put("firstMileEarning", Math.round(order.prePickupCompanyFunded ?? 0));
  put("tipAmount", Math.round(order.customerTipAmount ?? 0));

  // Distances: To pickup / Trip / Overall.
  put("toPickupKm", order.pickupDistanceKm);
  put("tripDistanceKm", order.tripDistanceKm ?? order.distanceKm);
  put("overallKm", order.totalDistanceKm);

  // Route + people.
  put("pickupAddress", order.pickup?.address);
  put("dropAddress", order.delivery?.address);
  if (order.category === "food") put("storeName", order.merchantName);
  put("customerName", order.customerName);
  if (order.itemCount != null && order.itemCount > 0) put("itemCount", order.itemCount);
  put("paymentMethod", order.paymentMethod);
  put("payAt", order.payAt);

  // Server-authoritative deadline, as epoch millis.
  const deadline = Date.parse(String(order.acceptDeadlineAt ?? ""));
  if (Number.isFinite(deadline) && deadline > 0) out.expiresAt = String(deadline);

  return Object.keys(out).length > 0 ? out : null;
}
