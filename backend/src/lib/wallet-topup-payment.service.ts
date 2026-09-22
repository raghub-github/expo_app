/**
 * GatiCash wallet top-up: webhook + reconciliation recovery.
 *
 * Top-up already has a durable anchor (customer_wallet_topup_intents, status
 * PAYMENT_PENDING, pg_order_id) and an idempotent credit (the customer_wallet_credit
 * RPC keyed on wallet_topup_<intent_id>). What was missing was server-authoritative
 * recovery when the client /wallet/topup/confirm callback is lost: no webhook branch,
 * no gateway-truth reconciler — so a captured top-up left the customer charged with
 * no GatiCash credited.
 *
 * settleWalletTopupFromGateway reuses the SAME RPC + SAME idempotency key as the
 * client route (no second finalizer), so client callback, webhook and reconciler
 * credit the wallet exactly once. reconcileWalletTopups sweeps the intents table.
 */
import { getDb, getSql } from "../db/client.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./payment/gateway-truth.js";

type SettleResult = { ok: boolean; idempotent?: boolean; code?: string };

/**
 * Credit a captured wallet top-up server-side (webhook/reconciler). Idempotent:
 * a PAID intent returns idempotent ok; the credit RPC dedups on the idempotency
 * key so racing paths credit exactly once.
 */
export async function settleWalletTopupFromGateway(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  source?: string;
}): Promise<SettleResult> {
  const sql = getSql();
  const orderId = args.razorpayOrderId?.trim() ?? "";
  const paymentId = args.razorpayPaymentId?.trim() ?? "";
  if (!orderId || !paymentId) return { ok: false, code: "INVALID_PAYLOAD" };

  const rows = await sql<
    Array<{ id: number; customer_id: number; intent_id: string; amount: string | number; status: string }>
  >`
    SELECT id, customer_id, intent_id, amount, status
    FROM customer_wallet_topup_intents
    WHERE pg_order_id = ${orderId}
    LIMIT 1
  `;
  const intent = rows[0];
  if (!intent) return { ok: false, code: "INTENT_NOT_FOUND" };
  if (intent.status === "PAID") return { ok: true, idempotent: true };
  if (intent.status !== "CREATED" && intent.status !== "PAYMENT_PENDING") {
    return { ok: false, code: "INTENT_TERMINAL" };
  }

  const amount = Number(intent.amount);
  const idempotencyKey = `wallet_topup_${intent.intent_id}`.slice(0, 120);
  const description = `GatiCash top-up ₹${amount.toLocaleString("en-IN")}`;

  try {
    const creditRows = await sql`
      SELECT public.customer_wallet_credit(
        ${intent.customer_id},
        ${amount},
        'TOPUP'::public.wallet_transaction_type,
        ${intent.intent_id},
        ${"wallet_topup"},
        ${description},
        ${paymentId},
        ${idempotencyKey},
        ${JSON.stringify({
          intent_id: intent.intent_id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          source: args.source ?? "webhook",
        })}::text::jsonb,
        'ADDED'::public.customer_wallet_balance_lot_type,
        ${null}
      ) AS tx_id
    `;
    const txId = Number((creditRows[0] as { tx_id?: number } | undefined)?.tx_id ?? 0);
    await sql`
      UPDATE customer_wallet_topup_intents
      SET status = 'PAID',
          pg_payment_id = ${paymentId},
          wallet_transaction_id = ${txId > 0 ? txId : null},
          updated_at = NOW()
      WHERE id = ${intent.id} AND status <> 'PAID'
    `;
    return { ok: true, idempotent: false };
  } catch {
    return { ok: false, code: "CREDIT_FAILED" };
  }
}

const MIN_AGE_MS = 3 * 60 * 1000;

/**
 * Sweep unpaid top-up intents and converge each against Razorpay. CAPTURED ->
 * credit (idempotent); AMOUNT_MISMATCH -> reconciliation_required; PENDING/
 * UNREACHABLE -> defer (never fail captured money); NONE -> mark the intent failed.
 */
export async function reconcileWalletTopups(): Promise<void> {
  const sql = getSql();
  const db = getDb();
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();

  let rows: Array<{ id: number; pg_order_id: string | null; amount: string | number; status: string }>;
  try {
    rows = await sql`
      SELECT id, pg_order_id, amount, status
      FROM customer_wallet_topup_intents
      WHERE status IN ('CREATED','PAYMENT_PENDING')
        AND pg_order_id IS NOT NULL
        AND created_at < ${cutoffIso}
        AND created_at > NOW() - INTERVAL '2 days'
      ORDER BY created_at DESC
      LIMIT 50
    `;
  } catch {
    return;
  }

  for (const r of rows) {
    try {
      const orderId = String(r.pg_order_id ?? "");
      if (!orderId || orderId.startsWith("dummy_")) continue;
      const expectedPaise = Math.round(Number(r.amount) * 100);

      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        amountPaise: expectedPaise,
        payload: { flow: "wallet_topup" },
      });
      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        const res = await settleWalletTopupFromGateway({
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          source: "reconciler",
        });
        await logPaymentEvent(db, {
          eventType: res.ok ? "WALLET_TOPUP_RECONCILE_SETTLED" : "WALLET_TOPUP_RECONCILE_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: res.ok ? null : res.code,
          payload: { flow: "wallet_topup" },
        });
      } else if (truth.state === "AMOUNT_MISMATCH") {
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          payload: { flow: "wallet_topup", expectedPaise: truth.expectedPaise, paidPaise: truth.paidPaise },
        });
      } else if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        await logPaymentEvent(db, {
          eventType: "WALLET_TOPUP_RECONCILE_DEFERRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          payload: { flow: "wallet_topup", gatewayState: truth.state, ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}) },
        });
      } else {
        // NONE: gateway reachable, no capture → mark the intent failed (removes it
        // from the sweep). The customer was not charged.
        await sql`
          UPDATE customer_wallet_topup_intents
          SET status = 'FAILED', failure_reason = 'reconciled_no_capture', updated_at = NOW()
          WHERE id = ${r.id} AND status IN ('CREATED','PAYMENT_PENDING')
        `;
        await logPaymentEvent(db, {
          eventType: "WALLET_TOPUP_RECONCILE_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          failureCode: "NO_CAPTURE",
          payload: { flow: "wallet_topup" },
        });
      }
    } catch {
      // non-fatal; retry next sweep
    }
  }
}
