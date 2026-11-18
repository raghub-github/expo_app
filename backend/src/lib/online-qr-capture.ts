/**
 * Gateway truth for the rider-presented online QR (Person Ride + Parcel).
 *
 * The rider shows a fixed-amount Razorpay QR; the customer pays it from any UPI
 * app. Nothing on either phone proves that payment — only Razorpay does. Every
 * path that needs to know whether a QR was paid comes through here:
 *
 *   - webhook `payment.captured` for a QR payment (it carries no order_id, only
 *     the QR's notes: orderRef + purpose)  → finalizeQrFromCapturedPaymentWebhook
 *   - rider/customer apps polling while the QR is on screen → checkOrderOnlineQrThrottled
 *   - rider switching to cash with a QR still open           → resolveOpenQrBeforeCash
 *   - the 60 s reconciler (ride-online-qr-reconciler.ts)
 *
 * All of them end in the same idempotent finalizers
 * (finalizeRideOnlineQrPayment / finalizeParcelOnlineQrPayment), so a payment
 * that several paths notice at once still settles exactly once.
 */
import { getSql } from "../db/client.js";
import { getEnv } from "../config/env.js";
import {
  closeRazorpayQrCode,
  fetchRazorpayQrPayments,
  type RazorpayQrCapturedPayment,
} from "../services/payment/razorpayService.js";

export type OnlineQrSource = "ride_online_qr" | "parcel_online_qr";
export type OnlineQrStatus = "paid" | "pending" | "expired" | "failed" | "not_started";

export type OnlineQrCheckResult = {
  status: OnlineQrStatus;
  qrId: string | null;
  amountPaid: number | null;
  /** True when THIS call moved the order to paid. */
  finalized: boolean;
};

type QrRow = {
  id: number;
  transaction_id: string | null;
  payment_status: string | null;
  payment_gateway: string | null;
  amount: string | number | null;
  gateway_response: Record<string, unknown> | null;
  created_at: Date | string;
};

/** QR notes.purpose (set at QR creation) → the payment row source. */
export function qrSourceForPurpose(purpose: unknown): OnlineQrSource | null {
  const p = String(purpose ?? "").trim();
  if (p === "ride_fare_collect") return "ride_online_qr";
  if (p === "parcel_fare_collect") return "parcel_online_qr";
  return null;
}

function gatewayConfigured(): boolean {
  const env = getEnv();
  return !env.PAYMENT_DUMMY_MODE && Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function expiryOf(gr: Record<string, unknown> | null): number | null {
  const v = Number(gr?.expiresAtEpoch ?? gr?.closeBy ?? NaN);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function loadQrRows(
  orderIdText: string,
  source: OnlineQrSource,
  statuses: string[] | null,
  limit: number
): Promise<QrRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, transaction_id, payment_status, payment_gateway, amount, gateway_response, created_at
    FROM orders_core_payments
    WHERE order_id = ${orderIdText}
      AND payment_method = 'upi_qr'
      AND gateway_response->>'source' = ${source}
      AND (${statuses == null} OR upper(payment_status) = ANY(${statuses ?? []}::text[]))
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as unknown as QrRow[];
  return rows;
}

export async function finalizeQrPaymentBySource(
  source: OnlineQrSource,
  qrId: string,
  payment: RazorpayQrCapturedPayment
): Promise<{ orderId: string; alreadyDone: boolean; amountPaid: number }> {
  if (source === "parcel_online_qr") {
    const { finalizeParcelOnlineQrPayment } = await import(
      "../modules/parcel/parcel-online-qr.service.js"
    );
    return finalizeParcelOnlineQrPayment({
      qrId,
      razorpayPaymentId: payment.id || null,
      amountPaise: payment.amount,
      currency: "INR",
      paymentStatus: "captured",
    });
  }
  const { finalizeRideOnlineQrPayment } = await import(
    "../modules/rides/ride-online-qr.service.js"
  );
  return finalizeRideOnlineQrPayment({
    qrId,
    razorpayPaymentId: payment.id || null,
    amountPaise: payment.amount,
  });
}

/**
 * Ask Razorpay about the order's open QR(s) and finalize a captured one.
 * Read-only towards the app: it never marks anything paid without a capture.
 */
export async function checkOrderOnlineQrWithGateway(
  orderIdText: string,
  source: OnlineQrSource
): Promise<OnlineQrCheckResult> {
  const paid = await loadQrRows(orderIdText, source, ["PAID"], 1);
  if (paid[0]) {
    return {
      status: "paid",
      qrId: paid[0].transaction_id,
      amountPaid: Number(paid[0].amount) || null,
      finalized: false,
    };
  }
  const open = await loadQrRows(orderIdText, source, ["INITIATED"], 3);
  if (open.length === 0) {
    return { status: "not_started", qrId: null, amountPaid: null, finalized: false };
  }
  const newest = open[0]!;
  const newestExpiry = expiryOf(newest.gateway_response);
  const newestExpired = newestExpiry != null && newestExpiry * 1000 <= Date.now();
  const pendingResult: OnlineQrCheckResult = {
    status: newestExpired ? "expired" : "pending",
    qrId: newest.transaction_id,
    amountPaid: null,
    finalized: false,
  };
  if (!gatewayConfigured()) return pendingResult;

  let anyFailed = false;
  for (const row of open) {
    const qrId = String(row.transaction_id ?? "").trim();
    if (!qrId || qrId.startsWith("dummy_") || row.payment_gateway !== "razorpay") continue;
    const payments = await fetchRazorpayQrPayments(qrId);
    const captured = payments.find((p) => p.status === "captured");
    if (captured) {
      const res = await finalizeQrPaymentBySource(source, qrId, captured);
      return { status: "paid", qrId, amountPaid: res.amountPaid, finalized: !res.alreadyDone };
    }
    if (row === newest && payments.some((p) => p.status === "failed")) anyFailed = true;
  }
  return anyFailed ? { ...pendingResult, status: "failed" } : pendingResult;
}

/**
 * Single-flight + minimum interval per order, so several apps polling every few
 * seconds cost at most one Razorpay call per interval per order.
 */
const recentChecks = new Map<string, { at: number; promise: Promise<OnlineQrCheckResult> }>();
const MAX_TRACKED = 2000;

export function checkOrderOnlineQrThrottled(
  orderIdText: string,
  source: OnlineQrSource,
  minIntervalMs = 2500
): Promise<OnlineQrCheckResult> {
  const key = `${source}:${orderIdText}`;
  const now = Date.now();
  const prev = recentChecks.get(key);
  if (prev && now - prev.at < minIntervalMs) return prev.promise;
  const promise = checkOrderOnlineQrWithGateway(orderIdText, source).catch((err) => {
    recentChecks.delete(key); // never cache a failure
    throw err;
  });
  if (recentChecks.size >= MAX_TRACKED) {
    for (const [k, v] of recentChecks) {
      if (now - v.at > 60_000) recentChecks.delete(k);
    }
  }
  recentChecks.set(key, { at: now, promise });
  return promise;
}

/**
 * Webhook `payment.captured` for a QR payment. Razorpay copies the QR's notes
 * onto the payment but not the QR id, so the order's QR rows are matched against
 * Razorpay's own list of payments for each QR — the payment is only applied to the
 * QR it was actually made on. Throws a retryable error when no QR lists it yet
 * (the webhook answers 5xx; Razorpay redelivers and the reconciler retries too).
 */
export async function finalizeQrFromCapturedPaymentWebhook(input: {
  orderRef: string;
  purpose: string;
  razorpayPaymentId: string;
}): Promise<{ orderId: string; qrId: string; alreadyDone: boolean; amountPaid: number; source: OnlineQrSource }> {
  const source = qrSourceForPurpose(input.purpose);
  const orderRef = String(input.orderRef ?? "").trim();
  const paymentId = String(input.razorpayPaymentId ?? "").trim();
  if (!source || !orderRef || !paymentId) {
    throw Object.assign(new Error("QR payment webhook missing orderRef / purpose / payment id"), {
      statusCode: 400,
      code: "QR_WEBHOOK_INVALID",
    });
  }
  const rows = await loadQrRows(orderRef, source, null, 5);
  if (rows.length === 0) {
    throw Object.assign(new Error(`No online QR found for order ${orderRef}`), {
      statusCode: 404,
      code: "QR_NOT_FOUND",
    });
  }
  for (const row of rows) {
    const qrId = String(row.transaction_id ?? "").trim();
    if (!qrId || row.payment_gateway !== "razorpay") continue;
    const gr = row.gateway_response ?? {};
    // Already applied: this exact payment was recorded on this QR.
    if (String(row.payment_status ?? "").toUpperCase() === "PAID" && gr.razorpayPaymentId === paymentId) {
      return { orderId: orderRef, qrId, alreadyDone: true, amountPaid: Number(row.amount) || 0, source };
    }
    const payments = await fetchRazorpayQrPayments(qrId);
    const match = payments.find((p) => p.id === paymentId && p.status === "captured");
    if (match) {
      const res = await finalizeQrPaymentBySource(source, qrId, match);
      return { orderId: res.orderId, qrId, alreadyDone: res.alreadyDone, amountPaid: res.amountPaid, source };
    }
  }
  throw Object.assign(new Error(`Captured payment ${paymentId} not yet listed on any QR of ${orderRef}`), {
    statusCode: 503,
    code: "QR_PAYMENT_NOT_VISIBLE",
    retryable: true,
  });
}

export type OpenQrBeforeCashResult =
  | { paidOnline: true; qrId: string; amountPaid: number }
  | { paidOnline: false; closed: number };

/**
 * The rider is about to settle in cash while a QR may still be open. First make
 * sure the customer has not already paid it (then the job is paid online and no
 * cash may be taken), then close every open QR so it cannot be paid afterwards.
 * A capture that still slips through after the close is refunded by the
 * finalizer (the job is already settled in cash) — never kept twice.
 */
export async function resolveOpenQrBeforeCash(
  orderIdText: string,
  source: OnlineQrSource
): Promise<OpenQrBeforeCashResult> {
  const paid = await loadQrRows(orderIdText, source, ["PAID"], 1);
  if (paid[0]?.transaction_id) {
    return { paidOnline: true, qrId: paid[0].transaction_id, amountPaid: Number(paid[0].amount) || 0 };
  }
  const open = await loadQrRows(orderIdText, source, ["INITIATED"], 5);
  if (open.length === 0) return { paidOnline: false, closed: 0 };

  const sql = getSql();
  const live = gatewayConfigured();
  let closed = 0;
  for (const row of open) {
    const qrId = String(row.transaction_id ?? "").trim();
    if (!qrId) continue;
    const isGatewayQr = live && row.payment_gateway === "razorpay" && !qrId.startsWith("dummy_");
    let verified = !isGatewayQr;
    let closedOnGateway = !isGatewayQr;
    if (isGatewayQr) {
      try {
        const payments = await fetchRazorpayQrPayments(qrId);
        verified = true;
        const captured = payments.find((p) => p.status === "captured");
        if (captured) {
          const res = await finalizeQrPaymentBySource(source, qrId, captured);
          return { paidOnline: true, qrId, amountPaid: res.amountPaid };
        }
      } catch (err) {
        console.warn("[online-qr] gateway check before cash failed", qrId, (err as Error)?.message ?? err);
      }
      try {
        closedOnGateway = await closeRazorpayQrCode(qrId);
      } catch (err) {
        console.warn("[online-qr] close before cash failed", qrId, (err as Error)?.message ?? err);
      }
      if (!verified && !closedOnGateway) {
        // Neither proof that it is unpaid nor that it can no longer be paid.
        throw Object.assign(
          new Error("Could not confirm the online QR status. Check your internet and try again."),
          { statusCode: 503, code: "QR_STATUS_UNAVAILABLE" }
        );
      }
    }
    const gr = row.gateway_response ?? {};
    await sql`
      UPDATE orders_core_payments
      SET payment_status = 'EXPIRED',
          gateway_response = ${JSON.stringify({
            ...gr,
            qrStatus: "closed",
            paymentStatus: "EXPIRED",
            closedReason: "switched_to_cash",
            closedOnGateway,
            closedAt: new Date().toISOString(),
          })}::text::jsonb
      WHERE id = ${row.id} AND upper(payment_status) = 'INITIATED'
    `;
    closed += 1;
  }
  return { paidOnline: false, closed };
}
