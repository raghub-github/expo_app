import type { OrderSummary } from "@/services/order.service";

function orderRefUpper(order: OrderSummary): string {
  return (order.formattedOrderId ?? order.orderId ?? "").trim().toUpperCase();
}

function isParcelOrFoodRef(ref: string): boolean {
  return (
    /^GMC\d*/.test(ref) ||
    /^GMX\d*/.test(ref) ||
    /^GMPARCEL/i.test(ref) ||
    /^GMF\d*/.test(ref)
  );
}

/**
 * List row heuristics when orderType is absent from summary API.
 *
 * Lives in its own module so `ride-fare-gate` can classify ride orders without
 * pulling in `person-ride-orders` (which needs the fare gate itself).
 *
 * Must never classify parcel (GMC) as a person ride — that put Courier track
 * pills on Book a Ride home.
 */
export function isPersonRideOrderSummary(order: OrderSummary): boolean {
  const t = (order.orderType ?? "").trim().toLowerCase();
  if (t === "parcel" || t === "food") return false;
  if (t === "person_ride" || t === "ride") return true;

  const ref = orderRefUpper(order);
  if (isParcelOrFoodRef(ref)) return false;
  if (/^GMP\d*/.test(ref)) return true;
  if ((order.rideType ?? "").trim().length > 0) return true;

  const items = order.items ?? [];
  if (order.merchantStoreId != null) return false;
  if (items.length > 0) return false;
  // Ambiguous empty row — do not assume person ride (parcels used to fall through here).
  return false;
}
