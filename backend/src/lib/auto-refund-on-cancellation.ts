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
 *  - Idempotent: if a refund row already exists for the order, it does not
 *    insert another (so re-running the cancel cron / double webhooks can't
 *    double-pay or explode order_refunds with duplicate FAILED rows).
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
    | "prior_failed"
    | "nothing_paid"
    | "order_not_found"
    | "below_gateway_minimum";
  refundId?: number;
  result?: RefundExecutionResult;
}

type RefundProbeRow = {
  id: number;
  execution_status: string | null;
  refund_status: string | null;
  customer_wallet_ledger_id: number | null;
  razorpay_refund_id: string | null;
  refund_amount: unknown;
  failure_reason: string | null;
  refund_reference: string | null;
};

function trimRef(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function isActiveRefundRow(row: RefundProbeRow): boolean {
  const exec = String(row.execution_status ?? "").toUpperCase();
  const status = String(row.refund_status ?? "").toLowerCase();
  if (exec === "FAILED") return false;
  if (status === "failed" || status === "cancelled" || status === "rejected") return false;
  const wallet =
    row.customer_wallet_ledger_id != null && Number(row.customer_wallet_ledger_id) > 0;
  const razorpay = Boolean(trimRef(row.razorpay_refund_id));
  return wallet || razorpay || exec === "PROCESSING";
}

function isHollowRefundRow(row: RefundProbeRow): boolean {
  const wallet =
    row.customer_wallet_ledger_id != null && Number(row.customer_wallet_ledger_id) > 0;
  if (wallet) return false;
  if (trimRef(row.razorpay_refund_id)) return false;
  const amount = Number(row.refund_amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  const status = String(row.refund_status ?? "").toLowerCase();
  const exec = String(row.execution_status ?? "").toUpperCase();
  const failure = String(row.failure_reason ?? "");
  const missingPayId = /razorpay_payment_id_missing/i.test(failure);
  const statusOk =
    !["failed", "cancelled", "rejected"].includes(status) || (exec === "FAILED" && missingPayId);
  if (!statusOk) return false;

  const ref = String(row.refund_reference ?? "").trim();
  return (
    ["COMPLETED", "NOOP", "INITIATED", "PROCESSING"].includes(exec) ||
    /^RFND-\d+$/i.test(ref) ||
    (["completed", "refunded", "pending"].includes(status) &&
      (!exec || ["COMPLETED", "NOOP", "INITIATED", "PROCESSING"].includes(exec))) ||
    (exec === "FAILED" && missingPayId)
  );
}

/** Latest refund row for an order — index-friendly top-N, never a created_at walk. */
async function loadLatestRefund(
  sql: Sql,
  orderCoreId: number
): Promise<RefundProbeRow | null> {
  const rows = await sql<RefundProbeRow[]>`
    SELECT
      id,
      execution_status,
      refund_status,
      customer_wallet_ledger_id,
      razorpay_refund_id,
      refund_amount,
      failure_reason,
      refund_reference
    FROM order_refunds
    WHERE order_id = ${orderCoreId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
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

/**
 * Clear the execution lock on a known hollow row so executeOrderRefund can
 * restore funds. Updates by primary key only — never scans created_at.
 */
async function resetHollowRefundRow(sql: Sql, refundId: number): Promise<number | null> {
  if (!Number.isFinite(refundId) || refundId <= 0) return null;
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
    WHERE id = ${refundId}
  `;
  return refundId;
}

export async function autoRefundOnCancellation(
  args: AutoRefundArgs,
  sql: Sql = getSql()
): Promise<AutoRefundOutcome> {
  const orderCoreId = Number(args.orderCoreId);
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) {
    return { triggered: false, skippedReason: "order_not_found" };
  }

  // One index probe for the latest row. Do not walk created_at or seq-scan
  // order_refunds — that was the Disk I/O storm on duplicate FAILED rows.
  const latest = await loadLatestRefund(sql, orderCoreId);
  if (latest && isHollowRefundRow(latest)) {
    const hollowId = await resetHollowRefundRow(sql, Number(latest.id));
    if (hollowId == null) {
      return { triggered: false, skippedReason: "order_not_found" };
    }
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

  if (latest && isActiveRefundRow(latest)) {
    return { triggered: false, skippedReason: "already_refunded" };
  }

  // A refund row already exists (almost always FAILED gateway). Inserting
  // another row was creating ~88k duplicates per stuck accept-timeout order.
  // Retry remains available via /v1/internal/orders/:id/refund/execute on the
  // existing row; this path must not mint a new financial record.
  if (latest) {
    return { triggered: false, skippedReason: "prior_failed" };
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
