/**
 * Resolve rider order earnings for API responses.
 * Source of truth after delivery: wallet_ledger (rider_earn:delivery:* + rider_earn:tip:*).
 * orders_core.rider_earning stores delivery+tip total — never add tip twice.
 */

import { getSql } from "../db/client.js";

export type RiderEarningBreakdown = {
  baseEarning: number;
  customerTipAmount?: number;
  totalEarning: number;
  estimatedEarning: number;
};

function round0(n: number): number {
  return Math.round(n);
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

function parseTip(tipAmount: unknown): number {
  const tip = Number(tipAmount);
  return Number.isFinite(tip) && tip > 0 ? round0(tip) : 0;
}

export function resolveRiderDeliveryFeeFromBilling(row: {
  fareAmount: string | null;
  billingSnapshot?: unknown;
}): number {
  // Rider Fare Engine base = the GROSS/standard delivery fare (pre-subsidy), so
  // rider payout is independent of the customer delivery fee. Free delivery /
  // coupons / membership only affect the customer-facing net `delivery_fee`.
  // Fall back to net for pre-migration orders that have no gross field.
  const fromGross = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee_gross",
    "deliveryFeeGross",
    "delivery_fee_original",
    "deliveryFeeOriginal",
  ]);
  if (fromGross > 0) return round0(fromGross);

  // Net customer delivery_fee is NOT a rider base. Only use it when gross is
  // missing (pre-subsidy migration) AND it was not overwritten by rider payout.
  const snap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : null;
  const payoutSnap =
    snap?.rider_payout_snapshot != null && typeof snap.rider_payout_snapshot === "object"
      ? (snap.rider_payout_snapshot as Record<string, unknown>)
      : null;
  const riderPayoutHint = payoutSnap != null ? Number(payoutSnap.totalEarning) : NaN;
  const fromBilling = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
  ]);
  if (
    fromBilling > 0 &&
    !(
      Number.isFinite(riderPayoutHint) &&
      riderPayoutHint > 0 &&
      Math.abs(fromBilling - riderPayoutHint) <= 0.51
    )
  ) {
    return round0(fromBilling);
  }

  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round0(fare);

  return 0;
}

export function resolveRiderOrderEarnings(
  row: {
    riderEarning: string | null;
    fareAmount: string | null;
    tipAmount?: string | null;
    billingSnapshot?: unknown;
  },
  ledgerTotal?: number | null
): RiderEarningBreakdown {
  const tip = parseTip(row.tipAmount);

  if (ledgerTotal != null && ledgerTotal > 0) {
    const total = round0(ledgerTotal);
    const base = tip > 0 && total >= tip ? total - tip : total;
    return {
      baseEarning: base,
      customerTipAmount: tip > 0 ? tip : undefined,
      totalEarning: total,
      estimatedEarning: total,
    };
  }

  const directTotal = Number(row.riderEarning);
  if (Number.isFinite(directTotal) && directTotal > 0) {
    const total = round0(directTotal);
    const base = tip > 0 && total >= tip ? total - tip : total;
    return {
      baseEarning: base,
      customerTipAmount: tip > 0 ? tip : undefined,
      totalEarning: total,
      estimatedEarning: total,
    };
  }

  const deliveryFee = resolveRiderDeliveryFeeFromBilling(row);
  const total = deliveryFee + tip;
  return {
    baseEarning: deliveryFee,
    customerTipAmount: tip > 0 ? tip : undefined,
    totalEarning: total,
    estimatedEarning: total,
  };
}

/** Batch ledger totals keyed by orders_core.id */
export async function fetchLedgerEarningsByCoreIds(
  riderId: number,
  coreIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (coreIds.length === 0) return map;

  const sql = getSql();
  const rows = await sql`
    SELECT
      split_part(ref, ':', 3)::int AS core_id,
      ROUND(SUM(amount::numeric), 2) AS total
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND ref ~ '^rider_earn:(delivery|tip):[0-9]+$'
      AND split_part(ref, ':', 3)::int = ANY(${coreIds}::int[])
    GROUP BY split_part(ref, ':', 3)
  `;

  for (const row of rows as { core_id?: number; total?: unknown }[]) {
    const id = Number(row.core_id);
    const total = Number(row.total);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(total) && total > 0) {
      map.set(id, round0(total));
    }
  }
  return map;
}

export async function fetchLedgerEarningForCoreId(
  riderId: number,
  coreId: number
): Promise<number | null> {
  const map = await fetchLedgerEarningsByCoreIds(riderId, [coreId]);
  return map.get(coreId) ?? null;
}
