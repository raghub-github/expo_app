/**
 * Rider-presented dynamic UPI QR for parcel fare collection (pay-at pickup/drop).
 *
 * Flow: create fixed-amount Razorpay QR → customer pays → qr_code.credited webhook
 * (or reconciler / status-check) finalizes via finalizeParcelOnlineQrPayment.
 * Client never proves payment — only Razorpay capture does.
 */
import { and, eq, or, desc, notInArray } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCore, ordersCorePayments, ordersParcel } from "../../db/schema.js";
import {
  closeRazorpayQrCode,
  createRazorpayQrCode,
  createRazorpayRefund,
  fetchRazorpayQrPayments,
} from "../../services/payment/razorpayService.js";
import { getEnv } from "../../config/env.js";
import { publishOrderEvent, publishRiderEvent } from "../realtime/publish.js";
import {
  applyParcelFareCollected,
  resolveParcelCustomerPayable,
} from "../../lib/parcel-fare-collection.js";
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
      receipt: `dup_qr_${input.qrId}_${paymentId}`.slice(0, 40),
      notes: {
        reason: "duplicate_online_qr_payment",
        orderRef: input.orderId,
        qrId: input.qrId,
      },
    });
    console.warn(
      "[parcel-online-qr] refunded duplicate QR payment",
      JSON.stringify({ orderId: input.orderId, qrId: input.qrId, paymentId })
    );
    return { refundId: String((refund as { id?: unknown })?.id ?? "") || null, error: null };
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/not_refundable_status_refunded/.test(message)) return { refundId: null, error: null };
    console.warn("[parcel-online-qr] duplicate refund failed", message);
    return { refundId: null, error: message };
  }
}

const QR_TTL_SECONDS = 30 * 60;
const QR_GATEWAY = "razorpay";
const QR_METHOD = "upi_qr";
export const PARCEL_QR_SOURCE = "parcel_online_qr";

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

export type CreateParcelOnlineQrResult = {
  ok: true;
  orderId: string;
  qrId: string;
  qrImageUrl: string;
  amount: number;
  amountPaise: number;
  currency: "INR";
  expiresAt: string | null;
  reused: boolean;
};

type ParcelQrGatewayResponse = {
  source?: string;
  qrId?: string;
  imageUrl?: string;
  amount?: number;
  amountPaise?: number;
  currency?: string;
  closeBy?: number | null;
  expiresAtEpoch?: number;
  riderId?: number;
  purpose?: string;
  usage?: string;
  fixedAmount?: boolean;
  dummyMode?: boolean;
  dummyReason?: string;
  razorpayPaymentId?: string | null;
  amountPaid?: number;
  capturedAt?: string;
  qrStatus?: string;
  paymentStatus?: string;
};

export async function createParcelOnlineQr(input: {
  riderId: number;
  orderRef: string;
}): Promise<CreateParcelOnlineQrResult> {
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
      paymentStatus: ordersCore.paymentStatus,
      riderId: ordersCore.riderId,
      grandTotal: ordersCore.grandTotal,
      fareAmount: ordersCore.fareAmount,
      cashCollectedAt: ordersParcel.cashCollectedAt,
      finalFare: ordersParcel.finalFare,
      estimatedFare: ordersParcel.estimatedFare,
      billingSnapshot: ordersCore.billingSnapshot,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        riderOrderRefWhere(riderId, input.orderRef),
        eq(ordersCore.orderType, "parcel"),
        notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
      )
    )
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
  }
  if (Number(orderRow.riderId) !== riderId) {
    throw Object.assign(new Error("You are not the assigned rider for this order"), {
      statusCode: 403,
    });
  }

  const paymentDone =
    orderRow.cashCollectedAt != null ||
    ["paid", "completed", "captured"].includes(
      String(orderRow.paymentStatus ?? "")
        .trim()
        .toLowerCase()
    );
  if (paymentDone) {
    throw Object.assign(new Error("Parcel fare is already collected"), {
      statusCode: 409,
      code: "ALREADY_SETTLED",
    });
  }

  // Same payable the rider's collect screen shows (lib/parcel-fare-collection.ts).
  const resolvedPayable = resolveParcelCustomerPayable(orderRow);
  const customerBill = resolvedPayable.payable;
  if (resolvedPayable.free) {
    throw Object.assign(new Error("Nothing to collect — this parcel is free for the customer"), {
      statusCode: 409,
      code: "ALREADY_SETTLED",
    });
  }
  if (!(customerBill > 0)) {
    throw Object.assign(new Error("Parcel fare amount is unavailable"), { statusCode: 409 });
  }

  const amountPaise = Math.round(customerBill * 100);
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;

  const [existing] = await db
    .select({
      id: ordersCorePayments.id,
      transactionId: ordersCorePayments.transactionId,
      paymentStatus: ordersCorePayments.paymentStatus,
      paymentGateway: ordersCorePayments.paymentGateway,
      gatewayResponse: ordersCorePayments.gatewayResponse,
      amount: ordersCorePayments.amount,
    })
    .from(ordersCorePayments)
    .where(
      and(
        eq(ordersCorePayments.orderId, orderIdText),
        eq(ordersCorePayments.paymentMethod, QR_METHOD)
      )
    )
    .orderBy(desc(ordersCorePayments.createdAt))
    .limit(1);

  if (
    existing &&
    String(existing.paymentStatus ?? "").toUpperCase() === "INITIATED" &&
    Number(existing.amount) === customerBill &&
    String(existing.paymentGateway ?? "") === QR_GATEWAY
  ) {
    const gr = (existing.gatewayResponse ?? {}) as ParcelQrGatewayResponse;
    const expiryEpoch = gr.expiresAtEpoch ?? gr.closeBy ?? null;
    const notExpired =
      typeof expiryEpoch === "number" ? expiryEpoch * 1000 > Date.now() : true;
    if (
      gr.source === PARCEL_QR_SOURCE &&
      gr.imageUrl &&
      notExpired &&
      existing.transactionId &&
      !gr.dummyMode
    ) {
      return {
        ok: true,
        orderId: orderIdText,
        qrId: existing.transactionId,
        qrImageUrl: gr.imageUrl,
        amount: customerBill,
        amountPaise,
        currency: "INR",
        expiresAt: expiryEpoch ? new Date(expiryEpoch * 1000).toISOString() : null,
        reused: true,
      };
    }
    // Stale / expired open QR — close on Razorpay before creating another payable QR.
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

  const env = getEnv();

  // Explicit local/dev only — never used as a silent fallback for Razorpay failures.
  if (env.PAYMENT_DUMMY_MODE) {
    const qrId = `dummy_parcel_qr_${ulid()}`;
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
        source: PARCEL_QR_SOURCE,
        qrId,
        imageUrl: qrImageUrl,
        amount: customerBill,
        amountPaise,
        currency: "INR",
        closeBy: expiresAtEpoch,
        expiresAtEpoch,
        dummyMode: true,
        dummyReason: "PAYMENT_DUMMY_MODE",
        riderId,
        purpose: "parcel_fare_collect",
        qrStatus: "active",
        paymentStatus: "INITIATED",
      } satisfies ParcelQrGatewayResponse,
    });
    return {
      ok: true,
      orderId: orderIdText,
      qrId,
      qrImageUrl,
      amount: customerBill,
      amountPaise,
      currency: "INR",
      expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
      reused: false,
    };
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Payment gateway not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED",
    });
  }

  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;
  const qr = await createRazorpayQrCode({
    amountPaise,
    name: "GatiMitra Parcel",
    description: `GatiMitra parcel ${orderIdText}`,
    closeBy: expiresAtEpoch,
    notes: {
      orderRef: orderIdText,
      orderCoreId: String(orderRow.id),
      customerId: String(customerPk || ""),
      riderId: String(riderId),
      service: "parcel",
      purpose: "parcel_fare_collect",
    },
  });

  const effectiveExpiry =
    typeof qr.close_by === "number" && qr.close_by > 0 ? qr.close_by : expiresAtEpoch;

  await db.insert(ordersCorePayments).values({
    orderId: orderIdText,
    paymentGateway: QR_GATEWAY,
    paymentMethod: QR_METHOD,
    transactionId: qr.id,
    amount: String(customerBill),
    currency: "INR",
    paymentStatus: "INITIATED",
    gatewayResponse: {
      source: PARCEL_QR_SOURCE,
      qrId: qr.id,
      imageUrl: qr.image_url,
      amount: customerBill,
      amountPaise,
      currency: "INR",
      closeBy: qr.close_by,
      expiresAtEpoch: effectiveExpiry,
      riderId,
      purpose: "parcel_fare_collect",
      usage: qr.usage,
      fixedAmount: true,
      qrStatus: qr.status || "active",
      paymentStatus: "INITIATED",
    } satisfies ParcelQrGatewayResponse,
  });

  return {
    ok: true,
    orderId: orderIdText,
    qrId: qr.id,
    qrImageUrl: qr.image_url,
    amount: customerBill,
    amountPaise,
    currency: "INR",
    expiresAt: new Date(effectiveExpiry * 1000).toISOString(),
    reused: false,
  };
}

export async function finalizeParcelOnlineQrPayment(input: {
  qrId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency?: string | null;
  paymentStatus?: string | null;
}): Promise<{
  ok: true;
  alreadyDone: boolean;
  orderId: string;
  amountPaid: number;
  lateCaptureRefunded?: boolean;
}> {
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
      currency: ordersCorePayments.currency,
      gatewayResponse: ordersCorePayments.gatewayResponse,
    })
    .from(ordersCorePayments)
    .where(eq(ordersCorePayments.transactionId, qrId))
    .limit(1);

  if (!payRow?.orderId) {
    throw Object.assign(new Error("QR payment record not found"), { statusCode: 404 });
  }

  const gr = (payRow.gatewayResponse ?? {}) as ParcelQrGatewayResponse;
  if (gr.source !== PARCEL_QR_SOURCE) {
    throw Object.assign(new Error("Not a parcel online QR"), { statusCode: 400 });
  }

  const expectedPaise =
    typeof gr.amountPaise === "number" && gr.amountPaise > 0
      ? Math.round(gr.amountPaise)
      : Math.round(Number(payRow.amount) * 100);
  const paidPaise = Math.round(Number(input.amountPaise) || 0);
  if (paidPaise > 0 && expectedPaise > 0 && Math.abs(paidPaise - expectedPaise) > 1) {
    throw Object.assign(
      new Error(
        `QR payment amount mismatch: expected ${expectedPaise} paise, got ${paidPaise}`
      ),
      { statusCode: 409, code: "AMOUNT_MISMATCH" }
    );
  }

  const currency = String(input.currency ?? payRow.currency ?? gr.currency ?? "INR")
    .trim()
    .toUpperCase();
  if (currency && currency !== "INR") {
    throw Object.assign(new Error(`Unsupported currency ${currency}`), {
      statusCode: 409,
      code: "CURRENCY_MISMATCH",
    });
  }

  const gatewayPaymentStatus = String(input.paymentStatus ?? "captured")
    .trim()
    .toLowerCase();
  if (gatewayPaymentStatus && !["captured", "authorized", "paid"].includes(gatewayPaymentStatus)) {
    throw Object.assign(new Error(`Payment not captured (${gatewayPaymentStatus})`), {
      statusCode: 409,
      code: "PAYMENT_NOT_CAPTURED",
    });
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      riderId: ordersCore.riderId,
      payAt: ordersParcel.payAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(eq(ordersCore.orderId, payRow.orderId))
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
  }

  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  const amountPaid =
    paidPaise > 0
      ? Math.round((paidPaise / 100) * 100) / 100
      : Math.round(Number(payRow.amount) * 100) / 100;
  const riderId = Number(orderRow.riderId ?? gr.riderId ?? 0);
  const now = new Date();

  type Outcome =
    | { kind: "already_paid"; priorPaymentId: string; amount: number }
    | { kind: "late_capture"; reason: string }
    | { kind: "paid" };

  // Payment row + order row locked FOR UPDATE: the webhook, the reconciler and
  // the rider's status poll can all notice the same capture — exactly one applies
  // it. "Fare collected" is written in the same transaction as the QR → PAID.
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
    const lockedGr = (lockedPay?.gatewayResponse ?? {}) as ParcelQrGatewayResponse & Record<string, unknown>;
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
    const [lockedParcel] = await tx
      .select({ cashCollectedAt: ordersParcel.cashCollectedAt })
      .from(ordersParcel)
      .where(eq(ordersParcel.orderId, orderRow.id))
      .for("update");

    const alreadyCollected =
      lockedParcel?.cashCollectedAt != null ||
      ["paid", "completed", "captured"].includes(
        String(lockedOrder?.paymentStatus ?? "")
          .trim()
          .toLowerCase()
      );
    if (alreadyCollected || !(riderId > 0)) {
      // The fare was already collected (cash, or another payment) before this
      // capture: the customer paid twice. Refund — never keep or re-apply it.
      const reason = !(riderId > 0)
        ? "parcel has no assigned rider"
        : `parcel fare already collected (${String(lockedOrder?.paymentMethod ?? "unknown")}) before this QR capture`;
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
          verifiedPaymentStatus: gatewayPaymentStatus || "captured",
        },
      })
      .where(eq(ordersCorePayments.id, payRow.id));

    await applyParcelFareCollected(tx, {
      orderCoreId: orderRow.id,
      orderIdText,
      riderId,
      customerBill: amountPaid,
      method: "online",
      payAt: orderRow.payAt ?? null,
      prevSnapshot:
        lockedOrder?.billingSnapshot != null && typeof lockedOrder.billingSnapshot === "object"
          ? (lockedOrder.billingSnapshot as Record<string, unknown>)
          : {},
      now,
      snapshotExtra: { parcel_fare_qr_id: qrId },
    });
    return { kind: "paid" as const };
  });

  if (outcome.kind === "already_paid") {
    // multiple_use QRs cannot be closed on this Razorpay account — refund any
    // subsequent capture so the customer is not charged twice.
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
      const { markLateCaptureRefund } = await import("../rides/ride-online-qr.service.js");
      await markLateCaptureRefund(payRow.id, refund);
    }
    return { ok: true, alreadyDone: true, orderId: orderIdText, amountPaid, lateCaptureRefunded: true };
  }

  // Prevent further scans on multiple_use QRs (single_use already auto-closes).
  void closeRazorpayQrCode(qrId).catch(() => undefined);

  const paidEvent = {
    type: "parcel_fare_paid",
    orderId: orderIdText,
    method: "online",
    qrId,
    razorpayPaymentId: newPaymentId || null,
    amountPaid,
  };
  void publishOrderEvent(orderIdText, paidEvent);
  void publishRiderEvent(riderId, paidEvent);

  return { ok: true, alreadyDone: false, orderId: orderIdText, amountPaid };
}

/**
 * Rider / poller safety net: ask Razorpay if this QR was paid, then finalize.
 * Never marks paid from client attestation alone.
 */
export async function reconcileParcelOnlineQrForRider(input: {
  riderId: number;
  orderRef: string;
}): Promise<{
  ok: true;
  status: "paid" | "pending" | "expired" | "failed" | "not_started";
  orderId: string;
  qrId: string | null;
  amountPaid: number | null;
  cashCollected: boolean;
}> {
  const db = getDb();
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Invalid rider session"), { statusCode: 403 });
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      paymentStatus: ordersCore.paymentStatus,
      cashCollectedAt: ordersParcel.cashCollectedAt,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        riderOrderRefWhere(riderId, input.orderRef),
        eq(ordersCore.orderType, "parcel"),
        notInArray(ordersCore.status, ["delivered", "cancelled", "failed"])
      )
    )
    .limit(1);

  if (!orderRow?.id) {
    throw Object.assign(new Error("Parcel order not found"), { statusCode: 404 });
  }

  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);
  const cashCollected =
    orderRow.cashCollectedAt != null ||
    ["paid", "completed", "captured"].includes(
      String(orderRow.paymentStatus ?? "")
        .trim()
        .toLowerCase()
    );
  if (cashCollected) {
    return {
      ok: true,
      status: "paid",
      orderId: orderIdText,
      qrId: null,
      amountPaid: null,
      cashCollected: true,
    };
  }

  // One shared, throttled gateway check (lib/online-qr-capture.ts): several polls
  // a second still cost at most one Razorpay call per order per interval.
  const { checkOrderOnlineQrThrottled } = await import("../../lib/online-qr-capture.js");
  const res = await checkOrderOnlineQrThrottled(orderIdText, PARCEL_QR_SOURCE);
  return {
    ok: true,
    status: res.status,
    orderId: orderIdText,
    qrId: res.qrId,
    amountPaid: res.amountPaid,
    cashCollected: res.status === "paid",
  };
}
