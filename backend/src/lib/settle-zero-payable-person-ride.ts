/**
 * Persist quoted customer payable and auto-settle ₹0 person-rides.
 * Idempotent — safe on complete retries, app restart, and outstanding-fare lookups.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, ordersCorePayments, ordersRide } from "../db/schema.js";
import {
  isRideCustomerPaymentRequired,
  isRideFareAwaitingCustomerPayment,
  resolvePersonRideCustomerPayable,
  roundRideCustomerPayable,
} from "./ride-customer-payable.js";

function asObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function reconcileAndSettlePersonRideCustomerPayable(orderCorePk: number): Promise<{
  orderId: string | null;
  originalFare: number;
  discountAmount: number;
  customerPayable: number;
  paymentRequired: boolean;
  paymentStatus: string | null;
  settled: boolean;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      paymentStatus: ordersCore.paymentStatus,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      billingSnapshot: ordersCore.billingSnapshot,
      checkoutMetadata: ordersCore.checkoutMetadata,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  const empty = {
    orderId: row?.orderId?.trim() ?? null,
    originalFare: 0,
    discountAmount: 0,
    customerPayable: 0,
    paymentRequired: false,
    paymentStatus: row?.paymentStatus ?? null,
    settled: false,
  };
  if (!row?.id || String(row.orderType ?? "").trim() !== "person_ride") return empty;

  const snap = asObject(row.billingSnapshot);
  const meta = asObject(row.checkoutMetadata);
  const originalFare = roundRideCustomerPayable(
    snap.ride_fare ?? snap.fare_amount ?? snap.item_total ?? row.fareAmount
  );
  const discountAmount = roundRideCustomerPayable(
    snap.discount_total ?? snap.ride_fare_offer_discount
  );
  const customerPayable = resolvePersonRideCustomerPayable({
    grandTotal: row.grandTotal,
    checkoutMetadata: meta,
    billingSnapshot: snap,
  });
  const paymentRequired = isRideFareAwaitingCustomerPayment({
    paymentStatus: row.paymentStatus,
    customerPayable,
  });

  console.info("[ride-finalize] customer_payable", {
    order_id: row.orderId,
    original_fare: originalFare,
    discount_amount: discountAmount,
    booking_quoted: meta.quotedGrandTotal ?? null,
    offer_id: snap.ride_fare_platform_offer_id ?? meta.selectedPlatformOfferId ?? null,
    customer_payable: customerPayable,
    payment_required: paymentRequired,
    payment_status: row.paymentStatus,
    order_status: row.status,
    stored_grand_total: row.grandTotal,
  });

  const currentStored = roundRideCustomerPayable(row.grandTotal);
  if (Math.abs(currentStored - customerPayable) > 0.005) {
    await db
      .update(ordersCore)
      .set({
        grandTotal: String(customerPayable),
        billingSnapshot: {
          ...snap,
          final_amount: customerPayable,
          quoted_customer_payable: customerPayable,
          original_fare: originalFare,
          discount_total: Math.max(discountAmount, Number(snap.discount_total) || 0),
        },
        updatedAt: new Date(),
      })
      .where(eq(ordersCore.id, row.id));
    await db
      .update(ordersRide)
      .set({
        finalFare: String(customerPayable),
        updatedAt: new Date(),
      })
      .where(eq(ordersRide.orderId, row.id));
  }

  if (paymentRequired || isRideCustomerPaymentRequired(customerPayable)) {
    return {
      orderId: row.orderId?.trim() ?? null,
      originalFare,
      discountAmount,
      customerPayable,
      paymentRequired: true,
      paymentStatus: row.paymentStatus,
      settled: false,
    };
  }

  const settled = await settleZeroPayablePersonRide(row.id);
  return {
    orderId: row.orderId?.trim() ?? null,
    originalFare,
    discountAmount,
    customerPayable,
    paymentRequired: false,
    paymentStatus: "completed",
    settled,
  };
}

export async function settleZeroPayablePersonRide(orderCorePk: number): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      checkoutMetadata: ordersCore.checkoutMetadata,
      grandTotal: ordersCore.grandTotal,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return false;
  const ps = String(row.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "paid" || ps === "completed") return false;
  const payable = resolvePersonRideCustomerPayable({
    grandTotal: row.grandTotal,
    checkoutMetadata: row.checkoutMetadata,
    billingSnapshot: row.billingSnapshot,
  });
  if (isRideCustomerPaymentRequired(payable)) return false;

  const snap = asObject(row.billingSnapshot);
  const orderIdText = row.orderId?.trim() || String(row.id);
  const txnId = `ride_fare_offer:${row.id}`;

  await db
    .update(ordersCore)
    .set({
      paymentStatus: "completed",
      grandTotal: "0",
      billingSnapshot: {
        ...snap,
        final_amount: 0,
        ride_fare_paid_at: typeof snap.ride_fare_paid_at === "string" && snap.ride_fare_paid_at.trim()
          ? snap.ride_fare_paid_at
          : now.toISOString(),
        ride_fare_payment_not_required: true,
        ride_fare_paid_by: "offer",
      },
      updatedAt: now,
    })
    .where(eq(ordersCore.id, row.id));

  await db
    .update(ordersRide)
    .set({
      amountCollected: "0",
      finalFare: "0",
      updatedAt: now,
    })
    .where(eq(ordersRide.orderId, row.id));

  const [existingPay] = await db
    .select({ id: ordersCorePayments.id })
    .from(ordersCorePayments)
    .where(
      and(eq(ordersCorePayments.orderId, orderIdText), eq(ordersCorePayments.transactionId, txnId))
    )
    .limit(1);

  if (!existingPay?.id) {
    try {
      await db.insert(ordersCorePayments).values({
        orderId: orderIdText,
        paymentGateway: "offer",
        paymentMethod: "OFFER",
        transactionId: txnId,
        amount: "0",
        currency: "INR",
        paymentStatus: "PAID",
        gatewayResponse: {
          source: "person_ride_zero_payable",
          amountPaid: 0,
          payment_not_required: true,
        },
        paidAt: now,
      });
    } catch (err) {
      console.warn("[ride-finalize] zero-payable payment row skipped", (err as Error).message);
    }
  }

  console.info("[ride-finalize] settled_zero_payable", {
    order_id: orderIdText,
    customer_payable: 0,
    payment_required: false,
    payment_status: "completed",
  });
  return true;
}

/** Best-effort repair for already-delivered free rides still stuck in payment pending. */
export async function maybeReconcileDeliveredPersonRidePayable(orderCorePk: number): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);
  if (!row?.id) return;
  if (String(row.orderType ?? "").trim() !== "person_ride") return;
  if (String(row.status ?? "").trim().toLowerCase() !== "delivered") return;
  await reconcileAndSettlePersonRideCustomerPayable(row.id);
}

/** Throws 409 when customer payable is ₹0 / already settled — no Razorpay, QR, or cash collect. */
export async function assertRideCustomerPaymentCollectable(orderCorePk: number): Promise<number> {
  const result = await reconcileAndSettlePersonRideCustomerPayable(orderCorePk);
  if (!result.paymentRequired || !isRideCustomerPaymentRequired(result.customerPayable)) {
    throw Object.assign(new Error("Ride fare is already settled"), {
      statusCode: 409,
      code: "ALREADY_SETTLED",
    });
  }
  return result.customerPayable;
}
