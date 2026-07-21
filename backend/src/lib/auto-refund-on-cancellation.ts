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
 * Resolve the amount to refund at 100%: the customer's captured payment for
 * this order, falling back to grand_total. Returns 0 when nothing was captured
 * (COD / unpaid) — the executor will then route COD_NOOP.
 */
async function resolvePaidAmount(sql: Sql, orderCoreId: number): Promise<number> {
  const rows = await sql`
    SELECT
      c.grand_total AS grand_total,
      p.amount      AS paid_amount
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT op.amount
      FROM orders_core_payments op
      WHERE op.order_id = c.order_id
        AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
      ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
      LIMIT 1
    ) p ON TRUE
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const r = rows[0] as { grand_total?: unknown; paid_amount?: unknown } | undefined;
  if (!r) return -1; // signal not found
  const paid = r.paid_amount != null ? Number(r.paid_amount) : NaN;
  if (Number.isFinite(paid) && paid > 0) return Math.round(paid * 100) / 100;
  const gross = Number(r.grand_total ?? 0);
  return Number.isFinite(gross) && gross > 0 ? Math.round(gross * 100) / 100 : 0;
}

/** True when this order already has a non-failed refund (any prior attempt that moved / is moving money). */
async function hasActiveRefund(sql: Sql, orderCoreId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM order_refunds
    WHERE order_id = ${orderCoreId}
      AND UPPER(COALESCE(execution_status, '')) <> 'FAILED'
      AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function autoRefundOnCancellation(
  args: AutoRefundArgs,
  sql: Sql = getSql()
): Promise<AutoRefundOutcome> {
  const orderCoreId = Number(args.orderCoreId);
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) {
    return { triggered: false, skippedReason: "order_not_found" };
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
  if (amount < MIN_GATEWAY_REFUND) {
    // Razorpay rejects sub-₹1 refunds (they come back FAILED). Lift to the
    // minimum when the customer paid at least that much; otherwise there is
    // nothing the gateway will accept — skip and leave it for ops.
    if (paidAmount >= MIN_GATEWAY_REFUND) amount = MIN_GATEWAY_REFUND;
    else return { triggered: false, skippedReason: "below_gateway_minimum" };
  }

  // Create the refund ledger row the executor will fill in.
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
  const refundId = Number(inserted[0]?.id);
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
