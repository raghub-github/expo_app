/**
 * Authoritative customer payable for person-rides.
 * Booking quotedGrandTotal + waiting is the cap; original/pre-discount fare is not.
 */

export const RIDE_PAYABLE_EPS = 0.005;

export function roundRideCustomerPayable(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

/** True when the customer still owes a collectible amount (paise precision). */
export function isRideCustomerPaymentRequired(amount: unknown): boolean {
  return roundRideCustomerPayable(amount) > RIDE_PAYABLE_EPS;
}

export function isRideFareAwaitingCustomerPayment(input: {
  paymentStatus?: string | null;
  customerPayable?: unknown;
}): boolean {
  const ps = String(input.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "paid" || ps === "completed") return false;
  if (input.customerPayable === undefined || input.customerPayable === null || input.customerPayable === "") {
    return true;
  }
  return isRideCustomerPaymentRequired(input.customerPayable);
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

/**
 * Restore customer payable from the booking quote (incl. 100% free = ₹0)
 * plus any pickup waiting added later. Never inflate back to pre-discount fare.
 */
export function resolvePersonRideCustomerPayable(input: {
  grandTotal?: unknown;
  checkoutMetadata?: unknown;
  billingSnapshot?: unknown;
  waitingCharge?: unknown;
}): number {
  const snap =
    input.billingSnapshot != null && typeof input.billingSnapshot === "object"
      ? (input.billingSnapshot as Record<string, unknown>)
      : {};
  const meta =
    input.checkoutMetadata != null && typeof input.checkoutMetadata === "object"
      ? (input.checkoutMetadata as Record<string, unknown>)
      : {};

  const waiting = Math.max(waitingFromSnapshot(snap), roundRideCustomerPayable(input.waitingCharge));
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

  return roundRideCustomerPayable(input.grandTotal);
}
