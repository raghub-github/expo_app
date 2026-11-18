import { and, eq, or } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { reconcileAndSettlePersonRideCustomerPayable } from "../../lib/settle-zero-payable-person-ride.js";
import { insertRideCustomerPaymentSnapshot } from "../../lib/persist-ride-customer-payment-snapshot.js";
import { computeRideBillForCustomerOrder } from "./ride-bill.service.js";
import { rideBillingToSettlementComponents } from "./settlement/billingToComponents.js";
import { postOnlineRideSettlement } from "./settlement/rideSettlement.engine.js";

/**
 * Free (offer) Person Ride: an offer covered the whole fare, so the customer owes
 * ₹0 — and the rider is still paid their full earning, by the company.
 *
 * Before this the ride was marked paid and the rider credited by the legacy
 * delivery-credit path, with no ride_settlements row (no subsidy on record, no
 * breakdown, not in the reconciler). Now it goes through the ONE settlement
 * engine like every cash and online ride: wallet credit = the rider's earning
 * (never below what they accepted), the whole amount recorded as company subsidy.
 *
 * ₹0 is decided on the server from the bill — a client saying "free" is ignored.
 * Idempotent: the settlement row is unique per order.
 */

export type ZeroBillRideResult = {
  ok: true;
  orderId: string;
  alreadySettled: boolean;
  settlementId: string | null;
  riderEntitlement: number;
  walletCredit: number;
  walletBalanceAfter: number | null;
};

export async function settleZeroBillRide(orderCorePk: number): Promise<ZeroBillRideResult> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      customerId: ordersCore.customerId,
      riderId: ordersCore.riderId,
      settlementId: ordersRide.settlementId,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);
  if (!row?.id || String(row.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }
  const orderIdText = row.orderId?.trim() || String(row.id);
  if (row.settlementId) {
    return {
      ok: true,
      orderId: orderIdText,
      alreadySettled: true,
      settlementId: row.settlementId,
      riderEntitlement: 0,
      walletCredit: 0,
      walletBalanceAfter: null,
    };
  }
  if (normalizeCustomerOrderStatus(row.currentStatus, row.status) !== "DELIVERED") {
    throw Object.assign(new Error("The ride is not completed yet"), { statusCode: 409 });
  }

  // Server-side payable — marks the ₹0 ride paid-by-offer, or reports it is not free.
  const payable = await reconcileAndSettlePersonRideCustomerPayable(row.id);
  if (payable.paymentRequired) {
    throw Object.assign(
      new Error(`The passenger still has to pay ₹${payable.customerPayable}`),
      { statusCode: 409, code: "PAYMENT_REQUIRED" }
    );
  }

  const customerPk = row.customerId != null ? Number(row.customerId) : 0;
  const billRes = await computeRideBillForCustomerOrder(db, { customerPk, orderRef: orderIdText });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), {
      statusCode: billRes.statusCode ?? 400,
      code: billRes.code,
    });
  }
  const riderId = row.riderId != null ? Number(row.riderId) : null;

  const snapshotId = await insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: row.id,
    orderIdText,
    customerId: customerPk,
    phase: "payment_confirmed",
    billing: billRes.billing,
    billingSnapshot: billRes.snapshot,
    rideContext: { rideType: null },
    paymentContext: {
      paymentMethod: "offer",
      gatiCashApplied: 0,
      razorpayAmount: 0,
      amountPaid: 0,
    },
    metadata: { source: "person_ride_zero_payable" },
  });

  const posting = await postOnlineRideSettlement({
    orderCoreId: row.id,
    orderIdText,
    riderId,
    customerId: customerPk,
    billing: {
      customerBill: 0,
      components: rideBillingToSettlementComponents(billRes.billing, billRes.snapshot),
      billingSnapshotId: snapshotId,
      billingSnapshot: { ...(billRes.snapshot ?? {}), final_amount: 0 },
    },
    geo: {},
    paymentSplit: { gatiCashApplied: 0, razorpayAmount: 0, razorpayOrderId: null, razorpayPaymentId: null },
    paidBy: "offer",
  });

  return {
    ok: true,
    orderId: orderIdText,
    alreadySettled: posting.alreadySettled,
    settlementId: posting.settlementId,
    riderEntitlement: posting.settlement?.riderEarnings ?? 0,
    walletCredit: posting.settlement?.walletCredit ?? 0,
    walletBalanceAfter: posting.walletBalanceAfter ?? null,
  };
}

function riderOrderRefWhere(riderId: number, orderRef: string) {
  const trimmed = orderRef.trim();
  if (/^\d+$/.test(trimmed)) {
    return and(eq(ordersCore.riderId, riderId), eq(ordersCore.id, Number(trimmed)));
  }
  return and(
    eq(ordersCore.riderId, riderId),
    or(eq(ordersCore.orderId, trimmed), eq(ordersCore.formattedOrderId, trimmed))
  );
}

/** Rider taps "Complete free ride" — the assigned rider only; idempotent. */
export async function completeZeroBillRideForRider(input: {
  riderId: number;
  orderRef: string;
}): Promise<ZeroBillRideResult> {
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Invalid rider session"), { statusCode: 403 });
  }
  const db = getDb();
  const [row] = await db
    .select({ id: ordersCore.id, orderType: ordersCore.orderType })
    .from(ordersCore)
    .where(riderOrderRefWhere(riderId, input.orderRef))
    .limit(1);
  if (!row?.id || String(row.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }
  return settleZeroBillRide(row.id);
}

/** Whether this delivered ride already carries a legacy delivery credit (pre-engine free ride). */
export async function hasLegacyRideDeliveryCredit(orderCorePk: number, riderId: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM wallet_ledger
    WHERE rider_id = ${riderId} AND ref = ${`rider_earn:delivery:${orderCorePk}`}
    LIMIT 1
  `;
  return rows.length > 0;
}
