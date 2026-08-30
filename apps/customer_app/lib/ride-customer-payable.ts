/** Customer-app mirror of backend FINAL_CUSTOMER_PAYABLE (quoted + waiting). */

const RIDE_PAYABLE_EPS = 0.005;

export function roundRideCustomerPayable(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

export function isRideCustomerPaymentRequired(amount: unknown): boolean {
  return roundRideCustomerPayable(amount) > RIDE_PAYABLE_EPS;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function waitingFromSnapshot(snap: Record<string, unknown>): number {
  return Math.max(
    0,
    num(snap.waiting_charge),
    num(snap.pickup_waiting_charge),
    num(snap.waiting_charges),
    num(snap.waiting_fee)
  );
}

export function resolvePersonRideCustomerPayable(input: {
  grandTotal?: unknown;
  totalAmount?: unknown;
  checkoutMetadata?: unknown;
  billingSnapshot?: unknown;
}): number {
  const snap =
    input.billingSnapshot != null && typeof input.billingSnapshot === "object"
      ? (input.billingSnapshot as Record<string, unknown>)
      : {};
  const meta =
    input.checkoutMetadata != null && typeof input.checkoutMetadata === "object"
      ? (input.checkoutMetadata as Record<string, unknown>)
      : {};

  if (snap.ride_fare_payment_not_required === true || snap.ride_fare_paid_by === "offer") {
    return 0;
  }

  const waiting = waitingFromSnapshot(snap);
  const quotedRaw = meta.quotedGrandTotal;
  const quoted =
    quotedRaw != null && quotedRaw !== "" && Number.isFinite(Number(quotedRaw))
      ? roundRideCustomerPayable(quotedRaw)
      : null;

  if (quoted != null) {
    return roundRideCustomerPayable(quoted + waiting);
  }

  const discount = Math.max(num(snap.discount_total), num(snap.ride_fare_offer_discount));
  const fare = Math.max(num(snap.ride_fare), num(snap.fare_amount), num(snap.item_total));
  if (discount > RIDE_PAYABLE_EPS && fare > RIDE_PAYABLE_EPS && discount + RIDE_PAYABLE_EPS >= fare) {
    return roundRideCustomerPayable(waiting);
  }

  const snapFinal = snap.final_amount;
  if (snapFinal != null && snapFinal !== "") {
    return roundRideCustomerPayable(snapFinal);
  }

  return roundRideCustomerPayable(input.grandTotal ?? input.totalAmount);
}
