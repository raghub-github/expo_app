/**
 * Online-QR payment RECONCILER (safety net for missed webhooks).
 *
 * Happy path: `qr_code.credited` webhook → finalize*OnlineQrPayment.
 * This poller closes the gap when the webhook is missed/delayed: fetch Razorpay
 * QR payments and finalize via the same idempotent finalizers (ride or parcel).
 */
import { withLock } from "@gatimitra/redis";
import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { fetchRazorpayQrPayments } from "../../services/payment/razorpayService.js";
import { finalizeRideOnlineQrPayment } from "./ride-online-qr.service.js";
import { finalizeParcelOnlineQrPayment } from "../parcel/parcel-online-qr.service.js";

const LOCK_KEY = "tick:ride-online-qr-reconciler";
const LOCK_TTL_MS = 55_000;
const DEFAULT_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

type OpenQrRow = {
  transaction_id: string;
  amount: string | number;
  gateway_response: Record<string, unknown> | null;
};

/** One reconcile pass: finalize any INITIATED QR whose Razorpay side is already captured. */
export async function reconcileOpenRideQrPaymentsOnce(): Promise<{
  finalized: number;
  checked: number;
}> {
  const env = getEnv();
  if (env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { finalized: 0, checked: 0 };
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT transaction_id, amount, gateway_response
    FROM orders_core_payments
    WHERE payment_method = 'upi_qr'
      AND payment_gateway = 'razorpay'
      AND payment_status = 'INITIATED'
      AND created_at > now() - interval '6 hours'
    ORDER BY created_at DESC
    LIMIT 50
  `) as unknown as OpenQrRow[];

  let finalized = 0;
  for (const r of rows) {
    const qrId = String(r.transaction_id ?? "").trim();
    if (!qrId) continue;
    try {
      const payments = await fetchRazorpayQrPayments(qrId);
      const captured = payments.find((p) => p.status === "captured");
      if (!captured) continue;
      const source = String(
        ((r.gateway_response ?? {}) as { source?: string }).source ?? ""
      );
      const isParcel = source === "parcel_online_qr";
      const res = isParcel
        ? await finalizeParcelOnlineQrPayment({
            qrId,
            razorpayPaymentId: captured.id || null,
            amountPaise: captured.amount,
            currency: "INR",
            paymentStatus: "captured",
          })
        : await finalizeRideOnlineQrPayment({
            qrId,
            razorpayPaymentId: captured.id || null,
            amountPaise: captured.amount,
          });
      if (!res.alreadyDone) {
        finalized += 1;
        console.info(
          `[online-qr-reconciler] finalized missed webhook for QR ${qrId} (${isParcel ? "parcel" : "ride"} ${res.orderId})`
        );
      }
    } catch (err) {
      console.warn(
        `[online-qr-reconciler] check failed for QR ${qrId}:`,
        (err as Error).message
      );
    }
  }
  return { finalized, checked: rows.length };
}

async function pollOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
      const { finalized } = await reconcileOpenRideQrPaymentsOnce();
      if (finalized > 0) {
        console.info(
          `[online-qr-reconciler] finalized ${finalized} missed QR payment(s)`
        );
      }
    });
  } finally {
    running = false;
  }
}

export async function startRideOnlineQrReconciler(): Promise<void> {
  if (timer) return;
  const env = getEnv();
  if (env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return;
  }
  void pollOnce().catch((e) =>
    console.warn("[online-qr-reconciler] initial pass error", (e as Error).message)
  );
  timer = setInterval(() => {
    void pollOnce().catch((e) =>
      console.warn("[online-qr-reconciler] poll error", (e as Error).message)
    );
  }, DEFAULT_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

export function stopRideOnlineQrReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
