/**
 * Authoritative rider payout BASIS — the gross (pre-discount) service value the
 * Rider Fare Engine multiplies by rider%. This is deliberately separate from the
 * customer's discounted payable: a coupon, free ride, membership, or platform
 * offer reduces what the CUSTOMER pays, never what the RIDER earns. The company /
 * platform absorbs the gap (see the promotion-subsidy accounting at settlement).
 *
 * Rule: never feed the customer's post-offer amount (orders_ride.final_fare, the
 * net delivery fee) into rider payout. Always resolve the gross basis here.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBillingAmount(snapshot: unknown, keys: string[]): number {
  if (snapshot == null || typeof snapshot !== "object") return 0;
  const obj = snapshot as Record<string, unknown>;
  for (const key of keys) {
    const n = Number(obj[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Food/parcel rider delivery-fee basis. Rider payout is the delivery fee — never
 * the order grand total, and never the net customer-charged fee once a subsidy
 * (free delivery / coupon / membership) has cut it. Prefers the GROSS/standard
 * delivery fare so a customer subsidy never reduces rider payout; falls back to
 * the net customer-facing fee only for pre-migration orders without a gross field.
 */
export function resolveRiderDeliveryFeeFromCore(row: {
  riderEarning: unknown;
  fareAmount: unknown;
  billingSnapshot?: unknown;
}): number {
  const direct = Number(row.riderEarning);
  if (Number.isFinite(direct) && direct > 0) return round2(direct);

  const fromGross = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee_gross",
    "deliveryFeeGross",
    "delivery_fee_original",
    "deliveryFeeOriginal",
  ]);
  if (fromGross > 0) return round2(fromGross);

  const fromBilling = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
  ]);
  const snap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : null;
  const payoutHint =
    snap?.rider_payout_snapshot != null && typeof snap.rider_payout_snapshot === "object"
      ? Number((snap.rider_payout_snapshot as Record<string, unknown>).totalEarning)
      : NaN;
  if (
    fromBilling > 0 &&
    !(
      Number.isFinite(payoutHint) &&
      payoutHint > 0 &&
      Math.abs(fromBilling - payoutHint) <= 0.51
    )
  ) {
    return round2(fromBilling);
  }

  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round2(fare);

  return 0;
}

/**
 * Person-ride rider payout BASIS = the GROSS (pre-discount) ride fare.
 *
 * orders_ride.estimated_fare is the authoritative server-metered fare and is
 * stored pre-discount (grand total = estimated_fare + tip; the offer reduces the
 * grand total / final_fare afterwards). final_fare is the customer's DISCOUNTED
 * payable (₹0 for a 100%-free ride) and must never be the rider basis. When the
 * estimate is missing we reconstruct the gross from the billing snapshot's
 * pre-discount fare, or by adding the recorded discount back onto final_fare.
 */
export function resolveRideGrossFareForPayout(row: {
  estimatedFare: unknown;
  finalFare: unknown;
  fareAmount: unknown;
  billingSnapshot?: unknown;
}): number {
  // 1. Server metered estimate — authoritative gross.
  const est = Number(row.estimatedFare);
  if (Number.isFinite(est) && est > 0) return round2(est);

  const snap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : null;

  // 2. Pre-discount fare recorded in the billing snapshot.
  const grossFromSnap = parseBillingAmount(snap, [
    "ride_fare",
    "fare_amount",
    "item_total",
    "original_fare",
  ]);
  if (grossFromSnap > 0) return round2(grossFromSnap);

  // 3. Reconstruct gross by adding the discount back onto the discounted final.
  const discount = snap
    ? Math.max(Number(snap.discount_total) || 0, Number(snap.ride_fare_offer_discount) || 0)
    : 0;
  const fin = Number(row.finalFare);
  if (Number.isFinite(fin) && fin > 0) return round2(fin + Math.max(0, discount));

  // 4. Last resort — c.fare_amount (gross for rides at placement).
  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round2(fare);

  return 0;
}
