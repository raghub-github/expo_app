/**
 * Online-QR ride payment RECONCILER (safety net for missed webhooks).
 *
 * The happy path is the `qr_code.credited` webhook → finalizeRideOnlineQrPayment → the rider
 * app (which polls every 15s) auto-completes the ride. But if that webhook is missed,
 * mis-configured on the Razorpay account, or delayed, the ride would sit on "Fare Pending"
 * forever. This poller actively closes that gap: it finds still-open QR payments and asks
 * Razorpay whether they were actually paid, then finalizes via the SAME idempotent finalizer
 * the webhook uses (no double settlement).
 *
 * Redis-locked (single replica), unref'd, dummy-mode/no-keys aware (skips — nothing to fetch).
 */
import { withLock } from "@gatimitra/redis";
import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { fetchRazorpayQrPayments } from "../../services/payment/razorpayService.js";
import { finalizeRideOnlineQrPayment } from "./ride-online-qr.service.js";

const LOCK_KEY = "tick:ride-online-qr-reconciler";
const LOCK_TTL_MS = 55_000;
const DEFAULT_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

/** One reconcile pass: finalize any INITIATED QR whose Razorpay side is already captured. */
export async function reconcileOpenRideQrPaymentsOnce(): Promise<{ finalized: number; checked: number }> {
  const env = getEnv();
  // Nothing to reconcile against in dummy/dev with no real gateway — the webhook (real acct)
  // is the only finalizer there.
  if (env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { finalized: 0, checked: 0 };
  }
  const sql = getSql();
  // Open QR payments created within the last few hours (QR TTL is 30min; widen for late scans
  // + webhook lag). Only real-gateway rows; dummy rows have paymentGateway='dummy'.
  const rows = (await sql`
    SELECT transaction_id, amount
    FROM orders_core_payments
    WHERE payment_method = 'upi_qr'
      AND payment_gateway = 'razorpay'
      AND payment_status = 'INITIATED'
      AND created_at > now() - interval '6 hours'
    ORDER BY created_at DESC
    LIMIT 50
  `) as unknown as Array<{ transaction_id: string; amount: string | number }>;

  let finalized = 0;
  for (const r of rows) {
    const qrId = String(r.transaction_id ?? "").trim();
    if (!qrId) continue;
    try {
      const payments = await fetchRazorpayQrPayments(qrId);
      const captured = payments.find((p) => p.status === "captured");
      if (!captured) continue; // not paid yet — leave open
      const res = await finalizeRideOnlineQrPayment({
        qrId,
        razorpayPaymentId: captured.id || null,
        amountPaise: captured.amount,
      });
      if (!res.alreadyDone) {
        finalized += 1;
        console.info(`[ride-qr-reconciler] finalized missed webhook for QR ${qrId} (order ${res.orderId})`);
      }
    } catch (err) {
      console.warn(`[ride-qr-reconciler] check failed for QR ${qrId}:`, (err as Error).message);
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
      if (finalized > 0) console.info(`[ride-qr-reconciler] finalized ${finalized} missed QR payment(s)`);
    });
  } finally {
    running = false;
  }
}

export async function startRideOnlineQrReconciler(): Promise<void> {
  if (timer) return;
  const env = getEnv();
  if (env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return; // no real gateway → nothing to reconcile; don't spin a poller
  }
  void pollOnce().catch((e) => console.warn("[ride-qr-reconciler] initial pass error", (e as Error).message));
  timer = setInterval(() => {
    void pollOnce().catch((e) => console.warn("[ride-qr-reconciler] poll error", (e as Error).message));
  }, DEFAULT_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

export function stopRideOnlineQrReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
