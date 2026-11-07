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
import { ulid } from "ulid";

async function refundDuplicateOnlineQrPayment(input: {
  paymentId: string;
  amountPaise: number;
  orderId: string;
  qrId: string;
}): Promise<void> {
  const paymentId = String(input.paymentId ?? "").trim();
  if (!paymentId) return;
  try {
    await createRazorpayRefund({
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
  } catch (err) {
    console.warn(
      "[parcel-online-qr] duplicate refund failed",
      (err as Error)?.message ?? err
    );
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

  const amountRaw = Number(
    orderRow.grandTotal ??
      orderRow.finalFare ??
      orderRow.estimatedFare ??
      orderRow.fareAmount ??
      0
  );
  const customerBill =
    Number.isFinite(amountRaw) && amountRaw > 0 ? Math.round(amountRaw * 100) / 100 : 0;
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
}): Promise<{ ok: true; alreadyDone: boolean; orderId: string; amountPaid: number }> {
  const db = getDb();
  const qrId = String(input.qrId ?? "").trim();
  if (!qrId) throw Object.assign(new Error("Missing QR id"), { statusCode: 400 });

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

  if (String(payRow.paymentStatus ?? "").toUpperCase() === "PAID") {
    // multiple_use QRs cannot be closed on this Razorpay account — refund any
    // subsequent capture so the customer is not charged twice.
    const priorPaymentId = String(gr.razorpayPaymentId ?? "");
    const newPaymentId = String(input.razorpayPaymentId ?? "");
    if (newPaymentId && newPaymentId !== priorPaymentId) {
      void refundDuplicateOnlineQrPayment({
        paymentId: newPaymentId,
        amountPaise: Math.round(Number(input.amountPaise) || 0),
        orderId: payRow.orderId,
        qrId,
      }).catch(() => undefined);
    }
    return {
      ok: true,
      alreadyDone: true,
      orderId: payRow.orderId,
      amountPaid: Number(payRow.amount),
    };
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
      cashCollectedAt: ordersParcel.cashCollectedAt,
      paymentStatus: ordersCore.paymentStatus,
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
  const now = new Date();

  await db
    .update(ordersCorePayments)
    .set({
      paymentStatus: "PAID",
      paidAt: now,
      gatewayResponse: {
        ...gr,
        razorpayPaymentId: input.razorpayPaymentId,
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

  // Prevent further scans on multiple_use QRs (single_use already auto-closes).
  void closeRazorpayQrCode(qrId).catch(() => undefined);

  const alreadyCollected =
    orderRow.cashCollectedAt != null ||
    ["paid", "completed", "captured"].includes(
      String(orderRow.paymentStatus ?? "")
        .trim()
        .toLowerCase()
    );
  if (alreadyCollected) {
    return { ok: true, alreadyDone: true, orderId: orderIdText, amountPaid };
  }

  const riderId = Number(orderRow.riderId ?? gr.riderId ?? 0);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Parcel has no assigned rider"), { statusCode: 409 });
  }

  const { confirmParcelCashCollectedForRider } = await import(
    "../rider/rider.orders.service.js"
  );
  await confirmParcelCashCollectedForRider(riderId, orderIdText, { method: "online" });

  void publishOrderEvent(orderIdText, {
    type: "parcel_fare_paid",
    orderId: orderIdText,
    method: "online",
    qrId,
    razorpayPaymentId: input.razorpayPaymentId,
    amountPaid,
  });
  void publishRiderEvent(riderId, {
    type: "parcel_fare_paid",
    orderId: orderIdText,
    method: "online",
    qrId,
    amountPaid,
  });

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

  const [payRow] = await db
    .select({
      id: ordersCorePayments.id,
      transactionId: ordersCorePayments.transactionId,
      paymentStatus: ordersCorePayments.paymentStatus,
      paymentGateway: ordersCorePayments.paymentGateway,
      amount: ordersCorePayments.amount,
      gatewayResponse: ordersCorePayments.gatewayResponse,
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

  if (!payRow?.transactionId) {
    return {
      ok: true,
      status: "not_started",
      orderId: orderIdText,
      qrId: null,
      amountPaid: null,
      cashCollected: false,
    };
  }

  const gr = (payRow.gatewayResponse ?? {}) as ParcelQrGatewayResponse;
  if (gr.source !== PARCEL_QR_SOURCE) {
    return {
      ok: true,
      status: "not_started",
      orderId: orderIdText,
      qrId: null,
      amountPaid: null,
      cashCollected: false,
    };
  }

  if (String(payRow.paymentStatus ?? "").toUpperCase() === "PAID") {
    return {
      ok: true,
      status: "paid",
      orderId: orderIdText,
      qrId: payRow.transactionId,
      amountPaid: Number(payRow.amount),
      cashCollected: false,
    };
  }

  const expiryEpoch = gr.expiresAtEpoch ?? gr.closeBy ?? null;
  const expired =
    typeof expiryEpoch === "number" ? expiryEpoch * 1000 <= Date.now() : false;

  if (String(payRow.paymentGateway ?? "") !== QR_GATEWAY || gr.dummyMode) {
    return {
      ok: true,
      status: expired ? "expired" : "pending",
      orderId: orderIdText,
      qrId: payRow.transactionId,
      amountPaid: null,
      cashCollected: false,
    };
  }

  const payments = await fetchRazorpayQrPayments(payRow.transactionId);
  const captured = payments.find((p) => p.status === "captured");
  if (captured) {
    const res = await finalizeParcelOnlineQrPayment({
      qrId: payRow.transactionId,
      razorpayPaymentId: captured.id || null,
      amountPaise: captured.amount,
      currency: "INR",
      paymentStatus: "captured",
    });
    return {
      ok: true,
      status: "paid",
      orderId: res.orderId,
      qrId: payRow.transactionId,
      amountPaid: res.amountPaid,
      cashCollected: true,
    };
  }

  const failed = payments.find((p) => p.status === "failed");
  if (failed && !captured) {
    return {
      ok: true,
      status: "failed",
      orderId: orderIdText,
      qrId: payRow.transactionId,
      amountPaid: null,
      cashCollected: false,
    };
  }

  return {
    ok: true,
    status: expired ? "expired" : "pending",
    orderId: orderIdText,
    qrId: payRow.transactionId,
    amountPaid: null,
    cashCollected: false,
  };
}
