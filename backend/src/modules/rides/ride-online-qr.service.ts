import { and, eq, or, desc } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCore, ordersCorePayments, ordersRide } from "../../db/schema.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { isRideFarePaymentPending } from "../../lib/ride-rider-payout-snapshot.js";
import { assertRideCustomerPaymentCollectable } from "../../lib/settle-zero-payable-person-ride.js";
import { insertRideCustomerPaymentSnapshot } from "../../lib/persist-ride-customer-payment-snapshot.js";
import { computeRideBillForCustomerOrder } from "./ride-bill.service.js";
import { rideBillingToSettlementComponents } from "./settlement/billingToComponents.js";
import { postOnlineRideSettlement } from "./settlement/rideSettlement.engine.js";
import { createRazorpayQrCode } from "../../services/payment/razorpayService.js";
import { getEnv } from "../../config/env.js";
import { ulid } from "ulid";

/**
 * Rider-presented dynamic UPI QR for a COMPLETED person ride (online collection).
 *
 * Flow: rider picks "Online" at completion → this creates a single-use, fixed-amount
 * Razorpay QR for the exact customer bill → the passenger scans and pays → Razorpay
 * fires `qr_code.credited` → finalizeRideOnlineQrPayment (backend-authoritative) posts
 * the online settlement (rider wallet CREDIT = earnings). The QR/amount/ride reference
 * cannot be altered by the client (§29–30). The SDK/app callback never finalizes.
 */

const QR_TTL_SECONDS = 30 * 60; // auto-close after 30 minutes
const QR_GATEWAY = "razorpay";
const QR_METHOD = "upi_qr";
const QR_SOURCE = "ride_online_qr";

function buildDummyQrImageUrl(orderIdText: string, amount: number): string {
  const upiPayload = `upi://pay?pa=gatimitra@razorpay&pn=GatiMitra&am=${amount}&cu=INR&tn=${orderIdText}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(upiPayload)}`;
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

export type CreateRideOnlineQrInput = { riderId: number; orderRef: string };
export type CreateRideOnlineQrResult = {
  ok: true;
  orderId: string;
  qrId: string;
  qrImageUrl: string;
  amount: number;
  reused: boolean;
};

export async function createRideOnlineQr(
  input: CreateRideOnlineQrInput
): Promise<CreateRideOnlineQrResult> {
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
      riderId: ordersCore.riderId,
      settlementId: ordersRide.settlementId,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(riderOrderRefWhere(riderId, input.orderRef))
    .limit(1);

  if (!orderRow?.id) throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Not a ride order"), { statusCode: 400 });
  }
  if (Number(orderRow.riderId) !== riderId) {
    throw Object.assign(new Error("You are not the assigned rider for this order"), { statusCode: 403 });
  }
  const status = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (status !== "DELIVERED") {
    throw Object.assign(new Error("Online payment can be collected only after the ride is completed"), { statusCode: 409 });
  }
  if (orderRow.settlementId || !isRideFarePaymentPending(orderRow.paymentStatus)) {
    throw Object.assign(new Error("Ride fare is already settled"), { statusCode: 409, code: "ALREADY_SETTLED" });
  }

  const customerBillCap = await assertRideCustomerPaymentCollectable(orderRow.id);

  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;
  if (!Number.isFinite(customerPk) || customerPk <= 0) {
    throw Object.assign(new Error("Order has no linked customer"), { statusCode: 400 });
  }
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);

  const billRes = await computeRideBillForCustomerOrder(db, { customerPk, orderRef: input.orderRef });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), { statusCode: billRes.statusCode ?? 400, code: billRes.code });
  }
  const customerBill = Math.round(Math.min(billRes.billing.final_amount, customerBillCap) * 100) / 100;
  if (!(customerBill > 0)) throw Object.assign(new Error("Ride fare is already settled"), { statusCode: 409, code: "ALREADY_SETTLED" });

  // Idempotent: reuse an existing still-open QR for this order (rider re-opened the screen).
  const [existing] = await db
    .select({
      id: ordersCorePayments.id,
      transactionId: ordersCorePayments.transactionId,
      paymentStatus: ordersCorePayments.paymentStatus,
      gatewayResponse: ordersCorePayments.gatewayResponse,
      amount: ordersCorePayments.amount,
    })
    .from(ordersCorePayments)
    .where(and(eq(ordersCorePayments.orderId, orderIdText), eq(ordersCorePayments.paymentMethod, QR_METHOD)))
    .orderBy(desc(ordersCorePayments.createdAt))
    .limit(1);

  if (
    existing &&
    String(existing.paymentStatus ?? "").toUpperCase() === "INITIATED" &&
    Number(existing.amount) === customerBill
  ) {
    const gr = (existing.gatewayResponse ?? {}) as { imageUrl?: string; closeBy?: number };
    const notExpired = typeof gr.closeBy === "number" ? gr.closeBy * 1000 > Date.now() : true;
    if (gr.imageUrl && notExpired && existing.transactionId) {
      return {
        ok: true,
        orderId: orderIdText,
        qrId: existing.transactionId,
        qrImageUrl: gr.imageUrl,
        amount: customerBill,
        reused: true,
      };
    }
  }

  const closeBy = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;

  const env = getEnv();
  const dummyModeActive =
    env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET;

  if (dummyModeActive) {
    if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
      throw Object.assign(new Error("Payment gateway not configured"), {
        statusCode: 503,
        code: "QR_CREATE_FAILED",
      });
    }
    const qrId = `dummy_qr_${ulid()}`;
    const qrImageUrl = buildDummyQrImageUrl(orderIdText, customerBill);
    await db.insert(ordersCorePayments).values({
      orderId: orderIdText,
      paymentGateway: "dummy",
      paymentMethod: QR_METHOD,
      transactionId: qrId,
      amount: String(customerBill),
      currency: "INR",
      paymentStatus: "INITIATED",
      gatewayResponse: {
        source: QR_SOURCE,
        qrId,
        imageUrl: qrImageUrl,
        amount: customerBill,
        closeBy,
        dummyMode: true,
      },
    });
    return {
      ok: true,
      orderId: orderIdText,
      qrId,
      qrImageUrl,
      amount: customerBill,
      reused: false,
    };
  }

  const qr = await createRazorpayQrCode({
    amountPaise: Math.round(customerBill * 100),
    description: `GatiMitra ride ${orderIdText}`,
    closeBy,
    notes: {
      orderRef: orderIdText,
      orderCoreId: String(orderRow.id),
      customerId: String(customerPk),
      riderId: String(riderId),
      service: "person_ride",
    },
  });

  await db.insert(ordersCorePayments).values({
    orderId: orderIdText,
    paymentGateway: QR_GATEWAY,
    paymentMethod: QR_METHOD,
    transactionId: qr.id,
    amount: String(customerBill),
    currency: "INR",
    paymentStatus: "INITIATED",
    gatewayResponse: {
      source: QR_SOURCE,
      qrId: qr.id,
      imageUrl: qr.image_url,
      amount: customerBill,
      closeBy,
    },
  });

  return { ok: true, orderId: orderIdText, qrId: qr.id, qrImageUrl: qr.image_url, amount: customerBill, reused: false };
}

export type FinalizeRideOnlineQrInput = {
  qrId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
};
export type FinalizeRideOnlineQrResult = {
  ok: true;
  alreadyDone: boolean;
  orderId: string;
  amountPaid: number;
};

/**
 * Called from the `qr_code.credited` webhook (signature + event-id dedup already done
 * by the webhook route). Backend-authoritative finalization of an online-QR ride
 * payment: verifies the ride is still payable, records the capture, and posts the
 * online settlement (rider wallet CREDIT = earnings). Idempotent at every layer.
 */
export async function finalizeRideOnlineQrPayment(
  input: FinalizeRideOnlineQrInput
): Promise<FinalizeRideOnlineQrResult> {
  const db = getDb();
  const qrId = String(input.qrId ?? "").trim();
  if (!qrId) throw Object.assign(new Error("Missing QR id"), { statusCode: 400 });

  const [payRow] = await db
    .select({
      id: ordersCorePayments.id,
      orderId: ordersCorePayments.orderId,
      paymentStatus: ordersCorePayments.paymentStatus,
      amount: ordersCorePayments.amount,
      gatewayResponse: ordersCorePayments.gatewayResponse,
    })
    .from(ordersCorePayments)
    .where(eq(ordersCorePayments.transactionId, qrId))
    .limit(1);

  if (!payRow?.orderId) {
    throw Object.assign(new Error("QR payment record not found"), { statusCode: 404 });
  }
  // Idempotent: this QR was already captured (duplicate webhook).
  if (String(payRow.paymentStatus ?? "").toUpperCase() === "PAID") {
    return { ok: true, alreadyDone: true, orderId: payRow.orderId, amountPaid: Number(payRow.amount) };
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      customerId: ordersCore.customerId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(eq(ordersCore.orderId, payRow.orderId))
    .limit(1);
  if (!orderRow?.id) throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });

  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  // Ride already settled by another path (e.g. cash) — mark QR consumed, do nothing else.
  if (!isRideFarePaymentPending(orderRow.paymentStatus)) {
    await db
      .update(ordersCorePayments)
      .set({ paymentStatus: "PAID", paidAt: new Date() })
      .where(eq(ordersCorePayments.id, payRow.id));
    return { ok: true, alreadyDone: true, orderId: orderIdText, amountPaid: Number(payRow.amount) };
  }

  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;
  const billRes = await computeRideBillForCustomerOrder(db, { customerPk, orderRef: orderIdText });
  if (!billRes.ok) throw Object.assign(new Error(billRes.message), { statusCode: billRes.statusCode ?? 400 });
  const fareDue = Math.round(billRes.billing.final_amount * 100) / 100;

  const now = new Date();
  const prevSnap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};
  const amountPaid = Math.round((input.amountPaise / 100) * 100) / 100;

  await db.transaction(async (tx) => {
    await tx
      .update(ordersCore)
      .set({
        paymentStatus: "completed",
        paymentMethod: "online",
        grandTotal: String(fareDue),
        billingSnapshot: { ...prevSnap, ...billRes.snapshot, final_amount: fareDue, ride_fare_paid_at: now.toISOString() },
        updatedAt: now,
      })
      .where(eq(ordersCore.id, orderRow.id));
    await tx
      .update(ordersRide)
      .set({ amountCollected: String(fareDue), finalFare: String(fareDue), updatedAt: now })
      .where(eq(ordersRide.orderId, orderRow.id));
    await tx
      .update(ordersCorePayments)
      .set({
        paymentStatus: "PAID",
        paidAt: now,
        gatewayResponse: {
          ...((payRow.gatewayResponse ?? {}) as Record<string, unknown>),
          razorpayPaymentId: input.razorpayPaymentId,
          amountPaid,
          capturedAt: now.toISOString(),
        },
      })
      .where(eq(ordersCorePayments.id, payRow.id));
  });

  const snapshotId = await insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: orderRow.id,
    orderIdText,
    customerId: customerPk,
    phase: "payment_confirmed",
    billing: billRes.billing,
    billingSnapshot: billRes.snapshot,
    rideContext: {
      rideType: typeof prevSnap.rideType === "string" ? prevSnap.rideType : null,
    },
    paymentContext: {
      paymentMethod: "online",
      gatiCashApplied: 0,
      razorpayAmount: fareDue,
      amountPaid: fareDue,
      razorpayPaymentId: input.razorpayPaymentId ?? undefined,
    },
    metadata: { source: QR_SOURCE, qrId },
  });

  const riderId = orderRow.riderId != null ? Number(orderRow.riderId) : null;
  try {
    await postOnlineRideSettlement({
      orderCoreId: orderRow.id,
      orderIdText,
      riderId: riderId ?? null,
      customerId: customerPk,
      billing: {
        customerBill: fareDue,
        components: rideBillingToSettlementComponents(billRes.billing, billRes.snapshot),
        billingSnapshotId: snapshotId,
        billingSnapshot: { ...(billRes.snapshot ?? {}), final_amount: fareDue },
      },
      geo: {
        pickupLat: Number((prevSnap as { pickupLat?: unknown }).pickupLat ?? 0),
        pickupLng: Number((prevSnap as { pickupLon?: unknown }).pickupLon ?? 0),
        pickupPincode:
          typeof (prevSnap as { pickupPincode?: unknown }).pickupPincode === "string"
            ? String((prevSnap as { pickupPincode?: unknown }).pickupPincode)
            : null,
        pickupState:
          typeof (prevSnap as { pickupState?: unknown }).pickupState === "string"
            ? String((prevSnap as { pickupState?: unknown }).pickupState)
            : null,
      },
      paymentSplit: {
        gatiCashApplied: 0,
        razorpayAmount: fareDue,
        razorpayOrderId: null,
        razorpayPaymentId: input.razorpayPaymentId ?? null,
      },
    });
  } catch (err) {
    console.warn("[finalizeRideOnlineQrPayment] settlement engine failed:", err);
  }

  return { ok: true, alreadyDone: false, orderId: orderIdText, amountPaid: fareDue };
}
