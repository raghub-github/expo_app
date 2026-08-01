/**
 * Auto-refund on cancellation.
 *
 * When an order is cancelled *before the customer got what they paid for* —
 * merchant never accepted in time (auto-cancel), merchant denied, or an admin
 * cancelled manually — the customer must get their money back automatically.
 *
 * Existing cancellation code only RECORDS refund intent (order_cancellation
 * refund_status/amount from the rule engine); it never moves money. This helper
 * closes that gap: it creates a `full` order_refunds row for the amount the
 * customer actually paid and hands it to the shared executor
 * (executeOrderRefund), which routes it to Razorpay / customer wallet, or marks
 * it NOOP for COD (nothing was paid).
 *
 * Safety properties:
 *  - Idempotent: if a non-failed refund already exists for the order, it does
 *    nothing (so re-running the cancel cron / double webhooks can't double-pay).
 *  - Best-effort: callers should not let a refund failure abort the
 *    cancellation itself — wrap the call and log. The order_refunds row is left
 *    behind for ops to retry via /v1/internal/orders/:id/refund/execute.
 */

import type { Sql } from "postgres";
import { getSql } from "../db/client.js";
import { generateRefundRrn } from "./refund-rrn.js";
import {
  executeOrderRefund,
  type RefundExecutionResult,
} from "../modules/orders/order-refund-executor.js";

export interface AutoRefundArgs {
  /** orders_core primary key. */
  orderCoreId: number;
  /** Reason text stamped on the refund + audit trail. */
  reason: string;
  /** Who/what triggered the cancellation (for the audit trail). */
  actorEmail?: string | null;
  actorRole?: string | null;
  /** Optional override; when omitted the customer's captured/paid amount is used. */
  amount?: number | null;
}

export interface AutoRefundOutcome {
  triggered: boolean;
  skippedReason?:
    | "already_refunded"
    | "nothing_paid"
    | "order_not_found"
    | "below_gateway_minimum";
  refundId?: number;
  result?: RefundExecutionResult;
}

/** Payment gateways (Razorpay) reject refunds below ₹1. */
const MIN_GATEWAY_REFUND = 1;

/**
 * Resolve the amount to refund at 100%: wallet (GatiCash) + gateway captured.
 * Prefer gateway_response.breakdown; fall back to payments.amount + pending
 * gati_cash_applied, then grand_total.
 */
async function resolvePaidAmount(sql: Sql, orderCoreId: number): Promise<number> {
  const rows = await sql`
    SELECT
      c.grand_total AS grand_total,
      p.amount      AS paid_amount,
      p.payment_gateway AS payment_gateway,
      p.gateway_response AS gateway_response,
      po.gati_cash_applied AS pending_gati_cash
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT op.amount, op.payment_gateway, op.gateway_response
      FROM orders_core_payments op
      WHERE op.order_id = c.order_id
        AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
      ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
      LIMIT 1
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT gati_cash_applied
      FROM pending_orders po
      WHERE po.finalized_order_id = c.order_id
      ORDER BY po.finalized_at DESC NULLS LAST
      LIMIT 1
    ) po ON TRUE
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const r = rows[0] as {
    grand_total?: unknown;
    paid_amount?: unknown;
    payment_gateway?: unknown;
    gateway_response?: unknown;
    pending_gati_cash?: unknown;
  } | undefined;
  if (!r) return -1; // signal not found

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  let gatiCash = 0;
  let gatewayAmt = 0;
  const gwResp = r.gateway_response;
  if (gwResp && typeof gwResp === "object") {
    const root = gwResp as Record<string, unknown>;
    const breakdown =
      root.breakdown && typeof root.breakdown === "object"
        ? (root.breakdown as Record<string, unknown>)
        : root;
    gatiCash = Math.max(0, num(breakdown.gatiCashUsed));
    gatewayAmt = Math.max(0, num(breakdown.gatewayAmount));
  }
  if (gatiCash <= 0.005) gatiCash = Math.max(0, num(r.pending_gati_cash));

  const paidRow = num(r.paid_amount);
  const gw = String(r.payment_gateway ?? "").toLowerCase();
  if (gatewayAmt <= 0.005 && paidRow > 0.005 && (gw === "razorpay" || gw === "upi" || gw === "card")) {
    gatewayAmt = paidRow;
  }
  if (gatiCash <= 0.005 && paidRow > 0.005 && (gw === "gati_cash" || gw === "wallet")) {
    gatiCash = paidRow;
  }
  // Prepaid often stamped payment_gateway=online with Source=Wallet and no pay_*.
  if (
    gatiCash <= 0.005 &&
    gatewayAmt <= 0.005 &&
    paidRow > 0.005 &&
    gw !== "cod" &&
    gw !== "cash"
  ) {
    if (gw === "online" || gw === "mixed" || !gw) {
      gatiCash = paidRow;
    }
  }

  const fromBreakdown = round2(gatiCash + gatewayAmt);
  if (fromBreakdown > 0.005) return fromBreakdown;
  if (paidRow > 0.005) return round2(paidRow);
  // Never invent a COD/cash "paid" amount from grand_total — that forces hollow
  // wallet credits. Prepaid wallet without a payments row still needs grand_total.
  if (gw === "cod" || gw === "cash") return 0;
  const gross = num(r.grand_total);
  return gross > 0.005 ? round2(gross) : 0;
}

/** True when this order already has a non-failed refund (any prior attempt that moved / is moving money). */
async function hasActiveRefund(sql: Sql, orderCoreId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM order_refunds
    WHERE order_id = ${orderCoreId}
      AND UPPER(COALESCE(execution_status, '')) <> 'FAILED'
      AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
      AND (
        -- Real money movement, or in-flight gateway refund.
        -- INITIATED/pending hollow rows are reclaimed above — do not block here.
        customer_wallet_ledger_id IS NOT NULL
        OR NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NOT NULL
        OR UPPER(COALESCE(execution_status, '')) = 'PROCESSING'
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Completed/NOOP refund rows that never credited wallet or gateway (legacy COD_NOOP
 * mis-route / RFND-* placeholders). Clear the execution lock so executeOrderRefund
 * can restore funds.
 */
async function reclaimHollowRefund(
  sql: Sql,
  orderCoreId: number
): Promise<number | null> {
  // Legacy COD_NOOP / 0483 RFND-{id} / stuck INITIATED rows marked done without
  // wallet/gateway movement. Do NOT reclaim PROCESSING gateway refunds that already
  // have a razorpay_refund_id.
  const rows = await sql`
    SELECT id
    FROM order_refunds
    WHERE order_id = ${orderCoreId}
      AND customer_wallet_ledger_id IS NULL
      AND NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NULL
      AND COALESCE(refund_amount, 0) > 0
      AND (
        LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
        OR (
          UPPER(COALESCE(execution_status, '')) = 'FAILED'
          AND COALESCE(failure_reason, '') ~* 'razorpay_payment_id_missing'
        )
      )
      AND (
        UPPER(COALESCE(execution_status, '')) IN ('COMPLETED', 'NOOP', 'INITIATED', 'PROCESSING')
        OR TRIM(COALESCE(refund_reference, '')) ~* '^RFND-\\d+$'
        OR (
          LOWER(COALESCE(refund_status, '')) IN ('completed', 'refunded', 'pending')
          AND (
            NULLIF(TRIM(COALESCE(execution_status, '')), '') IS NULL
            OR UPPER(COALESCE(execution_status, '')) IN ('COMPLETED', 'NOOP', 'INITIATED', 'PROCESSING')
          )
        )
        OR (
          UPPER(COALESCE(execution_status, '')) = 'FAILED'
          AND COALESCE(failure_reason, '') ~* 'razorpay_payment_id_missing'
        )
      )
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const id = rows[0] != null ? Number((rows[0] as { id: number }).id) : NaN;
  if (!Number.isFinite(id) || id <= 0) return null;

  await sql`
    UPDATE order_refunds
    SET execution_key = NULL,
        execution_status = NULL,
        execution_route = NULL,
        failure_reason = NULL,
        failed_at = NULL,
        refund_status = 'pending',
        refund_reference = CASE
          WHEN TRIM(COALESCE(refund_reference, '')) ~* '^(RFND-\\d+|WALLET-\\d+|GCWR-\\d+(-\\d+)?)$'
            THEN NULL
          ELSE refund_reference
        END
    WHERE id = ${id}
  `;
  return id;
}

export async function autoRefundOnCancellation(
  args: AutoRefundArgs,
  sql: Sql = getSql()
): Promise<AutoRefundOutcome> {
  const orderCoreId = Number(args.orderCoreId);
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) {
    return { triggered: false, skippedReason: "order_not_found" };
  }

  // Repair hollow legacy rows (marked completed without wallet/gateway movement).
  const hollowId = await reclaimHollowRefund(sql, orderCoreId);
  if (hollowId != null) {
    const paidAmount = await resolvePaidAmount(sql, orderCoreId);
    if (paidAmount < 0) return { triggered: false, skippedReason: "order_not_found" };
    let amount =
      typeof args.amount === "number" && Number.isFinite(args.amount) && args.amount > 0
        ? Math.round(args.amount * 100) / 100
        : paidAmount;
    if (amount === 0) return { triggered: false, skippedReason: "nothing_paid" };
    if (paidAmount > 0 && amount > paidAmount) amount = paidAmount;
    await sql`
      UPDATE order_refunds
      SET refund_amount = ${amount},
          net_refund_amount = ${amount},
          refund_reason = COALESCE(NULLIF(TRIM(refund_reason), ''), ${args.reason})
      WHERE id = ${hollowId}
    `;
    const result = await executeOrderRefund({
      refundId: hollowId,
      orderCoreId,
      refundAmount: amount,
      refundReason: args.reason,
      actor: {
        actorSystemUserId: null,
        actorEmail: args.actorEmail ?? null,
        actorName: "System",
        actorRole: args.actorRole ?? "system",
        actorIp: null,
        actorUserAgent: "auto-cancel-repair",
      },
    });
    return { triggered: true, refundId: hollowId, result };
  }

  // Idempotency: never create a second refund for an order that already has one.
  if (await hasActiveRefund(sql, orderCoreId)) {
    return { triggered: false, skippedReason: "already_refunded" };
  }

  const paidAmount = await resolvePaidAmount(sql, orderCoreId);
  if (paidAmount < 0) return { triggered: false, skippedReason: "order_not_found" };

  let amount =
    typeof args.amount === "number" && Number.isFinite(args.amount) && args.amount > 0
      ? Math.round(args.amount * 100) / 100
      : paidAmount;

  if (amount === 0) {
    // Nothing was paid (COD / unpaid) — no money to return.
    return { triggered: false, skippedReason: "nothing_paid" };
  }
  // Never refund more than the customer actually paid.
  if (paidAmount > 0 && amount > paidAmount) amount = paidAmount;

  // Razorpay rejects sub-₹1 refunds. Wallet-only credits have no such floor —
  // only enforce the minimum when some portion must go through the gateway.
  const probeSnap = await sql`
    SELECT
      p.payment_gateway AS payment_gateway,
      p.gateway_response AS gateway_response,
      po.gati_cash_applied AS pending_gati_cash
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT payment_gateway, gateway_response
      FROM orders_core_payments op
      WHERE op.order_id = c.order_id
        AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
      ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
      LIMIT 1
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT gati_cash_applied
      FROM pending_orders po
      WHERE po.finalized_order_id = c.order_id
      ORDER BY po.finalized_at DESC NULLS LAST
      LIMIT 1
    ) po ON TRUE
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const probe = probeSnap[0] as {
    payment_gateway?: unknown;
    gateway_response?: unknown;
    pending_gati_cash?: unknown;
  } | undefined;
  let gatewayLikely = false;
  if (probe?.gateway_response && typeof probe.gateway_response === "object") {
    const root = probe.gateway_response as Record<string, unknown>;
    const breakdown =
      root.breakdown && typeof root.breakdown === "object"
        ? (root.breakdown as Record<string, unknown>)
        : root;
    gatewayLikely = Number(breakdown.gatewayAmount ?? 0) > 0.005;
  }
  const gwName = String(probe?.payment_gateway ?? "").toLowerCase();
  if (!gatewayLikely) {
    gatewayLikely =
      gwName === "razorpay" || gwName === "mixed" || gwName === "upi" || gwName === "card";
  }
  if (amount < MIN_GATEWAY_REFUND && gatewayLikely) {
    if (paidAmount >= MIN_GATEWAY_REFUND) amount = MIN_GATEWAY_REFUND;
    else return { triggered: false, skippedReason: "below_gateway_minimum" };
  }

  // Create the refund ledger row the executor will fill in.
  // Mint a unique customer-facing RRN up front (RRN-{UUID}) — never RFND-{id}.
  const refundRrn = generateRefundRrn();
  let refundId: number;
  try {
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO order_refunds (
        order_id, refund_type, refund_reason, refund_amount,
        refund_fee, net_refund_amount, product_type,
        refund_status, refund_initiated_by, refund_reference
      ) VALUES (
        ${orderCoreId}, 'full'::refund_type, ${args.reason}, ${amount},
        0, ${amount}, 'order',
        'pending', 'system', ${refundRrn}
      )
      RETURNING id
    `;
    refundId = Number(inserted[0]?.id);
  } catch {
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO order_refunds (
        order_id, refund_type, refund_reason, refund_amount,
        refund_fee, net_refund_amount, product_type,
        refund_status, refund_initiated_by
      ) VALUES (
        ${orderCoreId}, 'full'::refund_type, ${args.reason}, ${amount},
        0, ${amount}, 'order',
        'pending', 'system'
      )
      RETURNING id
    `;
    refundId = Number(inserted[0]?.id);
  }
  if (!Number.isFinite(refundId) || refundId <= 0) {
    return { triggered: false, skippedReason: "order_not_found" };
  }

  const result = await executeOrderRefund({
    refundId,
    orderCoreId,
    refundAmount: amount,
    refundReason: args.reason,
    actor: {
      actorSystemUserId: null,
      actorEmail: args.actorEmail ?? null,
      actorName: "System",
      actorRole: args.actorRole ?? "system",
      actorIp: null,
      actorUserAgent: "auto-cancel",
    },
  });

  return { triggered: true, refundId, result };
}
