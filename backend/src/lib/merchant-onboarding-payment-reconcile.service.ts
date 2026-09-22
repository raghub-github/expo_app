/**
 * Merchant onboarding-fee reconciliation (gateway-truth recovery).
 *
 * Merchant onboarding is created in the partnersite app (its Razorpay order +
 * merchant_onboarding_payments row) and finalized by the partnersite client
 * verify-payment + partnersite webhook. Those are two nets, but there was NO
 * gateway-truth reconciler: if BOTH the callback and the partnersite webhook are
 * lost, a captured onboarding fee stays status='created' forever with no recovery.
 *
 * partnersite and the backend share the SAME Razorpay account (both read
 * RAZORPAY_KEY_ID/SECRET) and the SAME Supabase DB, so the backend's existing
 * reconciler infra can safely close this gap without a new surface, scheduler,
 * table, or the partnersite key. Business activation is handled by the DB trigger
 * auto_verify_commission_plan_on_payment_capture (migration 0469) which fires when
 * status transitions to 'captured' (OLD guard makes it idempotent) — so this
 * reconciler only needs to flip a genuinely-captured order to 'captured'.
 */
import { getDb, getSql } from "../db/client.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./payment/gateway-truth.js";

/** Give the partnersite callback/webhook a chance before reconciling. */
const MIN_AGE_MS = 3 * 60 * 1000;

export async function reconcileMerchantOnboardingPayments(): Promise<void> {
  const sql = getSql();
  const db = getDb();
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();

  let rows: Array<{ id: number; razorpay_order_id: string | null; amount_paise: number; status: string; merchant_store_id: number | null }>;
  try {
    rows = await sql`
      SELECT id, razorpay_order_id, amount_paise, status, merchant_store_id
      FROM merchant_onboarding_payments
      WHERE lower(status) IN ('created','pending')
        AND razorpay_order_id IS NOT NULL
        AND created_at < ${cutoffIso}
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 50
    `;
  } catch {
    // Table absent in this env, or DB unavailable — next tick.
    return;
  }

  for (const r of rows) {
    try {
      const orderId = String(r.razorpay_order_id ?? "");
      if (!orderId || orderId.startsWith("dummy_")) continue;
      const expectedPaise = Number(r.amount_paise ?? 0) || undefined;

      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        amountPaise: expectedPaise ?? null,
        payload: { flow: "merchant_onboarding", merchantStoreId: r.merchant_store_id ?? null },
      });
      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        // Flip to captured (idempotent via the status guard). The DB trigger
        // auto_verify_commission_plan_on_payment_capture handles activation.
        await sql`
          UPDATE merchant_onboarding_payments
          SET status = 'captured',
              razorpay_status = 'captured',
              razorpay_payment_id = COALESCE(razorpay_payment_id, ${truth.paymentId}),
              captured_at = COALESCE(captured_at, NOW()),
              updated_at = NOW()
          WHERE id = ${r.id}
            AND lower(status) NOT IN ('captured','refunded','failed')
        `;
        await logPaymentEvent(db, {
          eventType: "MERCHANT_ONBOARDING_RECONCILE_CAPTURED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          amountPaise: truth.paidPaise,
          payload: { flow: "merchant_onboarding", merchantStoreId: r.merchant_store_id ?? null },
        });
      } else if (truth.state === "AMOUNT_MISMATCH") {
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          payload: { flow: "merchant_onboarding", expectedPaise: truth.expectedPaise, paidPaise: truth.paidPaise },
        });
      } else if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        await logPaymentEvent(db, {
          eventType: "MERCHANT_ONBOARDING_RECONCILE_DEFERRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          payload: { flow: "merchant_onboarding", gatewayState: truth.state, ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}) },
        });
      } else {
        // NONE: gateway reachable, no capture → mark failed (removes from sweep).
        await sql`
          UPDATE merchant_onboarding_payments
          SET status = 'failed', failure_reason = 'reconciled_no_capture',
              failed_at = COALESCE(failed_at, NOW()), updated_at = NOW()
          WHERE id = ${r.id} AND lower(status) IN ('created','pending')
        `;
        await logPaymentEvent(db, {
          eventType: "MERCHANT_ONBOARDING_RECONCILE_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          failureCode: "NO_CAPTURE",
          payload: { flow: "merchant_onboarding" },
        });
      }
    } catch {
      // non-fatal; retry next sweep
    }
  }
}
