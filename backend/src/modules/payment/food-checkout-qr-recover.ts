/**
 * Food checkout Scan-QR recovery — closes the gap when `qr_code.credited` is
 * missed/delayed. Razorpay UPI QR captures often do NOT appear under the Orders
 * API payment list, so `resolveGatewayTruth(orderId)` can return NONE while the
 * QR entity is already captured. Always verify via `fetchRazorpayQrPayments`.
 *
 * Safe to call from the online-QR reconciler, pending reconciler, checkout/fail,
 * and pending-status poll. Finalization is idempotent.
 */
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCorePayments, pendingOrders } from "../../db/schema.js";
import {
  closeRazorpayQrCode,
  fetchRazorpayQrPayments,
} from "../../services/payment/razorpayService.js";
import {
  finalizePendingOrderFromWebhook,
  logPaymentEvent,
} from "../orders/order.placement.service.js";
import { notifyCustomerPaymentSettled } from "../../lib/customer-payment-settled-notify.js";

export type FoodCheckoutQrGw = {
  source?: string;
  pendingId?: string;
  razorpayOrderId?: string;
  amountPaise?: number;
  qrId?: string;
};

export type FoodQrRecoverResult =
  | { status: "finalized"; pendingId: string; paymentId: string }
  | { status: "already_finalized"; pendingId: string }
  | { status: "pending_capture" }
  | { status: "no_qr_row" }
  | { status: "skipped"; reason: string };

function isFoodCheckoutQrSource(source: unknown): boolean {
  return String(source ?? "") === "food_checkout_qr";
}

/**
 * Look up the latest food checkout QR row for a pending checkout / Razorpay order.
 */
export async function findFoodCheckoutQrPaymentRow(args: {
  pendingId?: string | null;
  razorpayOrderId?: string | null;
  qrId?: string | null;
}): Promise<{
  qrId: string;
  gw: FoodCheckoutQrGw;
  paymentStatus: string | null;
} | null> {
  const db = getDb();
  const qrIdHint = String(args.qrId ?? "").trim();
  if (qrIdHint) {
    const [byQr] = await db
      .select({
        transactionId: ordersCorePayments.transactionId,
        gatewayResponse: ordersCorePayments.gatewayResponse,
        paymentStatus: ordersCorePayments.paymentStatus,
      })
      .from(ordersCorePayments)
      .where(eq(ordersCorePayments.transactionId, qrIdHint))
      .limit(1);
    if (byQr?.transactionId) {
      const gw = (byQr.gatewayResponse ?? {}) as FoodCheckoutQrGw;
      if (isFoodCheckoutQrSource(gw.source)) {
        return {
          qrId: String(byQr.transactionId),
          gw,
          paymentStatus: byQr.paymentStatus ?? null,
        };
      }
    }
  }

  const pendingId = String(args.pendingId ?? "").trim();
  const razorpayOrderId = String(args.razorpayOrderId ?? "").trim();
  if (!pendingId && !razorpayOrderId) return null;

  const rows = await db
    .select({
      transactionId: ordersCorePayments.transactionId,
      gatewayResponse: ordersCorePayments.gatewayResponse,
      paymentStatus: ordersCorePayments.paymentStatus,
    })
    .from(ordersCorePayments)
    .where(
      and(
        eq(ordersCorePayments.paymentMethod, "upi_qr"),
        eq(ordersCorePayments.paymentGateway, "razorpay"),
        sql`${ordersCorePayments.gatewayResponse}->>'source' = 'food_checkout_qr'`,
        pendingId
          ? sql`${ordersCorePayments.gatewayResponse}->>'pendingId' = ${pendingId}`
          : sql`${ordersCorePayments.gatewayResponse}->>'razorpayOrderId' = ${razorpayOrderId}`
      )
    )
    .orderBy(sql`${ordersCorePayments.id} desc`)
    .limit(3);

  const hit = rows.find((r) => r.transactionId);
  if (!hit?.transactionId) return null;
  return {
    qrId: String(hit.transactionId),
    gw: (hit.gatewayResponse ?? {}) as FoodCheckoutQrGw,
    paymentStatus: hit.paymentStatus ?? null,
  };
}

/**
 * If Razorpay already captured a payment against the food checkout QR, finalize
 * the pending order (same path as `qr_code.credited`).
 */
export async function tryRecoverFoodCheckoutQrPayment(args: {
  qrId: string;
  gw?: FoodCheckoutQrGw | null;
  via: string;
}): Promise<FoodQrRecoverResult> {
  const qrId = String(args.qrId ?? "").trim();
  if (!qrId) return { status: "skipped", reason: "missing_qr_id" };

  const db = getDb();
  let gw = args.gw ?? null;
  if (!gw) {
    const [row] = await db
      .select({ gatewayResponse: ordersCorePayments.gatewayResponse })
      .from(ordersCorePayments)
      .where(eq(ordersCorePayments.transactionId, qrId))
      .limit(1);
    gw = (row?.gatewayResponse ?? {}) as FoodCheckoutQrGw;
  }
  if (!isFoodCheckoutQrSource(gw.source)) {
    return { status: "skipped", reason: "not_food_checkout_qr" };
  }

  const pendingId = String(gw.pendingId ?? "").trim();
  const razorpayOrderId = String(gw.razorpayOrderId ?? "").trim();
  if (!pendingId || !razorpayOrderId) {
    return { status: "skipped", reason: "missing_pending_linkage" };
  }

  const [pending] = await db
    .select({
      pendingId: pendingOrders.pendingId,
      finalizedOrderId: pendingOrders.finalizedOrderId,
      paymentState: pendingOrders.paymentState,
    })
    .from(pendingOrders)
    .where(eq(pendingOrders.pendingId, pendingId))
    .limit(1);

  if (!pending) return { status: "skipped", reason: "pending_not_found" };
  if (pending.finalizedOrderId) {
    return { status: "already_finalized", pendingId };
  }

  let payments: Awaited<ReturnType<typeof fetchRazorpayQrPayments>>;
  try {
    payments = await fetchRazorpayQrPayments(qrId);
  } catch (err) {
    await logPaymentEvent(db, {
      eventType: "FOOD_QR_RECOVER_UNREACHABLE",
      source: "reconciler",
      pendingId,
      razorpayOrderId,
      failureMessage: (err as Error)?.message?.slice(0, 300) ?? "qr_fetch_failed",
      payload: { via: args.via, qrId },
    });
    return { status: "skipped", reason: "gateway_unreachable" };
  }

  // UPI QR may report captured / authorized / paid depending on Razorpay timing.
  const captured = payments.find((p) => {
    if (!p.id) return false;
    const s = String(p.status ?? "").toLowerCase();
    return s === "captured" || s === "authorized" || s === "paid";
  });
  if (!captured) {
    return { status: "pending_capture" };
  }

  const expectedPaise = Number(gw.amountPaise ?? 0);
  if (
    expectedPaise > 0 &&
    captured.amount > 0 &&
    Math.abs(expectedPaise - captured.amount) > 1
  ) {
    await logPaymentEvent(db, {
      eventType: "FOOD_QR_RECOVER_AMOUNT_MISMATCH",
      source: "reconciler",
      pendingId,
      razorpayOrderId,
      razorpayPaymentId: captured.id,
      amountPaise: captured.amount,
      payload: { via: args.via, qrId, expectedPaise },
    });
    return { status: "skipped", reason: "amount_mismatch" };
  }

  try {
    await db
      .update(pendingOrders)
      .set({ paymentMethod: "upi_qr", updatedAt: new Date() })
      .where(eq(pendingOrders.pendingId, pendingId));
  } catch {
    /* non-fatal */
  }

  const result = await finalizePendingOrderFromWebhook(db, {
    razorpayOrderId,
    razorpayPaymentId: captured.id,
    paymentMethod: "upi_qr",
    pendingIdHint: pendingId,
    gatewayPayload: {
      verifiedBy: "food_checkout_qr_recover",
      via: args.via,
      qrId,
      pendingId,
    },
  });

  if (!result.ok) {
    await logPaymentEvent(db, {
      eventType: "FOOD_QR_RECOVER_FINALIZE_FAILED",
      source: "reconciler",
      pendingId,
      razorpayOrderId,
      razorpayPaymentId: captured.id,
      failureMessage: result.code ?? "finalize_failed",
      payload: { via: args.via, qrId },
    });
    return { status: "skipped", reason: result.code ?? "finalize_failed" };
  }

  try {
    await closeRazorpayQrCode(qrId);
  } catch {
    /* best-effort */
  }

  await db
    .update(ordersCorePayments)
    .set({
      paymentStatus: "SUCCESS",
      gatewayResponse: {
        ...gw,
        recoveredVia: args.via,
        recoveredPaymentId: captured.id,
        recoveredAt: new Date().toISOString(),
      },
    })
    .where(eq(ordersCorePayments.transactionId, qrId));

  await logPaymentEvent(db, {
    eventType: "FOOD_QR_RECOVER_OK",
    source: "reconciler",
    pendingId,
    razorpayOrderId,
    razorpayPaymentId: captured.id,
    payload: { via: args.via, qrId },
  });

  notifyCustomerPaymentSettled({
    razorpayOrderId,
    status: "SUCCESS",
  });

  return { status: "finalized", pendingId, paymentId: captured.id };
}

/**
 * Convenience: recover by pendingId / razorpayOrderId when a QR row exists.
 */
export async function tryRecoverFoodCheckoutQrForPending(args: {
  pendingId?: string | null;
  razorpayOrderId?: string | null;
  via: string;
}): Promise<FoodQrRecoverResult> {
  const row = await findFoodCheckoutQrPaymentRow(args);
  if (!row) return { status: "no_qr_row" };
  return tryRecoverFoodCheckoutQrPayment({
    qrId: row.qrId,
    gw: row.gw,
    via: args.via,
  });
}
