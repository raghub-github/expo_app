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
  const obj = asBillingObject(snapshot);
  if (!obj) return 0;
  for (const key of keys) {
    const n = Number(obj[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function asBillingObject(snapshot: unknown): Record<string, unknown> | null {
  if (snapshot == null) return null;
  if (typeof snapshot === "string") {
    try {
      const parsed = JSON.parse(snapshot) as unknown;
      return parsed != null && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof snapshot === "object") return snapshot as Record<string, unknown>;
  return null;
}

function riderPayoutHint(snapshot: unknown): number {
  const snap = asBillingObject(snapshot);
  const raw = snap?.rider_payout_snapshot;
  if (raw == null || typeof raw !== "object") return 0;
  const obj = raw as Record<string, unknown>;
  const base = Math.max(0, Number(obj.baseEarning) || 0);
  const waiting = Math.max(0, Number(obj.waitingEarning) || 0);
  const surge = Math.max(0, Number(obj.surgeEarning) || 0);
  const composed = round2(base + waiting + surge);
  if (composed > 0) return composed;
  const total = Number(obj.totalEarning);
  return Number.isFinite(total) && total > 0 ? round2(total) : 0;
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
  const payoutHint = riderPayoutHint(row.billingSnapshot);
  if (
    fromBilling > 0 &&
    !(payoutHint > 0 && Math.abs(fromBilling - payoutHint) <= 0.51)
  ) {
    return round2(fromBilling);
  }

  if (payoutHint > 0) return payoutHint;

  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round2(fare);

  return 0;
}

/**
 * Amount-base DELIVERY_FARE for rider cancellation penalty:
 * "Delivery fare paid to rider" — frozen payout snapshot first, then fare basis.
 */
export function resolveDeliveryFarePaidToRider(row: {
  riderEarning: unknown;
  fareAmount: unknown;
  billingSnapshot?: unknown;
}): number {
  const fromSnap = riderPayoutHint(row.billingSnapshot);
  if (fromSnap > 0) return fromSnap;
  return resolveRiderDeliveryFeeFromCore(row);
}

/**
 * Amount-base COMPLETE_ORDER_VALUE — full amount paid by the customer (CTC).
 * CTC = Cashin (post-wallet `grand_total` / final_amount) + GatiCash applied.
 * Never treat `grand_total` alone as CTC when GatiCash was used, and never fall
 * back to rider delivery fare here (that is DELIVERY_FARE).
 */
export function resolveCompleteOrderValuePaidByCustomer(row: {
  grandTotal: unknown;
  billingSnapshot?: unknown;
}): number {
  const snap = asBillingObject(row.billingSnapshot);
  const gati = extractGatiCashApplied(row.billingSnapshot);

  const netCore = Number(row.grandTotal);
  const netFromSnap = parseBillingAmount(row.billingSnapshot, [
    "final_amount",
    "finalAmount",
    "customer_payable",
    "customerPayable",
    "payable_total",
    "payableTotal",
    "grand_total",
    "grandTotal",
  ]);

  let netPayable = 0;
  if (Number.isFinite(netCore) && netCore > 0) {
    netPayable = round2(netCore);
  } else if (netFromSnap > 0) {
    netPayable = netFromSnap;
  } else if (Number.isFinite(netCore) && netCore === 0) {
    netPayable = 0;
  }

  const settlementCtc = round2(Math.max(0, netPayable) + Math.max(0, gati));
  const composed = composeCustomerBillFromSnapshot(row.billingSnapshot);

  if (settlementCtc > 0.005) {
    // Guard: some rows store fee-only figures in grand_total. If billing lines
    // clearly describe a full customer bill and settlement ≈ delivery fee only,
    // prefer the composed customer bill.
    const deliveryOnly = parseBillingAmount(row.billingSnapshot, [
      "delivery_fee",
      "final_delivery_fee",
      "deliveryFee",
      "finalDeliveryFee",
      "delivery_fee_gross",
      "deliveryFeeGross",
    ]);
    if (
      composed > settlementCtc + 1 &&
      deliveryOnly > 0 &&
      Math.abs(settlementCtc - deliveryOnly) <= 1.01
    ) {
      return composed;
    }
    return settlementCtc;
  }

  if (composed > 0) return composed;
  return 0;
}

function extractGatiCashApplied(snapshot: unknown): number {
  const snap = asBillingObject(snapshot);
  if (!snap) return 0;

  const direct =
    Number(snap.gati_cash_applied) ||
    Number(snap.gatiCashApplied) ||
    Number(snap.gati_cash_amount) ||
    Number(snap.gatiCashAmount);
  if (Number.isFinite(direct) && direct > 0.005) return round2(direct);

  const adj = snap.checkout_adjustments ?? snap.checkoutAdjustments;
  if (adj && typeof adj === "object") {
    const a = adj as Record<string, unknown>;
    const fromAdj = Number(a.gatiCashApplied) || Number(a.gati_cash_applied);
    if (Number.isFinite(fromAdj) && fromAdj > 0.005) return round2(fromAdj);
    const lines = Array.isArray(a.lines) ? a.lines : [];
    let sum = 0;
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const row = line as Record<string, unknown>;
      if (String(row.kind ?? "") !== "gati_cash_applied") continue;
      const n = Number(row.amount);
      if (Number.isFinite(n)) sum += Math.abs(n);
    }
    if (sum > 0.005) return round2(sum);
  }

  const meta = snap.checkout_metadata ?? snap.checkoutMetadata;
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    const fromMeta = Number(m.gatiCashAmount) || Number(m.gati_cash_amount);
    if (Number.isFinite(fromMeta) && fromMeta > 0.005) return round2(fromMeta);
  }

  return 0;
}

function composeCustomerBillFromSnapshot(snapshot: unknown): number {
  const snap = asBillingObject(snapshot);
  if (!snap) return 0;
  const composed =
    Math.max(0, Number(snap.item_total) || Number(snap.itemTotal) || 0) +
    Math.max(0, Number(snap.addon_total) || Number(snap.addonTotal) || 0) +
    Math.max(0, Number(snap.delivery_fee) || Number(snap.deliveryFee) || 0) +
    Math.max(0, Number(snap.platform_fee) || Number(snap.platformFee) || 0) +
    Math.max(0, Number(snap.packaging_fee) || Number(snap.packagingFee) || 0) +
    Math.max(0, Number(snap.surge_fee) || Number(snap.surgeFee) || 0) +
    Math.max(0, Number(snap.tax_total) || Number(snap.taxTotal) || 0) +
    Math.max(0, Number(snap.tip_amount) || Number(snap.tipAmount) || 0) -
    Math.max(0, Number(snap.discount_total) || Number(snap.discountTotal) || 0);
  return composed > 0 ? round2(composed) : 0;
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
