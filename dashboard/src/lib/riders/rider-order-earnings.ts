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
import { isOrderDeliveredForRiderWalletCredit } from "@/lib/riders/rider-wallet-credit-display";
import {
  extractGatiCashAppliedFromBilling,
  resolveCustomerCtcPaidAmount,
} from "@/lib/orders/customer-ctc";

type Db = ReturnType<typeof getDb>;

export type EnrichableRiderOrder = {
  id: number;
  orderType?: string;
  status?: string;
  fareAmount?: string | number | null;
  riderEarning?: string | number | null;
  grandTotal?: string | number | null;
  itemTotal?: string | number | null;
  foodItemsTotalValue?: string | number | null;
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
  // Nested gst_totals / totals (food billing pipeline).
  for (const nestKey of ["gst_totals", "gstTotals", "totals", "bill", "summary"]) {
    const nest = obj[nestKey];
    if (nest == null || typeof nest !== "object") continue;
    const nested = nest as Record<string, unknown>;
    for (const key of keys) {
      const n = Number(nested[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
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

  const deliveryFeeGross = parseBillingAmount(input.billingSnapshot, [
    "delivery_fee_gross",
    "deliveryFeeGross",
  ]);
  const deliveryFeeNet = parseBillingAmount(input.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
  ]);
  // Prefer gross (rider base). Never treat rider-overwritten net as earnings fallback
  // when rider_payout_snapshot already exists (snapshot path above should have hit).
  const deliveryFee = deliveryFeeGross > 0 ? deliveryFeeGross : deliveryFeeNet;
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

/**
 * Rider Orders "ORDER VALUE" = customer CTC — same SSOT as order Payment details
 * (`order-payment-detail.ts` → `resolveCustomerCtcPaidAmount`).
 *
 * netPayable = orders_core.grand_total ?? billing.final_amount
 * gati      = billing / checkout_metadata only (never invent from item totals)
 * CTC        = cashin + GatiCash
 */
export function resolveOrderFareAmount(input: {
  fareAmount?: string | number | null;
  grandTotal?: string | number | null;
  itemTotal?: string | number | null;
  foodItemsTotalValue?: string | number | null;
  billingSnapshot?: unknown;
  checkoutMetadata?: unknown;
  /** Trusted GatiCash only (billing already applied). Ignored when it would double-count net. */
  gatiCashUsed?: string | number | null;
}): string | number | null {
  const snapshot =
    typeof input.billingSnapshot === "string"
      ? (() => {
          try {
            return JSON.parse(input.billingSnapshot) as unknown;
          } catch {
            return null;
          }
        })()
      : input.billingSnapshot;
  const billing =
    snapshot != null && typeof snapshot === "object"
      ? (snapshot as Record<string, unknown>)
      : null;
  const checkoutMeta =
    input.checkoutMetadata != null && typeof input.checkoutMetadata === "object"
      ? (input.checkoutMetadata as Record<string, unknown>)
      : null;

  // Same precedence as order-payment-detail: grand_total ?? billing.final_amount
  const netFromCore =
    input.grandTotal != null && Number.isFinite(Number(input.grandTotal))
      ? Number(input.grandTotal)
      : NaN;
  const netFromBilling = parseBillingAmount(billing, [
    "final_amount",
    "finalAmount",
  ]);
  const netPayable =
    Number.isFinite(netFromCore) && netFromCore > 0
      ? netFromCore
      : netFromBilling > 0
        ? netFromBilling
        : Number.isFinite(netFromCore) && netFromCore === 0
          ? 0
          : null;

  // Prefer billing Gati (matches Payment details when wallet icon is ₹0).
  // Do not prefer external/pending values that equal the full payable — that
  // double-counts CTC (e.g. 27.07 + 27.07 = 54.14).
  const gatiFromBilling = extractGatiCashAppliedFromBilling(billing, checkoutMeta);
  const gatiExplicit = Number(input.gatiCashUsed);
  let gati = gatiFromBilling;
  if (
    gati <= 0.005 &&
    Number.isFinite(gatiExplicit) &&
    gatiExplicit > 0.005
  ) {
    const net = netPayable ?? 0;
    // Only accept external gati when it looks like a wallet slice, not a copy of CTC.
    if (!(net > 0.005 && Math.abs(gatiExplicit - net) <= 0.05)) {
      gati = round2(gatiExplicit);
    }
  }

  const { ctc } = resolveCustomerCtcPaidAmount({
    netPayable,
    gatiCashUsed: gati > 0.005 ? gati : null,
    // Do not use item/food totals as capturedAmount — that diverges from Payment details.
    capturedAmount: null,
  });

  if (ctc > 0.005) return round2(ctc);

  // Person-ride / legacy: fare when core totals are empty.
  if (input.fareAmount != null && Number(input.fareAmount) > 0) {
    return round2(Number(input.fareAmount));
  }
  return null;
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
    const delivered = isOrderDeliveredForRiderWalletCredit(order);
    // Same gate as delivery credit engine: never surface Credit before delivered.
    const walletCredited = delivered && ledgerNet != null && ledgerNet > 0;
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
      !walletCredited &&
      !walletDebited &&
      !isTerminalNoPayout &&
      (ridePaymentBlocked ||
        delivered ||
        expectedEarning > 0 ||
        (ledgerNet != null && ledgerNet > 0 && !delivered));

    // Credited/debited ledger net when allowed; otherwise expected payout (pending UI).
    const displayEarning =
      walletCredited || walletDebited
        ? Math.abs(ledgerNet ?? 0)
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
        itemTotal: order.itemTotal,
        foodItemsTotalValue: order.foodItemsTotalValue,
        billingSnapshot: order.billingSnapshot,
        checkoutMetadata: order.checkoutMetadata,
      }),
      walletCredited,
      walletDebited,
      hasLedgerEntry,
      earningCreditPending,
    };
  });
}
