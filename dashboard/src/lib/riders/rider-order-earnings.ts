/**
 * Resolve rider order fare/earning for dashboard when orders_core columns are empty.
 * Source of truth after delivery: wallet_ledger (rider_earn:delivery:* + rider_earn:tip:*).
 */

import { walletLedger } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { and, eq, inArray, or, like } from "drizzle-orm";
import { isRideRiderWalletCreditBlocked } from "@/lib/riders/ride-wallet-credit-pending";
import { resolveRiderPayoutTotalForDisplay } from "@/lib/riders/rider-payout-snapshot";
import { isLedgerCreditEntryType } from "@/lib/riders/rider-ledger-display";
import { extractOrderCoreIdFromLedger } from "@/lib/riders/rider-ledger-resolve";

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
  acceptPayoutSnapshot?: unknown;
  assignmentRiderEarning?: string | number | null;
  assignmentTipAmount?: string | number | null;
  paymentStatus?: string | null;
  adminRiderPaymentClearedAt?: Date | string | null;
  walletCredited?: boolean;
  /** True when net wallet_ledger impact for this order is a debit (e.g. cancel penalty). */
  walletDebited?: boolean;
  /** True when at least one wallet_ledger row is linked to this order. */
  hasLedgerEntry?: boolean;
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
  acceptPayoutSnapshot?: unknown;
  assignmentRiderEarning?: string | number | null;
  assignmentTipAmount?: string | number | null;
}): number {
  const snapTotal = resolveRiderPayoutTotalForDisplay({
    billingSnapshot: input.billingSnapshot,
    acceptPayoutSnapshot: input.acceptPayoutSnapshot,
  });
  if (snapTotal != null && snapTotal > 0) return snapTotal;

  const assignmentBase = Number(input.assignmentRiderEarning);
  const assignmentTip = Number(input.assignmentTipAmount);
  if (Number.isFinite(assignmentBase) && assignmentBase > 0) {
    const tip =
      Number.isFinite(assignmentTip) && assignmentTip > 0 ? assignmentTip : 0;
    return round2(assignmentBase + tip);
  }

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

  const orderIds = orders.map((o) => o.id).filter((id) => Number.isFinite(id));
  const earnRefs = orderIds.flatMap((id) => ledgerRefPrefix(id));
  const refMatchers = [] as Array<ReturnType<typeof inArray> | ReturnType<typeof like>>;
  if (earnRefs.length > 0) {
    refMatchers.push(inArray(walletLedger.ref, earnRefs));
  }
  for (const id of orderIds) {
    refMatchers.push(like(walletLedger.ref, `rider_cancel_pen:${id}:%`));
  }

  const ledgerEntries =
    refMatchers.length === 0
      ? []
      : await db
          .select({
            ref: walletLedger.ref,
            amount: walletLedger.amount,
            entryType: walletLedger.entryType,
            metadata: walletLedger.metadata,
          })
          .from(walletLedger)
          .where(
            and(
              eq(walletLedger.riderId, riderId),
              or(...refMatchers),
            ),
          );

  /** Signed net ledger impact per order (credits +, debits −). */
  const ledgerNetByCoreId = new Map<number, number>();
  const ledgerHitByCoreId = new Set<number>();
  for (const entry of ledgerEntries) {
    const meta =
      entry.metadata != null && typeof entry.metadata === "object"
        ? (entry.metadata as Record<string, unknown>)
        : null;
    const coreId = extractOrderCoreIdFromLedger(entry.ref, meta);
    if (coreId == null || !Number.isFinite(coreId)) continue;
    const amount = Math.abs(Number(entry.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const entryType = String(entry.entryType ?? "");
    const signed = isLedgerCreditEntryType(entryType) ? amount : -amount;
    ledgerHitByCoreId.add(coreId);
    ledgerNetByCoreId.set(coreId, round2((ledgerNetByCoreId.get(coreId) ?? 0) + signed));
  }

  return orders.map((order) => {
    const hasLedgerEntry = ledgerHitByCoreId.has(order.id);
    const ledgerNet = hasLedgerEntry ? (ledgerNetByCoreId.get(order.id) ?? 0) : null;
    const walletCredited = ledgerNet != null && ledgerNet > 0;
    const walletDebited = ledgerNet != null && ledgerNet < 0;
    const expectedEarning = resolveRiderEarningFromOrderFields({
      riderEarning: order.riderEarning,
      fareAmount: order.fareAmount,
      grandTotal: order.grandTotal,
      tipAmount: order.tipAmount,
      billingSnapshot: order.billingSnapshot,
      acceptPayoutSnapshot: order.acceptPayoutSnapshot,
      assignmentRiderEarning: order.assignmentRiderEarning,
      assignmentTipAmount: order.assignmentTipAmount,
    });
    const ridePaymentBlocked =
      !hasLedgerEntry &&
      isRideRiderWalletCreditBlocked({
        orderType: order.orderType,
        status: order.status,
        paymentStatus: order.paymentStatus,
        adminRiderPaymentClearedAt: order.adminRiderPaymentClearedAt,
      });
    const statusKey = String(order.status ?? "").trim().toLowerCase();
    const isTerminalNoPayout =
      statusKey === "cancelled" || statusKey === "failed";
    /** Waiting on wallet credit (ride payment hold, delivered, or active with known payout). */
    const earningCreditPending =
      !hasLedgerEntry &&
      !isTerminalNoPayout &&
      (ridePaymentBlocked || statusKey === "delivered" || expectedEarning > 0);

    // Ledger net when present; otherwise expected payout (may render with strikethrough in UI).
    const displayEarning =
      ledgerNet != null
        ? Math.abs(ledgerNet)
        : expectedEarning > 0
          ? expectedEarning
          : Number(order.riderEarning) > 0
            ? round2(Number(order.riderEarning))
            : 0;

    return {
      ...order,
      riderEarning: displayEarning > 0 ? displayEarning : order.riderEarning,
      fareAmount: resolveOrderFareAmount({
        fareAmount: order.fareAmount,
        grandTotal: order.grandTotal,
        billingSnapshot: order.billingSnapshot,
      }),
      walletCredited,
      walletDebited,
      hasLedgerEntry,
      earningCreditPending,
    };
  });
}
