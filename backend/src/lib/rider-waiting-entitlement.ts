/**
 * GatiMitra Max gate for rider WAITING earning.
 *
 * Business rule: the waiting charge is still COLLECTED from the customer / merchant
 * exactly as before (funding shares unchanged). But the rider only RECEIVES the
 * waiting amount when they hold an active GatiMitra Max subscription. A rider
 * without Max is credited ₹0 for waiting — the collected charge is retained by the
 * company. Applies uniformly to food, parcel, and person ride.
 *
 * This gates the rider CREDIT only; it never changes what the customer/merchant pay.
 * The gated-away amount is returned as companyRetainedWaiting so settlement can
 * account for it (no unexplained money — see the Order Calculation Blueprint).
 */

import { getSql } from "../db/client.js";
import { riderHasActiveGmitraMax } from "../modules/rider-payout-pricing/riderPayoutPricing.repository.js";

export type RiderWaitingEntitlement = {
  /** Waiting actually credited to the rider (0 without Max). */
  riderWaiting: number;
  /** Waiting the company retains because the rider lacks Max. */
  companyRetainedWaiting: number;
  /** True when a non-Max rider's waiting was withheld. */
  gatedByMax: boolean;
  /** Resolved subscription state used for the decision. */
  hasMax: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function resolveOrderRiderId(orderCorePk: number): Promise<number | null> {
  try {
    const sql = getSql();
    const rows = await sql<{ rider_id: number | null }[]>`
      SELECT rider_id FROM orders_core WHERE id = ${orderCorePk} LIMIT 1
    `;
    const id = Number(rows[0]?.rider_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Resolve how much of a computed waiting charge the rider is actually entitled to.
 *
 * @param computedRiderWaiting  waiting the rider would earn from the payout rule
 * @param riderHasGmitraMax     precomputed subscription flag (skips the lookup)
 * @param riderId               assigned rider (used for the Max lookup)
 * @param orderCorePk           fallback to read orders_core.rider_id when riderId absent
 */
export async function resolveRiderWaitingEntitlement(args: {
  computedRiderWaiting: number;
  riderHasGmitraMax?: boolean;
  riderId?: number | null;
  orderCorePk?: number | null;
}): Promise<RiderWaitingEntitlement> {
  const gross = round2(Math.max(0, Number(args.computedRiderWaiting) || 0));
  if (gross <= 0) {
    return { riderWaiting: 0, companyRetainedWaiting: 0, gatedByMax: false, hasMax: false };
  }

  let hasMax = args.riderHasGmitraMax;
  if (hasMax === undefined) {
    let riderId = args.riderId ?? null;
    if ((riderId == null || riderId <= 0) && args.orderCorePk != null) {
      riderId = await resolveOrderRiderId(args.orderCorePk);
    }
    hasMax = riderId != null && riderId > 0 ? await riderHasActiveGmitraMax(riderId) : false;
  }

  if (hasMax) {
    return { riderWaiting: gross, companyRetainedWaiting: 0, gatedByMax: false, hasMax: true };
  }
  // Non-Max rider: withhold the rider credit, company retains the collected charge.
  return { riderWaiting: 0, companyRetainedWaiting: gross, gatedByMax: true, hasMax: false };
}
