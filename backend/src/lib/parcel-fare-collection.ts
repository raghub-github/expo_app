import { eq } from "drizzle-orm";
import type { getDb } from "../db/client.js";
import { ordersCore, ordersCorePayments, ordersParcel } from "../db/schema.js";

/**
 * Parcel fare collection (pay-at pickup / drop) — the one place that decides
 * what the customer owes and records that the fare was collected.
 *
 * Used by the rider's cash confirm, the online-QR finalizer and the zero-bill
 * (offer) path, inside the caller's transaction, so "fare collected" can never
 * be written twice or half-written.
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finite(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * What the customer owes for this parcel.
 *
 * grand_total is the authority. A ₹0 grand_total is a real ₹0 (an offer covered
 * the fare) when the billing snapshot agrees (final_amount 0) — before this the
 * resolver skipped a 0 and fell back to the raw fare, so a free parcel asked the
 * rider to collect the full fare and the collect call then refused (₹0) — stuck.
 * Legacy rows with no grand_total still fall back to final_fare / estimate / fare.
 */
export function resolveParcelCustomerPayable(row: {
  grandTotal?: unknown;
  finalFare?: unknown;
  estimatedFare?: unknown;
  fareAmount?: unknown;
  billingSnapshot?: unknown;
}): { payable: number; free: boolean } {
  const snap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};
  const grand = finite(row.grandTotal);
  const snapFinal = finite(snap.final_amount);
  if (grand != null && grand > 0) return { payable: round2(grand), free: false };
  if (grand != null && grand <= 0 && snapFinal != null && snapFinal <= 0) {
    return { payable: 0, free: true };
  }
  for (const v of [snapFinal, finite(row.finalFare), finite(row.estimatedFare), finite(row.fareAmount)]) {
    if (v != null && v > 0) return { payable: round2(v), free: false };
  }
  return { payable: 0, free: false };
}

/** True while the rider still has to collect the parcel fare at this step. */
export function isParcelFareCollectionRequired(args: {
  payAt: string | null;
  cashCollectedAt: Date | string | null;
  paymentStatus: string | null;
  payable: { payable: number; free: boolean };
}): boolean {
  if (!args.payAt) return false;
  if (args.cashCollectedAt != null) return false;
  const ps = String(args.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "paid" || ps === "completed" || ps === "captured") return false;
  return args.payable.payable > 0.005;
}

export type ParcelCollectedMethod = "cash" | "online" | "offer";

/**
 * Record that the parcel fare was collected. `paymentRow` is written only for
 * cash (the QR row is itself the online payment record; an offer has its own
 * zero-amount row).
 */
export async function applyParcelFareCollected(
  tx: Tx,
  args: {
    orderCoreId: number;
    orderIdText: string;
    riderId: number;
    customerBill: number;
    method: ParcelCollectedMethod;
    payAt: string | null;
    prevSnapshot: Record<string, unknown>;
    now: Date;
    /** Extra audit keys on the snapshot (e.g. qrId). */
    snapshotExtra?: Record<string, unknown>;
  }
): Promise<void> {
  const { now } = args;
  const bill = round2(Math.max(0, args.customerBill));
  // orders_parcel.payment_method CHECK allows cash/cod/online/upi/card/wallet/other.
  const parcelMethod = args.method === "offer" ? "other" : args.method;
  await tx
    .update(ordersParcel)
    .set({
      // An offer collects nothing, so it never claims a cash collection; the
      // completed payment status is what clears the pickup / drop fare gates.
      ...(args.method === "offer"
        ? {}
        : { cashCollectedAt: now, cashCollectedByRiderId: args.riderId }),
      amountCollected: String(bill),
      finalFare: String(bill),
      paymentMethod: parcelMethod,
      updatedAt: now,
    })
    .where(eq(ordersParcel.orderId, args.orderCoreId));

  await tx
    .update(ordersCore)
    .set({
      paymentStatus: "completed",
      paymentMethod: args.method === "offer" ? "other" : args.method,
      grandTotal: String(bill),
      billingSnapshot: {
        ...args.prevSnapshot,
        ...(args.snapshotExtra ?? {}),
        final_amount: bill,
        parcel_fare_paid_at: now.toISOString(),
        parcel_fare_paid_method: args.method,
        parcel_fare_collected_by_rider_id: args.riderId,
        ...(args.method === "offer" ? { parcel_fare_paid_by: "offer" } : {}),
      },
      updatedAt: now,
    })
    .where(eq(ordersCore.id, args.orderCoreId));

  if (args.method === "cash" || args.method === "offer") {
    await tx.insert(ordersCorePayments).values({
      orderId: args.orderIdText,
      paymentGateway: args.method === "cash" ? "cash" : "offer",
      paymentMethod: args.method === "cash" ? "CASH" : "OFFER",
      transactionId: `parcel_${args.method}:${args.orderCoreId}:${now.getTime()}`,
      amount: String(bill),
      currency: "INR",
      paymentStatus: "PAID",
      gatewayResponse: {
        source: args.method === "cash" ? "parcel_rider_cash_collect" : "parcel_zero_payable",
        payAt: args.payAt,
        amountPaid: bill,
        collectedByRiderId: args.riderId,
        method: args.method,
        ...(args.method === "offer" ? { payment_not_required: true } : {}),
      },
      paidAt: now,
    });
  }
}
