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
import { syncOrderRefundCompletionMarkers } from "./order-refund-completion-sync.js";

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
  /**
   * When true, allow auto-refund even if actorRole is customer/cx.
   * Only for policy paths where the authoritative cancellation engine already
   * finalized a refundable amount (e.g. pre-accept customer cancel).
   * Does not invent amounts — still requires amount/paid > 0.
   */
  allowCustomerPreAcceptRefund?: boolean;
}

export interface AutoRefundOutcome {
  triggered: boolean;
  skippedReason?:
    | "already_refunded"
    | "prior_failed"
    | "nothing_paid"
    | "order_not_found"
    | "below_gateway_minimum"
    | "customer_cancellation";
  refundId?: number;
  result?: RefundExecutionResult;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum money already returned to the customer for this order (all settled refund rows). */
async function sumSettledRefundAmount(sql: Sql, orderCoreId: number): Promise<number> {
  const rows = await sql<{ total: string | number | null }[]>`
    SELECT COALESCE(SUM(
      CASE
        WHEN UPPER(COALESCE(execution_status, '')) = 'FAILED' THEN 0
        WHEN LOWER(COALESCE(refund_status, '')) IN ('failed', 'cancelled', 'rejected') THEN 0
        WHEN customer_wallet_ledger_id IS NOT NULL AND customer_wallet_ledger_id > 0
          THEN COALESCE(net_refund_amount, refund_amount, 0)
        WHEN NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NOT NULL
          THEN COALESCE(net_refund_amount, refund_amount, 0)
        -- COMPLETED / refunded without a payment-source id is hollow — do not
        -- treat it as money already returned (that blocked Razorpay/wallet retries).
        ELSE 0
      END
    ), 0) AS total
    FROM order_refunds
    WHERE order_id = ${orderCoreId}
  `;
  const total = Number(rows[0]?.total ?? 0);
  return Number.isFinite(total) ? round2(total) : 0;
}

function resolveRefundAmount(
  args: AutoRefundArgs,
  paidAmount: number,
  remainingCap: number
): number {
  let amount =
    typeof args.amount === "number" && Number.isFinite(args.amount) && args.amount > 0
      ? round2(args.amount)
      : remainingCap;
  if (amount <= 0.005) return 0;
  if (paidAmount > 0 && amount > paidAmount) amount = paidAmount;
  if (remainingCap > 0 && amount > remainingCap) amount = remainingCap;
  return amount;
}

/** Customer-initiated cancellations must never auto-refund. */
export function isCustomerCancellationActor(actorRole?: string | null): boolean {
  const role = String(actorRole ?? "").trim().toLowerCase();
  return role === "customer" || role === "cx";
}

/** Merchant / system / rider / admin cancels — customer gets money back. */
export function shouldAutoRefundForCancellationActor(actorRole?: string | null): boolean {
  return !isCustomerCancellationActor(actorRole);
}

/** Map cancel actor → order_refunds.refund_initiated_by enum text. */
export function refundInitiatedByFromCancelActor(actorRole?: string | null): string {
  const role = String(actorRole ?? "").trim().toLowerCase();
  if (role === "store" || role === "merchant") return "merchant";
  if (role === "rider") return "rider";
  if (role === "admin" || role === "agent" || role === "dashboard") return "agent";
  if (role === "customer" || role === "cx") return "customer";
  return "system";
}

/**
 * Amount that must move when the customer cancel UI promised a refund.
 * Shown amount is the contract; captured paid is the ceiling when known.
 */
export function resolveCustomerShownRefundAmount(input: {
  /** True when the cancel sheet promised a full refund (pre-accept / search). */
  promisedRefund: boolean;
  /** What the app displayed as "Your refund". */
  shownAmount?: number | null;
  /** Wallet + UPI/card actually captured. */
  paidAmount: number;
}): number {
  const shown = Number(input.shownAmount);
  const paid = Number(input.paidAmount);
  const shownOk = Number.isFinite(shown) && shown > 0.005;
  const paidOk = Number.isFinite(paid) && paid > 0.005;
  if (!input.promisedRefund && !shownOk) return 0;
  let amount = shownOk ? round2(shown) : paidOk ? round2(paid) : 0;
  if (amount <= 0.005 && paidOk) amount = round2(paid);
  if (paidOk && amount > paid) amount = round2(paid);
  return amount > 0.005 ? amount : 0;
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
  if (wallet || razorpay) return true;
  // Rule-engine wallet credits can complete without ledger id backfill on order_refunds.
  if (exec === "COMPLETED" || exec === "NOOP" || status === "completed" || status === "refunded") {
    const amt = Number(row.refund_amount ?? 0);
    return Number.isFinite(amt) && amt > 0.005;
  }
  return false;
}

function refundRowHasMoneyMovement(row: RefundProbeRow): boolean {
  const wallet =
    row.customer_wallet_ledger_id != null && Number(row.customer_wallet_ledger_id) > 0;
  return wallet || Boolean(trimRef(row.razorpay_refund_id));
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
  const hollowExec =
    !exec ||
    ["COMPLETED", "NOOP", "INITIATED", "PROCESSING", "PENDING", "SUCCESS"].includes(exec);
  return (
    hollowExec ||
    /^RFND-\d+$/i.test(ref) ||
    (["completed", "refunded", "pending", "processing"].includes(status) && hollowExec) ||
    (exec === "FAILED" && missingPayId)
  );
}

async function syncSubscriptionRevokeForExistingRefund(
  sql: Sql,
  orderCoreId: number,
  row: RefundProbeRow
): Promise<void> {
  const refundId = Number(row.id);
  if (!Number.isFinite(refundId) || refundId <= 0) return;
  const exec = String(row.execution_status ?? "").toUpperCase();
  const status = String(row.refund_status ?? "").toLowerCase();
  const kind =
    exec === "COMPLETED" || exec === "NOOP" || status === "completed"
      ? "completed"
      : exec === "FAILED" || status === "failed"
        ? "failed"
        : "processing";
  if (kind !== "completed") return;
  try {
    await syncOrderRefundCompletionMarkers(
      {
        orderCoreId,
        refundId,
        kind: "completed",
        refundAmount: Number(row.refund_amount ?? 0),
      },
      sql
    );
  } catch (err) {
    console.error("[auto-refund] subscription revoke on existing refund failed:", err);
  }
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
      c.payment_method AS core_payment_method,
      c.payment_status AS core_payment_status,
      p.amount      AS paid_amount,
      p.payment_gateway AS payment_gateway,
      p.payment_method AS payment_method,
      p.gateway_response AS gateway_response,
      po.gati_cash_applied AS pending_gati_cash
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT op.amount, op.payment_gateway, op.gateway_response, op.payment_method
      FROM orders_core_payments op
      WHERE op.order_id = c.order_id
        AND (
          UPPER(COALESCE(op.payment_status, '')) IN (
            'PAID','CAPTURED','SUCCESS','COMPLETED','AUTHORIZED','CAPTURE'
          )
          OR COALESCE(op.transaction_id, '') LIKE 'pay_%'
        )
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
    core_payment_method?: unknown;
    core_payment_status?: unknown;
    paid_amount?: unknown;
    payment_gateway?: unknown;
    payment_method?: unknown;
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
  const methodCore = String(r.core_payment_method ?? "").toLowerCase();
  const methodPay = String(r.payment_method ?? "").toLowerCase();
  if (gatewayAmt <= 0.005 && paidRow > 0.005 && (gw === "razorpay" || gw === "upi" || gw === "card")) {
    gatewayAmt = paidRow;
  }
  if (gatiCash <= 0.005 && paidRow > 0.005 && (gw === "gati_cash" || gw === "wallet")) {
    gatiCash = paidRow;
  }
  // Prepaid GatiCash often stamped payment_gateway=online / payment_method=wallet.
  if (
    gatiCash <= 0.005 &&
    gatewayAmt <= 0.005 &&
    paidRow > 0.005 &&
    (gw === "online" ||
      gw === "mixed" ||
      methodCore === "wallet" ||
      methodCore === "gati_cash" ||
      methodCore === "online" ||
      methodPay === "wallet" ||
      methodPay === "gati_cash" ||
      !gw)
  ) {
    gatiCash = paidRow;
  }

  const fromBreakdown = round2(gatiCash + gatewayAmt);
  if (fromBreakdown > 0.005) return fromBreakdown;
  if (paidRow > 0.005) return round2(paidRow);

  const gross = num(r.grand_total);
  const corePayStatus = String(r.core_payment_status ?? "").toUpperCase();
  const coreMarkedPaid = ["PAID", "CAPTURED", "SUCCESS", "COMPLETED"].includes(corePayStatus);
  if (coreMarkedPaid && gross > 0.005) return round2(gross);

  const methodLooksPrepaid =
    methodCore === "wallet" ||
    methodCore === "gati_cash" ||
    methodCore === "online" ||
    methodCore === "upi" ||
    methodCore === "card" ||
    methodCore === "prepaid" ||
    methodPay === "wallet" ||
    methodPay === "gati_cash" ||
    methodPay === "upi" ||
    methodPay === "card" ||
    gw === "razorpay" ||
    gw === "online" ||
    gw === "mixed" ||
    gw === "upi" ||
    gw === "card";
  if (methodLooksPrepaid && gross > 0.005) return round2(gross);

  // Never invent a COD/cash "paid" amount from grand_total — that forces hollow
  // wallet credits. Prepaid wallet without a payments row still needs grand_total.
  if (gw === "cod" || gw === "cash" || methodCore === "cod" || methodCore === "cash") return 0;
  return gross > 0.005 ? round2(gross) : 0;
}

export async function resolveOrderPaidAmountForAutoRefund(
  sql: Sql,
  orderCoreId: number
): Promise<number> {
  return resolvePaidAmount(sql, orderCoreId);
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
  if (
    !shouldAutoRefundForCancellationActor(args.actorRole) &&
    args.allowCustomerPreAcceptRefund !== true
  ) {
    return { triggered: false, skippedReason: "customer_cancellation" };
  }

  const orderCoreId = Number(args.orderCoreId);
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) {
    return { triggered: false, skippedReason: "order_not_found" };
  }

  const paidAmount = await resolvePaidAmount(sql, orderCoreId);
  if (paidAmount < 0) return { triggered: false, skippedReason: "order_not_found" };

  const latest = await loadLatestRefund(sql, orderCoreId);
  if (latest && isHollowRefundRow(latest)) {
    const hollowId = await resetHollowRefundRow(sql, Number(latest.id));
    if (hollowId == null) {
      return { triggered: false, skippedReason: "order_not_found" };
    }
    const alreadyRefundedHollow = await sumSettledRefundAmount(sql, orderCoreId);
    const remainingCapHollow =
      paidAmount > 0.005 ? Math.max(0, round2(paidAmount - alreadyRefundedHollow)) : 0;
    let amount = resolveRefundAmount(args, paidAmount, remainingCapHollow);
    if (amount === 0) return { triggered: false, skippedReason: "nothing_paid" };
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

  const alreadyRefunded = await sumSettledRefundAmount(sql, orderCoreId);
  const remainingCap =
    paidAmount > 0.005 ? Math.max(0, round2(paidAmount - alreadyRefunded)) : 0;
  if (paidAmount > 0.005 && remainingCap <= 0.005) {
    return { triggered: false, skippedReason: "already_refunded", refundId: latest ? Number(latest.id) : undefined };
  }

  if (latest && isActiveRefundRow(latest)) {
    await syncSubscriptionRevokeForExistingRefund(sql, orderCoreId, latest);
    if (remainingCap <= 0.005) {
      return { triggered: false, skippedReason: "already_refunded", refundId: Number(latest.id) };
    }
    // Partial engine refund already moved money — only top up the remainder below.
  } else if (latest && remainingCap <= 0.005) {
    return { triggered: false, skippedReason: "already_refunded", refundId: Number(latest.id) };
  }

  // A refund row already exists (often FAILED gateway). Retry execution for
  // merchant/system cancels instead of leaving the customer without money back.
  if (latest && !isActiveRefundRow(latest)) {
    const exec = String(latest.execution_status ?? "").toUpperCase();
    const status = String(latest.refund_status ?? "").toLowerCase();
    const isFailed = exec === "FAILED" || status === "failed";
    const actor = String(args.actorRole ?? "").toLowerCase();
    const merchantCancel = shouldAutoRefundForCancellationActor(actor);
    // Same retry path when customer pre-accept cancel is allowed to auto-refund.
    const canRetry =
      merchantCancel || args.allowCustomerPreAcceptRefund === true;
    const staleWithoutMovement = canRetry && !refundRowHasMoneyMovement(latest);
    const zeroAmountStale =
      canRetry && Number(latest.refund_amount ?? 0) <= 0.005 && !refundRowHasMoneyMovement(latest);
    if ((isFailed || staleWithoutMovement || zeroAmountStale) && canRetry) {
      let amount = resolveRefundAmount(args, paidAmount, remainingCap);
      if (amount === 0) return { triggered: false, skippedReason: "nothing_paid" };
      const refundId = Number(latest.id);
      await sql`
        UPDATE order_refunds
        SET refund_amount = ${amount},
            net_refund_amount = ${amount},
            refund_reason = COALESCE(NULLIF(TRIM(refund_reason), ''), ${args.reason}),
            refund_status = 'pending',
            execution_key = NULL,
            execution_status = NULL,
            execution_route = NULL,
            failure_reason = NULL,
            failed_at = NULL
        WHERE id = ${refundId}
      `;
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
          actorUserAgent: "auto-cancel-retry",
        },
      });
      return { triggered: true, refundId, result };
    }
    return { triggered: false, skippedReason: "prior_failed" };
  }

  let amount = resolveRefundAmount(args, paidAmount, remainingCap);

  if (amount === 0) {
    // Nothing was paid (COD / unpaid) — no money to return.
    return { triggered: false, skippedReason: "nothing_paid" };
  }

  // Never refund more than the customer actually paid (incl. prior partial refunds).
  if (paidAmount > 0 && amount > paidAmount) amount = paidAmount;
  if (remainingCap > 0 && amount > remainingCap) amount = remainingCap;

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
  const refundInitiatedBy = refundInitiatedByFromCancelActor(args.actorRole);
  const refundActorName =
    refundInitiatedBy === "merchant"
      ? "Store"
      : refundInitiatedBy === "rider"
        ? "Rider"
        : refundInitiatedBy === "agent"
          ? "Agent"
          : "System";
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
        'pending', ${refundInitiatedBy}, ${refundRrn}
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
        'pending', ${refundInitiatedBy}
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
      actorName: refundActorName,
      actorRole: args.actorRole ?? refundInitiatedBy,
      actorIp: null,
      actorUserAgent: "auto-cancel",
    },
  });

  return { triggered: true, refundId, result };
}
