/**
 * Authoritative customer-facing delivery fee from billing_snapshot.
 *
 * Customer delivery fee (what the customer was charged at checkout) and rider
 * payout are separate. Rider accept must never replace delivery_fee with
 * rider_payout — see writeRideRiderPayoutSnapshot. This helper also repairs
 * already-corrupted snapshots at read time without a mass DB update.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? NaN);
  return Number.isFinite(n) ? n : NaN;
}

function riderPayoutFromSnapshot(snap: Record<string, unknown>): number | null {
  const payoutSnap =
    snap.rider_payout_snapshot != null && typeof snap.rider_payout_snapshot === "object"
      ? (snap.rider_payout_snapshot as Record<string, unknown>)
      : null;
  if (payoutSnap) {
    const tip = asNum(payoutSnap.customerTipAmount);
    const total = asNum(payoutSnap.totalEarning);
    if (Number.isFinite(total) && total > 0) {
      // Snapshot total may include tip; customer fee corruption used tip-stripped payout.
      const tipSafe = Number.isFinite(tip) && tip > 0 ? tip : 0;
      const withoutTip = round2(Math.max(0, total - tipSafe));
      // Prefer tip-stripped when that matches delivery_fee; else use total.
      const stored = asNum(snap.delivery_fee);
      if (Number.isFinite(stored) && Math.abs(stored - withoutTip) <= 0.51) {
        return withoutTip;
      }
      if (Number.isFinite(stored) && Math.abs(stored - total) <= 0.51) {
        return round2(total);
      }
      return withoutTip > 0 ? withoutTip : round2(total);
    }
  }
  return null;
}

/** Net customer fee implied by gross − subsidy (checkout SSOT). */
export function expectedCustomerDeliveryFeeNet(
  snap: Record<string, unknown> | null | undefined
): number | null {
  if (!snap || typeof snap !== "object") return null;
  const gross = asNum(snap.delivery_fee_gross ?? snap.deliveryFeeGross);
  if (!Number.isFinite(gross) || gross < 0) return null;
  const subsidy = asNum(snap.delivery_subsidy ?? snap.deliverySubsidy);
  const subsidySafe = Number.isFinite(subsidy) && subsidy > 0 ? subsidy : 0;
  return round2(Math.max(0, gross - subsidySafe));
}

/**
 * True when billing_snapshot.delivery_fee was overwritten with rider payout.
 */
export function isCustomerDeliveryFeeCorruptedByRiderPayout(
  snap: Record<string, unknown> | null | undefined
): boolean {
  if (!snap || typeof snap !== "object") return false;
  const current = asNum(snap.delivery_fee);
  if (!Number.isFinite(current)) return false;
  const riderPayout = riderPayoutFromSnapshot(snap);
  if (riderPayout == null || riderPayout <= 0) return false;
  if (Math.abs(current - riderPayout) > 0.51) return false;
  const expected = expectedCustomerDeliveryFeeNet(snap);
  if (expected == null) return false;
  return Math.abs(current - expected) > 0.51;
}

/**
 * Customer delivery fee charged at order placement.
 * Never falls back to rider payout / rider_payout_snapshot.
 */
export function resolveCustomerDeliveryFeeFromBilling(
  snap: Record<string, unknown> | null | undefined
): number {
  if (!snap || typeof snap !== "object") return 0;

  const expected = expectedCustomerDeliveryFeeNet(snap);
  const stored = asNum(snap.delivery_fee);
  const riderPayout = riderPayoutFromSnapshot(snap);

  if (
    Number.isFinite(stored) &&
    riderPayout != null &&
    riderPayout > 0 &&
    Math.abs(stored - riderPayout) <= 0.51 &&
    expected != null &&
    Math.abs(stored - expected) > 0.51
  ) {
    return expected;
  }

  if (Number.isFinite(stored) && stored >= 0) {
    return round2(stored);
  }

  if (expected != null) return expected;
  return 0;
}

/**
 * When persisting rider payout, restore delivery_fee if a prior bug overwrote it.
 * Does not invent values when reconstruction is impossible.
 */
export function restoreCustomerDeliveryFieldsInSnapshot(
  prevSnap: Record<string, unknown>,
  riderPayout: number
): Record<string, unknown> {
  const expected = expectedCustomerDeliveryFeeNet(prevSnap);
  if (expected == null || riderPayout <= 0) return prevSnap;

  const current = asNum(prevSnap.delivery_fee);
  const looksCorrupted =
    Number.isFinite(current) &&
    Math.abs(current - riderPayout) <= 0.51 &&
    Math.abs(current - expected) > 0.51;

  if (!looksCorrupted) return prevSnap;

  const next: Record<string, unknown> = {
    ...prevSnap,
    delivery_fee: expected,
  };
  const finalFee = asNum(prevSnap.final_delivery_fee);
  if (Number.isFinite(finalFee) && Math.abs(finalFee - riderPayout) <= 0.51) {
    next.final_delivery_fee = expected;
  }
  return next;
}
