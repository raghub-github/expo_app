/**
 * In-app parcel fare reconciliation (gateway-truth recovery) — the parcel twin of
 * ride-fare-payment-reconcile.service.ts, kept separate so the ride flow is
 * untouched.
 *
 * Anchor: createParcelFarePaymentOrder logs PARCEL_FARE_PAYMENT_INITIATED in the
 * append-only payment_events spine. This reconciler sweeps attempts whose parcel
 * is still unpaid and converges each against Razorpay via the shared resolver:
 *   CAPTURED        -> settle via the canonical finalizer (finalizeParcelFare...)
 *   AMOUNT_MISMATCH -> RECONCILIATION_REQUIRED (never auto-settle)
 *   PENDING         -> defer + retry
 *   UNREACHABLE     -> defer + retry (NEVER fail captured money)
 *   NONE            -> terminal audit-failed (gateway confirms no capture)
 *
 * No new table, no second settlement algorithm — finalizeParcelFarePaymentFromWebhook
 * reuses confirmParcelFarePaymentForCustomer, the same finalizer the client callback
 * and the webhook converge on.
 */
import { getDb, getSql } from "../db/client.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./payment/gateway-truth.js";
import { finalizeParcelFarePaymentFromWebhook } from "../modules/parcel/parcel-fare-payment.service.js";

function isParcelFarePending(paymentStatus: string | null): boolean {
  const ps = String(paymentStatus ?? "").trim().toLowerCase();
  return ps !== "paid" && ps !== "completed" && ps !== "captured";
}

/** Give the client callback a chance before reconciling. */
const MIN_AGE_MS = 3 * 60 * 1000;
/** Re-check a deferred (unreachable/pending) attempt no more often than this. */
const RETRY_MS = 5 * 60 * 1000;

export async function reconcileParcelFarePayments(): Promise<void> {
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
      WHERE event_type = 'PARCEL_FARE_PAYMENT_INITIATED'
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

      const parcelOrderId = String(c.order_id ?? (c.payload as Record<string, unknown> | null)?.business_order_id ?? "");
      if (!parcelOrderId) continue;

      // Resolved already? The parcel fare is no longer pending (client/webhook/rider settled it).
      const parcelRows = await sql<Array<{ payment_status: string | null }>>`
        SELECT payment_status FROM orders_core WHERE order_id = ${parcelOrderId} LIMIT 1
      `;
      if (parcelRows.length > 0 && !isParcelFarePending(parcelRows[0]!.payment_status)) continue;

      // Skip terminal / recently-deferred attempts.
      const last = await sql<Array<{ event_type: string; created_at: string }>>`
        SELECT event_type, created_at FROM payment_events
        WHERE razorpay_order_id = ${orderId}
          AND event_type IN (
            'PARCEL_FARE_RECONCILE_FAILED',
            'RECONCILIATION_REQUIRED',
            'PARCEL_FARE_RECONCILE_DEFERRED'
          )
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (last.length > 0) {
        const ev = last[0]!;
        if (ev.event_type === "PARCEL_FARE_RECONCILE_FAILED" || ev.event_type === "RECONCILIATION_REQUIRED") continue;
        if (ev.event_type === "PARCEL_FARE_RECONCILE_DEFERRED" && now - new Date(ev.created_at).getTime() < RETRY_MS) {
          continue;
        }
      }

      const expectedPaise = Number(c.amount_paise ?? 0) || undefined;
      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        orderId: parcelOrderId,
        amountPaise: expectedPaise ?? null,
        payload: { flow: "parcel_fare" },
      });

      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        await logPaymentEvent(db, {
          eventType: "GATEWAY_RECONCILIATION_FOUND_PAYMENT",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          orderId: parcelOrderId,
          amountPaise: truth.paidPaise,
          payload: { flow: "parcel_fare" },
        });
        const res = await finalizeParcelFarePaymentFromWebhook({
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          notes: null, // resolved from the anchor inside the finalizer
          source: "reconciler",
        });
        await logPaymentEvent(db, {
          eventType: res.ok ? "PARCEL_FARE_RECONCILE_SETTLED" : "PARCEL_FARE_RECONCILE_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          orderId: parcelOrderId,
          failureCode: res.ok ? null : res.code,
          payload: { flow: "parcel_fare", ok: res.ok, idempotent: res.ok ? res.idempotent : null },
        });
        continue;
      }

      if (truth.state === "AMOUNT_MISMATCH") {
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          orderId: parcelOrderId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          amountPaise: truth.paidPaise,
          payload: { flow: "parcel_fare", expectedPaise: truth.expectedPaise },
        });
        continue;
      }

      if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        await logPaymentEvent(db, {
          eventType: "PARCEL_FARE_RECONCILE_DEFERRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          orderId: parcelOrderId,
          payload: {
            flow: "parcel_fare",
            gatewayState: truth.state,
            ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}),
          },
        });
        continue;
      }

      // truth.state === "NONE": gateway reachable, no captured/live payment.
      await logPaymentEvent(db, {
        eventType: "PARCEL_FARE_RECONCILE_FAILED",
        source: "reconciler",
        razorpayOrderId: orderId,
        orderId: parcelOrderId,
        failureCode: "NO_CAPTURE",
        payload: { flow: "parcel_fare" },
      });
    } catch {
      // non-fatal: skip; retry next sweep
    }
  }
}
