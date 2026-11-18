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
import {
  closeRazorpayQrCode,
  createRazorpayQrCode,
  createRazorpayRefund,
} from "../../services/payment/razorpayService.js";
import { getEnv } from "../../config/env.js";
import { publishOrderEvent, publishRiderEvent } from "../realtime/publish.js";
import { ulid } from "ulid";

async function refundDuplicateOnlineQrPayment(input: {
  paymentId: string;
  amountPaise: number;
  orderId: string;
  qrId: string;
}): Promise<{ refundId: string | null; error: string | null }> {
  const paymentId = String(input.paymentId ?? "").trim();
  if (!paymentId) return { refundId: null, error: "missing_payment_id" };
  try {
    const refund = await createRazorpayRefund({
      paymentId,
      amountPaise: input.amountPaise > 0 ? input.amountPaise : undefined,
      receipt: `dup_ride_qr_${input.qrId}_${paymentId}`.slice(0, 40),
      notes: {
        reason: "duplicate_online_qr_payment",
        orderRef: input.orderId,
        qrId: input.qrId,
      },
    });
    console.warn(
      "[ride-online-qr] refunded duplicate QR payment",
      JSON.stringify({ orderId: input.orderId, qrId: input.qrId, paymentId })
    );
    return { refundId: String((refund as { id?: unknown })?.id ?? "") || null, error: null };
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    // Already fully refunded (a retry, or Razorpay auto-refund) is a success.
    if (/not_refundable_status_refunded/.test(message)) return { refundId: null, error: null };
    console.warn("[ride-online-qr] duplicate refund failed", message);
    return { refundId: null, error: message };
  }
}

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
    const gr = (existing.gatewayResponse ?? {}) as {
      imageUrl?: string;
      closeBy?: number | null;
      expiresAtEpoch?: number;
      dummyMode?: boolean;
      source?: string;
    };
    const expiryEpoch = gr.expiresAtEpoch ?? gr.closeBy ?? null;
    const notExpired =
      typeof expiryEpoch === "number" ? expiryEpoch * 1000 > Date.now() : true;
    if (gr.imageUrl && notExpired && existing.transactionId && !gr.dummyMode) {
      return {
        ok: true,
        orderId: orderIdText,
        qrId: existing.transactionId,
        qrImageUrl: gr.imageUrl,
        amount: customerBill,
        reused: true,
      };
    }
    if (existing.transactionId && !String(existing.transactionId).startsWith("dummy_")) {
      void closeRazorpayQrCode(existing.transactionId).catch(() => undefined);
      await db
        .update(ordersCorePayments)
        .set({
          paymentStatus: "EXPIRED",
          gatewayResponse: {
            ...gr,
            qrStatus: "closed",
            paymentStatus: "EXPIRED",
            closedReason: "replaced_before_new_qr",
          },
        })
        .where(eq(ordersCorePayments.id, existing.id));
    }
  }

  const closeBy = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
  const amountPaise = Math.round(customerBill * 100);
  const env = getEnv();

  if (env.PAYMENT_DUMMY_MODE) {
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
        amountPaise,
        currency: "INR",
        closeBy,
        expiresAtEpoch: closeBy,
        dummyMode: true,
        dummyReason: "PAYMENT_DUMMY_MODE",
      },
    });
    console.warn(
      "[createRideOnlineQr] using dummy QR",
      JSON.stringify({ order: orderIdText, reason: "PAYMENT_DUMMY_MODE", amount: customerBill })
    );
    return {
      ok: true,
      orderId: orderIdText,
      qrId,
      qrImageUrl,
      amount: customerBill,
      reused: false,
    };
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Payment gateway not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED",
    });
  }

  const qr = await createRazorpayQrCode({
    amountPaise,
    name: "GatiMitra Ride",
    description: `GatiMitra ride ${orderIdText}`,
    closeBy,
    notes: {
      orderRef: orderIdText,
      orderCoreId: String(orderRow.id),
      customerId: String(customerPk),
      riderId: String(riderId),
      service: "person_ride",
      purpose: "ride_fare_collect",
    },
  });

  const effectiveExpiry =
    typeof qr.close_by === "number" && qr.close_by > 0 ? qr.close_by : closeBy;

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
      amountPaise,
      currency: "INR",
      closeBy: qr.close_by,
      expiresAtEpoch: effectiveExpiry,
      usage: qr.usage,
      fixedAmount: true,
      purpose: "ride_fare_collect",
      qrStatus: qr.status || "active",
      paymentStatus: "INITIATED",
    },
  });

  return {
    ok: true,
    orderId: orderIdText,
    qrId: qr.id,
    qrImageUrl: qr.image_url,
    amount: customerBill,
    reused: false,
  };
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
  /** A capture that arrived after the ride was already settled another way — refunded. */
  lateCaptureRefunded?: boolean;
};

/**
 * Stamp the refund outcome on a late-captured QR row. A failed refund stays
 * REFUND_PENDING without a refundId, which the QR reconciler retries
 * (retryLateCaptureRefunds) — a refund is never silently abandoned.
 */
export async function markLateCaptureRefund(
  paymentRowId: number,
  refund: { refundId: string | null; error: string | null }
): Promise<void> {
  const { getSql } = await import("../../db/client.js");
  const sql = getSql();
  const patch = refund.error
    ? { refundError: refund.error, refundAttemptedAt: new Date().toISOString() }
    : { refundId: refund.refundId ?? "already_refunded", refundError: null, refundedAt: new Date().toISOString() };
  await sql`
    UPDATE orders_core_payments
    SET gateway_response = COALESCE(gateway_response, '{}'::jsonb) || ${JSON.stringify(patch)}::text::jsonb
    WHERE id = ${paymentRowId}
  `;
}

/** Retry a late-capture refund that failed (called by the QR reconciler). */
export async function retryLateCaptureRefund(row: {
  id: number;
  orderId: string;
  qrId: string;
  razorpayPaymentId: string;
  amountPaise: number;
}): Promise<boolean> {
  const refund = await refundDuplicateOnlineQrPayment({
    paymentId: row.razorpayPaymentId,
    amountPaise: row.amountPaise,
    orderId: row.orderId,
    qrId: row.qrId,
  });
  await markLateCaptureRefund(row.id, refund);
  return refund.error == null;
}

async function recordRidePaymentEvent(args: {
  eventType: string;
  orderId: string;
  razorpayPaymentId?: string | null;
  amountPaise?: number | null;
  failureMessage?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { logPaymentEvent } = await import("../orders/order.placement.service.js");
    await logPaymentEvent(getDb(), {
      eventType: args.eventType,
      source: QR_SOURCE,
      orderId: args.orderId,
      razorpayPaymentId: args.razorpayPaymentId ?? null,
      amountPaise: args.amountPaise ?? null,
      failureMessage: args.failureMessage ?? null,
      payload: args.payload,
    });
  } catch {
    /* audit is best-effort */
  }
}

/**
 * Backend-authoritative finalization of an online-QR ride payment. Reached from
 * the webhook (`qr_code.credited` / `payment.captured` with QR notes), the
 * reconciler, the rider/customer status checks and the cash switch — never from
 * a client claim. Idempotent and race-safe:
 *
 *   - the payment row and the order row are locked FOR UPDATE, so two paths that
 *     notice the same capture at once serialize; the second sees PAID and stops;
 *   - a capture that lands after the ride was already settled another way (the
 *     rider took cash, or the customer paid in-app) is a double payment — it is
 *     refunded, never kept and never applied on top;
 *   - the payment is committed first; if the settlement then fails, it is
 *     recorded and the settlement reconciler posts it (never silently dropped).
 */
export async function finalizeRideOnlineQrPayment(
  input: FinalizeRideOnlineQrInput
): Promise<FinalizeRideOnlineQrResult> {
  const db = getDb();
  const qrId = String(input.qrId ?? "").trim();
  if (!qrId) throw Object.assign(new Error("Missing QR id"), { statusCode: 400 });
  const newPaymentId = String(input.razorpayPaymentId ?? "").trim();

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

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      customerId: ordersCore.customerId,
      paymentStatus: ordersCore.paymentStatus,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(eq(ordersCore.orderId, payRow.orderId))
    .limit(1);
  if (!orderRow?.id) throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;

  const gr0 = (payRow.gatewayResponse ?? {}) as { amountPaise?: number };
  const expectedPaise =
    typeof gr0.amountPaise === "number" && gr0.amountPaise > 0
      ? Math.round(gr0.amountPaise)
      : Math.round(Number(payRow.amount) * 100);
  const paidPaise = Math.round(Number(input.amountPaise) || 0);
  if (paidPaise > 0 && expectedPaise > 0 && Math.abs(paidPaise - expectedPaise) > 1) {
    throw Object.assign(
      new Error(`QR payment amount mismatch: expected ${expectedPaise} paise, got ${paidPaise}`),
      { statusCode: 409, code: "AMOUNT_MISMATCH" }
    );
  }

  // The bill is only needed while the ride is still payable; computing it before
  // the locked section keeps the lock short (it reads several tables).
  const billRes = isRideFarePaymentPending(orderRow.paymentStatus)
    ? await computeRideBillForCustomerOrder(db, { customerPk, orderRef: orderIdText })
    : null;
  if (billRes && !billRes.ok) {
    throw Object.assign(new Error(billRes.message), { statusCode: billRes.statusCode ?? 400 });
  }
  const bill = billRes && billRes.ok ? billRes : null;

  const now = new Date();
  type Outcome =
    | { kind: "already_paid"; priorPaymentId: string; amount: number }
    | { kind: "late_capture"; reason: string }
    | { kind: "paid"; fareDue: number; prevSnap: Record<string, unknown>; amountPaid: number };

  const outcome: Outcome = await db.transaction(async (tx) => {
    const [lockedPay] = await tx
      .select({
        paymentStatus: ordersCorePayments.paymentStatus,
        gatewayResponse: ordersCorePayments.gatewayResponse,
        amount: ordersCorePayments.amount,
      })
      .from(ordersCorePayments)
      .where(eq(ordersCorePayments.id, payRow.id))
      .for("update");
    const lockedGr = (lockedPay?.gatewayResponse ?? {}) as Record<string, unknown>;
    const lockedStatus = String(lockedPay?.paymentStatus ?? "").toUpperCase();
    if (lockedStatus === "PAID") {
      return {
        kind: "already_paid" as const,
        priorPaymentId: String(lockedGr.razorpayPaymentId ?? ""),
        amount: Number(lockedPay?.amount ?? payRow.amount),
      };
    }
    if (lockedStatus === "REFUND_PENDING" || lockedStatus === "REFUNDED") {
      return { kind: "late_capture" as const, reason: "already_refunded" };
    }

    const [lockedOrder] = await tx
      .select({
        paymentStatus: ordersCore.paymentStatus,
        paymentMethod: ordersCore.paymentMethod,
        billingSnapshot: ordersCore.billingSnapshot,
      })
      .from(ordersCore)
      .where(eq(ordersCore.id, orderRow.id))
      .for("update");

    if (!isRideFarePaymentPending(lockedOrder?.paymentStatus) || !bill) {
      const reason = `ride already settled (${String(lockedOrder?.paymentMethod ?? "unknown")}) before this QR capture`;
      await tx
        .update(ordersCorePayments)
        .set({
          paymentStatus: "REFUND_PENDING",
          gatewayResponse: {
            ...lockedGr,
            razorpayPaymentId: newPaymentId || null,
            capturedAt: now.toISOString(),
            qrStatus: "closed",
            paymentStatus: "REFUND_PENDING",
            lateCaptureAfterSettlement: true,
            lateCaptureReason: reason,
          },
        })
        .where(eq(ordersCorePayments.id, payRow.id));
      return { kind: "late_capture" as const, reason };
    }

    const fareDue = Math.round(bill.billing.final_amount * 100) / 100;
    const prevSnap =
      lockedOrder?.billingSnapshot != null && typeof lockedOrder.billingSnapshot === "object"
        ? (lockedOrder.billingSnapshot as Record<string, unknown>)
        : {};
    const amountPaid = paidPaise > 0 ? Math.round(paidPaise) / 100 : fareDue;

    await tx
      .update(ordersCore)
      .set({
        paymentStatus: "completed",
        paymentMethod: "online",
        grandTotal: String(fareDue),
        billingSnapshot: {
          ...prevSnap,
          ...bill.snapshot,
          final_amount: fareDue,
          ride_fare_paid_at: now.toISOString(),
          ride_fare_paid_method: "online_qr",
        },
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
          ...lockedGr,
          razorpayPaymentId: newPaymentId || null,
          amountPaid,
          amountPaise: expectedPaise,
          currency: "INR",
          capturedAt: now.toISOString(),
          qrStatus: "closed",
          paymentStatus: "PAID",
        },
      })
      .where(eq(ordersCorePayments.id, payRow.id));
    return { kind: "paid" as const, fareDue, prevSnap, amountPaid };
  });

  if (outcome.kind === "already_paid") {
    // multiple_use QRs cannot always be closed — a second capture is refunded.
    if (newPaymentId && outcome.priorPaymentId && newPaymentId !== outcome.priorPaymentId) {
      void refundDuplicateOnlineQrPayment({
        paymentId: newPaymentId,
        amountPaise: paidPaise,
        orderId: payRow.orderId,
        qrId,
      }).catch(() => undefined);
    }
    return { ok: true, alreadyDone: true, orderId: orderIdText, amountPaid: outcome.amount };
  }

  if (outcome.kind === "late_capture") {
    if (outcome.reason !== "already_refunded" && newPaymentId) {
      const refund = await refundDuplicateOnlineQrPayment({
        paymentId: newPaymentId,
        amountPaise: paidPaise,
        orderId: orderIdText,
        qrId,
      });
      await markLateCaptureRefund(payRow.id, refund);
      await recordRidePaymentEvent({
        eventType: refund.error ? "QR_LATE_CAPTURE_REFUND_FAILED" : "QR_LATE_CAPTURE_REFUNDED",
        orderId: orderIdText,
        razorpayPaymentId: newPaymentId,
        amountPaise: paidPaise,
        failureMessage: refund.error,
        payload: { qrId, reason: outcome.reason, refundId: refund.refundId },
      });
    }
    return {
      ok: true,
      alreadyDone: true,
      orderId: orderIdText,
      amountPaid: paidPaise / 100,
      lateCaptureRefunded: true,
    };
  }

  const { fareDue } = outcome;
  void closeRazorpayQrCode(qrId).catch(() => undefined);

  const riderId = orderRow.riderId != null ? Number(orderRow.riderId) : null;
  try {
    await ensureRideQrSettlement(orderRow.id);
  } catch (err) {
    // The payment is committed; the rider's credit is posted by the settlement
    // reconciler (ensureRideQrSettlement again). Recorded, never swallowed.
    console.error(
      "[finalizeRideOnlineQrPayment] settlement failed — reconciler will retry",
      orderIdText,
      err
    );
    await recordRidePaymentEvent({
      eventType: "RIDE_SETTLEMENT_FAILED",
      orderId: orderIdText,
      razorpayPaymentId: newPaymentId || null,
      amountPaise: Math.round(fareDue * 100),
      failureMessage: (err as Error)?.message ?? String(err),
      payload: { qrId, orderCoreId: orderRow.id },
    });
  }

  const paidEvent = {
    type: "ride_fare_paid",
    orderId: orderIdText,
    method: "online",
    qrId,
    amountPaid: fareDue,
  };
  void publishOrderEvent(orderIdText, paidEvent);
  if (riderId != null && riderId > 0) void publishRiderEvent(riderId, paidEvent);

  return { ok: true, alreadyDone: false, orderId: orderIdText, amountPaid: fareDue };
}

/**
 * Post the online settlement (rider wallet credit = earning) for a ride whose QR
 * payment is recorded. The single code path for the first attempt (right after
 * the payment commits) and every retry by the reconciler. Idempotent: the
 * settlement row is unique per order and the wallet ref is unique per rider.
 */
export async function ensureRideQrSettlement(
  orderCorePk: number
): Promise<"settled" | "already_settled" | "not_paid" | "no_qr_payment"> {
  const db = getDb();
  const [order] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      customerId: ordersCore.customerId,
      riderId: ordersCore.riderId,
      paymentStatus: ordersCore.paymentStatus,
      grandTotal: ordersCore.grandTotal,
      billingSnapshot: ordersCore.billingSnapshot,
      settlementId: ordersRide.settlementId,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);
  if (!order?.id) throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  if (order.settlementId) return "already_settled";
  if (isRideFarePaymentPending(order.paymentStatus)) return "not_paid";
  const orderIdText = order.orderId?.trim() || String(order.id);

  const [pay] = await db
    .select({
      transactionId: ordersCorePayments.transactionId,
      amount: ordersCorePayments.amount,
      gatewayResponse: ordersCorePayments.gatewayResponse,
    })
    .from(ordersCorePayments)
    .where(
      and(
        eq(ordersCorePayments.orderId, orderIdText),
        eq(ordersCorePayments.paymentMethod, QR_METHOD),
        eq(ordersCorePayments.paymentStatus, "PAID")
      )
    )
    .orderBy(desc(ordersCorePayments.paidAt))
    .limit(1);
  const gr = (pay?.gatewayResponse ?? {}) as { source?: string; razorpayPaymentId?: string | null };
  if (!pay?.transactionId || gr.source !== QR_SOURCE) return "no_qr_payment";

  const customerPk = order.customerId != null ? Number(order.customerId) : 0;
  const billRes = await computeRideBillForCustomerOrder(db, { customerPk, orderRef: orderIdText });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), { statusCode: billRes.statusCode ?? 400 });
  }
  // What the passenger actually paid (written with the payment) is the bill.
  const paid = Math.round(Number(order.grandTotal ?? pay.amount) * 100) / 100;
  const fareDue = paid > 0 ? paid : Math.round(Number(pay.amount) * 100) / 100;
  const prevSnap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? (order.billingSnapshot as Record<string, unknown>)
      : {};
  const razorpayPaymentId = gr.razorpayPaymentId ? String(gr.razorpayPaymentId) : null;

  const snapshotId = await insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: order.id,
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
      razorpayPaymentId: razorpayPaymentId ?? undefined,
    },
    metadata: { source: QR_SOURCE, qrId: pay.transactionId },
  });
  const posting = await postOnlineRideSettlement({
    orderCoreId: order.id,
    orderIdText,
    riderId: order.riderId != null ? Number(order.riderId) : null,
    customerId: customerPk,
    billing: {
      customerBill: fareDue,
      components: rideBillingToSettlementComponents(billRes.billing, billRes.snapshot),
      billingSnapshotId: snapshotId,
      billingSnapshot: { ...(billRes.snapshot ?? {}), final_amount: fareDue },
    },
    // The engine resolves pickup geo from orders_core (withOrderPickupGeo).
    geo: {},
    paymentSplit: {
      gatiCashApplied: 0,
      razorpayAmount: fareDue,
      razorpayOrderId: null,
      razorpayPaymentId,
    },
  });
  return posting.alreadySettled ? "already_settled" : "settled";
}
/**
 * Rider app poll while the QR is on screen (and after it is dismissed): ask
 * Razorpay, finalize on capture. Backend truth only — never a client claim.
 */
export async function reconcileRideOnlineQrForRider(input: {
  riderId: number;
  orderRef: string;
}): Promise<{
  ok: true;
  status: "paid" | "pending" | "expired" | "failed" | "not_started";
  orderId: string;
  qrId: string | null;
  amountPaid: number | null;
  settled: boolean;
  paymentMethod: string | null;
}> {
  const db = getDb();
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Invalid rider session"), { statusCode: 403 });
  }
  const readOrder = async () => {
    const [row] = await db
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        paymentStatus: ordersCore.paymentStatus,
        paymentMethod: ordersCore.paymentMethod,
      })
      .from(ordersCore)
      .where(and(riderOrderRefWhere(riderId, input.orderRef), eq(ordersCore.orderType, "person_ride")))
      .limit(1);
    return row;
  };
  const orderRow = await readOrder();
  if (!orderRow?.id) throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  if (!isRideFarePaymentPending(orderRow.paymentStatus)) {
    return {
      ok: true,
      status: "paid",
      orderId: orderIdText,
      qrId: null,
      amountPaid: null,
      settled: true,
      paymentMethod: orderRow.paymentMethod ?? null,
    };
  }
  const { checkOrderOnlineQrThrottled } = await import("../../lib/online-qr-capture.js");
  const res = await checkOrderOnlineQrThrottled(orderIdText, "ride_online_qr");
  const after = res.status === "paid" ? await readOrder() : orderRow;
  return {
    ok: true,
    status: res.status,
    orderId: orderIdText,
    qrId: res.qrId,
    amountPaid: res.amountPaid,
    settled: !isRideFarePaymentPending(after?.paymentStatus),
    paymentMethod: after?.paymentMethod ?? null,
  };
}
