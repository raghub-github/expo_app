/**
 * Direct-online person-ride fare reconciliation (gateway-truth recovery).
 *
 * Anchor: createRideFarePaymentOrder logs RIDE_FARE_PAYMENT_INITIATED in the
 * append-only payment_events spine with the Razorpay order id + ride order id +
 * customer + amount. This reconciler sweeps those attempts whose ride is still
 * unpaid and converges each against Razorpay via the shared resolver:
 *   CAPTURED        -> settle via the canonical finalizer (finalizeRideFare...)
 *   AMOUNT_MISMATCH -> RECONCILIATION_REQUIRED (never auto-settle)
 *   PENDING         -> defer + retry
 *   UNREACHABLE     -> defer + retry (NEVER fail captured money)
 *   NONE            -> terminal audit-failed (gateway confirms no capture)
 *
 * No new table, no second settlement algorithm — finalizeRideFarePaymentFromWebhook
 * reuses confirmRideFarePaymentForCustomer, the same finalizer the client callback
 * and the webhook converge on.
 */
import { getDb, getSql } from "../db/client.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./payment/gateway-truth.js";
import { finalizeRideFarePaymentFromWebhook } from "../modules/rides/ride-payment.service.js";
import { isRideFarePaymentPending } from "./ride-rider-payout-snapshot.js";

/** Give the client callback a chance before reconciling. */
const MIN_AGE_MS = 3 * 60 * 1000;
/** Re-check a deferred (unreachable/pending) attempt no more often than this. */
const RETRY_MS = 5 * 60 * 1000;

export async function reconcileRideFarePayments(): Promise<void> {
  const sql = getSql();
  const db = getDb();
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();

  let candidates: Array<{
    razorpay_order_id: string;
    order_id: string | null;
    amount_paise: number | null;
    payload: Record<string, unknown> | null;
  }>;
  try {
    candidates = await sql<
      Array<{ razorpay_order_id: string; order_id: string | null; amount_paise: number | null; payload: Record<string, unknown> | null }>
    >`
      SELECT DISTINCT ON (razorpay_order_id)
        razorpay_order_id, order_id, amount_paise, payload
      FROM payment_events
      WHERE event_type = 'RIDE_FARE_PAYMENT_INITIATED'
        AND razorpay_order_id IS NOT NULL
        AND created_at < ${cutoffIso}
      ORDER BY razorpay_order_id, created_at DESC
      LIMIT 50
    `;
  } catch {
    return; // DB unavailable; next tick
  }

  const now = Date.now();
  for (const c of candidates) {
    try {
      const orderId = c.razorpay_order_id;
      if (!orderId || orderId.startsWith("dummy_")) continue;

      const rideOrderId = String(c.order_id ?? (c.payload as Record<string, unknown> | null)?.business_order_id ?? "");
      if (!rideOrderId) continue;

      // Resolved already? The ride's fare is no longer pending (client/webhook settled it).
      const rideRows = await sql<Array<{ payment_status: string | null }>>`
        SELECT payment_status FROM orders_core WHERE order_id = ${rideOrderId} LIMIT 1
      `;
      if (rideRows.length > 0 && !isRideFarePaymentPending(rideRows[0]!.payment_status)) continue;

      // Skip terminal / recently-deferred attempts.
      const last = await sql<Array<{ event_type: string; created_at: string }>>`
        SELECT event_type, created_at FROM payment_events
        WHERE razorpay_order_id = ${orderId}
          AND event_type IN (
            'RIDE_FARE_RECONCILE_FAILED',
            'RECONCILIATION_REQUIRED',
            'RIDE_FARE_RECONCILE_DEFERRED'
          )
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (last.length > 0) {
        const ev = last[0]!;
        if (ev.event_type === "RIDE_FARE_RECONCILE_FAILED" || ev.event_type === "RECONCILIATION_REQUIRED") continue;
        if (ev.event_type === "RIDE_FARE_RECONCILE_DEFERRED" && now - new Date(ev.created_at).getTime() < RETRY_MS) {
          continue;
        }
      }

      const expectedPaise = Number(c.amount_paise ?? 0) || undefined;
      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        orderId: rideOrderId,
        amountPaise: expectedPaise ?? null,
        payload: { flow: "ride_fare" },
      });

      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        await logPaymentEvent(db, {
          eventType: "GATEWAY_RECONCILIATION_FOUND_PAYMENT",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          orderId: rideOrderId,
          amountPaise: truth.paidPaise,
          payload: { flow: "ride_fare" },
        });
        const res = await finalizeRideFarePaymentFromWebhook({
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          amountPaise: truth.paidPaise,
          notes: null, // resolved from the anchor inside the finalizer
          source: "reconciler",
        });
        await logPaymentEvent(db, {
          eventType: res.ok ? "RIDE_FARE_RECONCILE_SETTLED" : "RIDE_FARE_RECONCILE_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          orderId: rideOrderId,
          failureCode: res.ok ? null : res.code,
          payload: { flow: "ride_fare", ok: res.ok, idempotent: res.ok ? res.idempotent : null },
        });
        continue;
      }

      if (truth.state === "AMOUNT_MISMATCH") {
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          orderId: rideOrderId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          amountPaise: truth.paidPaise,
          payload: { flow: "ride_fare", expectedPaise: truth.expectedPaise },
        });
        continue;
      }

      if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        await logPaymentEvent(db, {
          eventType: "RIDE_FARE_RECONCILE_DEFERRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          orderId: rideOrderId,
          payload: {
            flow: "ride_fare",
            gatewayState: truth.state,
            ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}),
          },
        });
        continue;
      }

      // truth.state === "NONE": gateway reachable, no captured/live payment.
      await logPaymentEvent(db, {
        eventType: "RIDE_FARE_RECONCILE_FAILED",
        source: "reconciler",
        razorpayOrderId: orderId,
        orderId: rideOrderId,
        failureCode: "NO_CAPTURE",
        payload: { flow: "ride_fare" },
      });
    } catch {
      // non-fatal: skip; retry next sweep
    }
  }
}
