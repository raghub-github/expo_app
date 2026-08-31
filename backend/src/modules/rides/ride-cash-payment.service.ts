import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { isRideFarePaymentPending } from "../../lib/ride-rider-payout-snapshot.js";
import { assertRideCustomerPaymentCollectable } from "../../lib/settle-zero-payable-person-ride.js";
import { insertRideCustomerPaymentSnapshot } from "../../lib/persist-ride-customer-payment-snapshot.js";
import { computeRideBillForCustomerOrder } from "./ride-bill.service.js";
import { rideBillingToSettlementComponents } from "./settlement/billingToComponents.js";
import { postCashRideSettlement } from "./settlement/rideSettlement.engine.js";
import type { SettlementPostingResult } from "./settlement/rideSettlement.engine.js";

/**
 * Ride cash-collection confirmation.
 *
 * Called by the rider app after a cash ride is DELIVERED. Runs the same
 * customer bill computation the online flow uses (single source of truth), then
 * routes the settlement through the Ride Settlement Engine which:
 *   1. records an immutable ride_settlements row,
 *   2. posts paired debit/credit lines to ride_settlement_ledger, including
 *      the informational "rider kept earnings in cash" credit,
 *   3. debits the rider's wallet by company_receivable ONLY (never the full
 *      customer fare), and
 *   4. resyncs negative-wallet blocks so the rider is auto-blocked as soon as
 *      wallet hits the configured threshold.
 *
 * The rider never receives a wallet credit for cash rides — the rider
 * physically kept the money. This matches Uber/Ola/Rapido cash economics.
 */

export type ConfirmRideCashCollectionInput = {
  riderId: number;
  orderRef: string;
};

export type ConfirmRideCashCollectionResult = {
  ok: true;
  alreadySettled: boolean;
  orderId: string;
  customerBill: number;
  companyReceivable: number;
  walletDebit: number;
  walletBalanceAfter: number | null;
  settlementId: string;
};

function normalizePaymentMethod(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function isCashPaymentMethod(method: string): boolean {
  return method === "cash" || method === "cod";
}

function riderOrderRefWhere(riderId: number, orderRef: string) {
  const trimmed = orderRef.trim();
  const isNumeric = /^\d+$/.test(trimmed);
  if (isNumeric) {
    return and(eq(ordersCore.riderId, riderId), eq(ordersCore.id, Number(trimmed)));
  }
  return and(
    eq(ordersCore.riderId, riderId),
    or(eq(ordersCore.orderId, trimmed), eq(ordersCore.formattedOrderId, trimmed))
  );
}

export async function confirmRideCashCollectionForRider(
  input: ConfirmRideCashCollectionInput
): Promise<ConfirmRideCashCollectionResult> {
  const db = getDb();
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Invalid rider session"), { statusCode: 403 });
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      customerId: ordersCore.customerId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      billingSnapshot: ordersCore.billingSnapshot,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      checkoutMetadata: ordersCore.checkoutMetadata,
      riderId: ordersCore.riderId,
      rideSettlementId: ordersRide.settlementId,
      cashCollectedAt: ordersRide.cashCollectedAt,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(riderOrderRefWhere(riderId, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Not a ride order"), { statusCode: 400 });
  }
  if (Number(orderRow.riderId) !== riderId) {
    throw Object.assign(new Error("You are not the assigned rider for this order"), {
      statusCode: 403,
    });
  }
  const status = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (status !== "DELIVERED") {
    throw Object.assign(new Error("Cash can be collected only after the ride is completed"), {
      statusCode: 409,
    });
  }
  const method = normalizePaymentMethod(orderRow.paymentMethod);
  if (!isCashPaymentMethod(method)) {
    throw Object.assign(new Error("This ride is not a cash payment"), {
      statusCode: 409,
      code: "NOT_CASH_ORDER",
    });
  }

  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;
  if (!Number.isFinite(customerPk) || customerPk <= 0) {
    throw Object.assign(new Error("Order has no linked customer"), { statusCode: 400 });
  }

  // Idempotent short-circuit — the settlement engine also guards on this but
  // we prefer to return a 200 quickly if the rider taps twice.
  if (orderRow.rideSettlementId && !isRideFarePaymentPending(orderRow.paymentStatus)) {
    const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
    return {
      ok: true,
      alreadySettled: true,
      orderId: orderIdText,
      customerBill: 0,
      companyReceivable: 0,
      walletDebit: 0,
      walletBalanceAfter: null,
      settlementId: orderRow.rideSettlementId,
    };
  }
  if (!isRideFarePaymentPending(orderRow.paymentStatus)) {
    throw Object.assign(new Error("Ride fare is already paid"), { statusCode: 409 });
  }

  const settledPayable = await assertRideCustomerPaymentCollectable(orderRow.id);

  const billRes = await computeRideBillForCustomerOrder(db, {
    customerPk,
    orderRef: input.orderRef,
  });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), {
      statusCode: billRes.statusCode ?? 400,
      code: billRes.code,
    });
  }

  const customerBill = Math.round(Math.min(billRes.billing.final_amount, settledPayable) * 100) / 100;
  if (!(customerBill > 0)) {
    throw Object.assign(new Error("Ride fare is already paid"), { statusCode: 409 });
  }

  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);

  // Persist a payment_confirmed snapshot with method=cash so the audit surface
  // (customer app receipt + admin reports) always shows the cash lineage.
  const snapshotId = await insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: orderRow.id,
    orderIdText,
    customerId: customerPk,
    phase: "payment_confirmed",
    billing: billRes.billing,
    billingSnapshot: billRes.snapshot,
    rideContext: {
      rideType:
        (typeof orderRow.billingSnapshot === "object" && orderRow.billingSnapshot
          ? ((orderRow.billingSnapshot as { rideType?: string }).rideType ?? null)
          : null) ?? null,
    },
    paymentContext: {
      paymentMethod: "cash",
      gatiCashApplied: 0,
      razorpayAmount: 0,
      amountPaid: customerBill,
    },
    metadata: { source: "rider_cash_collection_confirm" },
  });

  const meta =
    orderRow.checkoutMetadata != null && typeof orderRow.checkoutMetadata === "object"
      ? (orderRow.checkoutMetadata as Record<string, unknown>)
      : {};

  const posting: SettlementPostingResult = await postCashRideSettlement({
    orderCoreId: orderRow.id,
    orderIdText,
    riderId,
    customerId: customerPk,
    billing: {
      customerBill,
      components: rideBillingToSettlementComponents(billRes.billing, billRes.snapshot),
      billingSnapshotId: snapshotId,
      billingSnapshot: {
        ...(billRes.snapshot ?? {}),
        final_amount: customerBill,
      },
    },
    geo: {
      pickupLat: Number(orderRow.pickupLat ?? 0),
      pickupLng: Number(orderRow.pickupLon ?? 0),
      pickupPincode:
        typeof (meta as { pickupPincode?: unknown }).pickupPincode === "string"
          ? String((meta as { pickupPincode?: unknown }).pickupPincode)
          : null,
      pickupState:
        typeof (meta as { pickupState?: unknown }).pickupState === "string"
          ? String((meta as { pickupState?: unknown }).pickupState)
          : null,
    },
  });

  return {
    ok: true,
    alreadySettled: posting.alreadySettled,
    orderId: orderIdText,
    customerBill,
    companyReceivable: posting.settlement?.companyReceivable ?? 0,
    walletDebit: posting.settlement?.walletDebit ?? 0,
    walletBalanceAfter: posting.walletBalanceAfter ?? null,
    settlementId: posting.settlementId,
  };
}
