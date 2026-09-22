/**
 * Merchant subscription payment reconciliation (gateway-truth recovery).
 *
 * Merchant subscription is the one flow with NO durable pending row: the
 * subscription_payments row is created only on success (as 'PAID'), so a
 * captured-but-unconfirmed payment (client callback + webhook both lost) leaves
 * no DB row for a row-sweep reconciler to find. Per the approved Option A2, the
 * anchor is the append-only payment_events spine: createMerchantSubscription-
 * PaymentOrder logs MERCHANT_SUB_PAYMENT_INITIATED with the Razorpay order id +
 * merchant/plan context, and this reconciler sweeps those attempts.
 *
 * For each initiated attempt with no matching subscription_payments row, it asks
 * Razorpay the authoritative outcome via the shared resolver and converges:
 *   CAPTURED        -> activate via the existing idempotent finalizer
 *   AMOUNT_MISMATCH -> RECONCILIATION_REQUIRED (never auto-activate)
 *   PENDING         -> defer + retry
 *   UNREACHABLE     -> defer + retry (NEVER fail captured money)
 *   NONE            -> terminal audit-failed event
 *
 * No schema change, no new table, no second activation formula — it reuses
 * activateMerchantSubscriptionFromWebhook, which webhook + client callback also
 * converge on, so the finalization path is identical for all three.
 */
import { getDb, getSql } from "../db/client.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./payment/gateway-truth.js";
import { activateMerchantSubscriptionFromWebhook } from "../modules/merchant-partner/merchant-subscription.service.js";

/** Give the client verify / webhook a chance before reconciling. */
const MIN_AGE_MS = 3 * 60 * 1000;
/** Re-check a deferred (unreachable/pending) attempt no more often than this. */
const RETRY_MS = 5 * 60 * 1000;

export async function reconcileMerchantSubscriptionPayments(): Promise<void> {
  const sql = getSql();
  const db = getDb();
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();

  let candidates: Array<{
    razorpay_order_id: string;
    amount_paise: number | null;
    payload: Record<string, unknown> | null;
  }>;
  try {
    candidates = await sql<
      Array<{ razorpay_order_id: string; amount_paise: number | null; payload: Record<string, unknown> | null }>
    >`
      SELECT DISTINCT ON (razorpay_order_id)
        razorpay_order_id, amount_paise, payload
      FROM payment_events
      WHERE event_type = 'MERCHANT_SUB_PAYMENT_INITIATED'
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

      // Resolved already? A subscription_payments row references this order id
      // (client verify or webhook activated it). This is the authoritative
      // "already finalized" signal — skip.
      const activated = await sql<Array<{ id: number }>>`
        SELECT id FROM subscription_payments
        WHERE payment_gateway_response->>'razorpay_order_id' = ${orderId}
        LIMIT 1
      `;
      if (activated.length > 0) continue;

      // Skip terminal or recently-deferred attempts to avoid re-processing /
      // hammering the gateway every tick.
      const last = await sql<Array<{ event_type: string; created_at: string }>>`
        SELECT event_type, created_at FROM payment_events
        WHERE razorpay_order_id = ${orderId}
          AND event_type IN (
            'MERCHANT_SUB_RECONCILE_FAILED',
            'RECONCILIATION_REQUIRED',
            'MERCHANT_SUB_RECONCILE_DEFERRED'
          )
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (last.length > 0) {
        const ev = last[0]!;
        if (ev.event_type === "MERCHANT_SUB_RECONCILE_FAILED" || ev.event_type === "RECONCILIATION_REQUIRED") {
          continue; // terminal — needs ops, do not auto-retry
        }
        if (
          ev.event_type === "MERCHANT_SUB_RECONCILE_DEFERRED" &&
          now - new Date(ev.created_at).getTime() < RETRY_MS
        ) {
          continue; // deferred recently — wait for the retry window
        }
      }

      const payload = (c.payload ?? {}) as Record<string, unknown>;
      const merchantStorePk = Number(payload.merchant_store_pk ?? payload.merchantStorePk ?? 0);
      const planId = Number(payload.plan_id ?? payload.planId ?? 0);
      const expectedPaise = Number(c.amount_paise ?? 0) || undefined;

      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        amountPaise: expectedPaise ?? null,
        payload: { flow: "merchant_subscription", merchantStorePk, planId },
      });

      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        await logPaymentEvent(db, {
          eventType: "GATEWAY_RECONCILIATION_FOUND_PAYMENT",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          amountPaise: truth.paidPaise,
          payload: { flow: "merchant_subscription" },
        });
        const res = await activateMerchantSubscriptionFromWebhook({
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          notes: { merchant_store_pk: merchantStorePk, plan_id: planId },
        });
        await logPaymentEvent(db, {
          eventType: res.ok ? "MERCHANT_SUB_RECONCILE_ACTIVATED" : "MERCHANT_SUB_RECONCILE_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: res.ok ? null : res.code,
          failureMessage: res.ok ? null : res.message,
          payload: {
            flow: "merchant_subscription",
            ok: res.ok,
            subscriptionId: res.ok ? res.subscriptionId : null,
            idempotent: res.ok ? res.idempotent : null,
          },
        });
        continue;
      }

      if (truth.state === "AMOUNT_MISMATCH") {
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          amountPaise: truth.paidPaise,
          payload: { flow: "merchant_subscription", expectedPaise: truth.expectedPaise, merchantStorePk, planId },
        });
        continue;
      }

      if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        await logPaymentEvent(db, {
          eventType: "MERCHANT_SUB_RECONCILE_DEFERRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          payload: {
            flow: "merchant_subscription",
            gatewayState: truth.state,
            ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}),
          },
        });
        continue;
      }

      // truth.state === "NONE": gateway reachable, no captured/live payment.
      await logPaymentEvent(db, {
        eventType: "MERCHANT_SUB_RECONCILE_FAILED",
        source: "reconciler",
        razorpayOrderId: orderId,
        failureCode: "NO_CAPTURE",
        failureMessage: "Gateway reports no captured payment for this subscription order.",
        payload: { flow: "merchant_subscription", merchantStorePk, planId },
      });
    } catch {
      // non-fatal: skip; retry next sweep
    }
  }
}
