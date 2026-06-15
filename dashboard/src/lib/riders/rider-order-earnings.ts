/**
 * Resolve rider order fare/earning for dashboard when orders_core columns are empty.
 * Source of truth after delivery: wallet_ledger (rider_earn:delivery:* + rider_earn:tip:*).
 */

import { walletLedger } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { and, eq, inArray } from "drizzle-orm";
import { isRideRiderWalletCreditBlocked } from "@/lib/riders/ride-wallet-credit-pending";

type Db = ReturnType<typeof getDb>;

export type EnrichableRiderOrder = {
  id: number;
  orderType?: string;
  status?: string;
  fareAmount?: string | number | null;
  riderEarning?: string | number | null;
  grandTotal?: string | number | null;
  tipAmount?: string | number | null;
  billingSnapshot?: unknown;
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: Date | string | null;
  walletCredited?: boolean;
  earningCreditPending?: boolean;
  [key: string]: unknown;
};

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

export function resolveRiderEarningFromOrderFields(input: {
  riderEarning?: string | number | null;
  fareAmount?: string | number | null;
  grandTotal?: string | number | null;
  tipAmount?: string | number | null;
  billingSnapshot?: unknown;
}): number {
  const direct = Number(input.riderEarning);
  if (Number.isFinite(direct) && direct > 0) return round2(direct);

  const deliveryFee = parseBillingAmount(input.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
    "deliveryFeeQuotedInr",
  ]);
  const tipFromColumn = Number(input.tipAmount);
  const tipFromBilling = parseBillingAmount(input.billingSnapshot, [
    "tip_amount",
    "tipAmount",
  ]);
  const tip =
    Number.isFinite(tipFromColumn) && tipFromColumn > 0
      ? tipFromColumn
      : tipFromBilling;

  if (deliveryFee > 0 || tip > 0) return round2(deliveryFee + tip);

  const fare = Number(input.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round2(fare + (tip > 0 ? tip : 0));

  return 0;
}

export function resolveOrderFareAmount(input: {
  fareAmount?: string | number | null;
  grandTotal?: string | number | null;
  billingSnapshot?: unknown;
}): string | number | null {
  if (input.fareAmount != null && Number(input.fareAmount) > 0) {
    return input.fareAmount;
  }
  if (input.grandTotal != null && Number(input.grandTotal) > 0) {
    return input.grandTotal;
  }
  const fromBilling = parseBillingAmount(input.billingSnapshot, [
    "final_amount",
    "grand_total",
    "grandTotal",
  ]);
  return fromBilling > 0 ? fromBilling : input.fareAmount ?? input.grandTotal ?? null;
}

function ledgerRefPrefix(coreId: number) {
  return [`rider_earn:delivery:${coreId}`, `rider_earn:tip:${coreId}`];
}

export async function enrichRiderOrdersWithEarnings<T extends EnrichableRiderOrder>(
  db: Db,
  riderId: number,
  orders: T[],
): Promise<T[]> {
  if (orders.length === 0) return orders;

  const refs = orders.flatMap((o) => ledgerRefPrefix(o.id));
  const ledgerEntries =
    refs.length === 0
      ? []
      : await db
          .select({ ref: walletLedger.ref, amount: walletLedger.amount })
          .from(walletLedger)
          .where(
            and(eq(walletLedger.riderId, riderId), inArray(walletLedger.ref, refs)),
          );

  const ledgerTotalByCoreId = new Map<number, number>();
  for (const entry of ledgerEntries) {
    const ref = entry.ref ?? "";
    const match = /^rider_earn:(?:delivery|tip):(\d+)$/.exec(ref);
    if (!match) continue;
    const coreId = Number(match[1]);
    if (!Number.isFinite(coreId)) continue;
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) continue;
    ledgerTotalByCoreId.set(coreId, round2((ledgerTotalByCoreId.get(coreId) ?? 0) + amount));
  }

  return orders.map((order) => {
    const ledgerTotal = ledgerTotalByCoreId.get(order.id);
    const walletCredited = ledgerTotal != null && ledgerTotal > 0;
    const earningCreditPending =
      !walletCredited &&
      isRideRiderWalletCreditBlocked({
        orderType: order.orderType,
        status: order.status,
        paymentStatus: order.paymentStatus,
        adminRiderPaymentClearedAt: order.adminRiderPaymentClearedAt,
      });
    const resolvedEarning = earningCreditPending
      ? 0
      : walletCredited
        ? ledgerTotal!
        : resolveRiderEarningFromOrderFields({
            riderEarning: order.riderEarning,
            fareAmount: order.fareAmount,
            grandTotal: order.grandTotal,
            tipAmount: order.tipAmount,
            billingSnapshot: order.billingSnapshot,
          });

    return {
      ...order,
      riderEarning: earningCreditPending ? null : resolvedEarning > 0 ? resolvedEarning : order.riderEarning,
      fareAmount: resolveOrderFareAmount({
        fareAmount: order.fareAmount,
        grandTotal: order.grandTotal,
        billingSnapshot: order.billingSnapshot,
      }),
      walletCredited,
      earningCreditPending,
    };
  });
}
