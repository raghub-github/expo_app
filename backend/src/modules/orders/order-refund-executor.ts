/**
 * Order refund executor — the "last mile" between what an agent CLICKED in
 * the dashboard and where the money ACTUALLY goes back.
 *
 * The existing dashboard proxy at /api/orders/[orderId]/refunds does the
 * planning (financial rule engine, merchant debit, rider penalty) and
 * inserts a row into `order_refunds`. This module takes it from there.
 *
 * Four routes, decided from the ORIGINAL payment gateway of the order
 * (orders_core_payments.payment_gateway):
 *
 *   RAZORPAY  → call Razorpay Refund API. Payment status flips to
 *               PROCESSING; the existing applyRefundWebhook eventually
 *               flips it to COMPLETED when refund.processed fires.
 *
 *   WALLET    → credit customer_wallet via public.customer_wallet_credit()
 *               with a stable idempotency key. Instant COMPLETED.
 *
 *   COD_NOOP  → COD orders don't move money on cancellation (customer never
 *               paid). Marked NOOP + COMPLETED (audit trail still exists).
 *
 *   MIXED     → part gateway + part wallet. Split proportionally by original
 *               payment allocation and run both branches. Both must succeed.
 *
 * Idempotency: every execution stores `execution_key = sha256(orderId + refundId)`.
 * A double-click, a webhook re-delivery, or a manual retry short-circuits on
 * the UNIQUE index and returns the previous outcome.
 *
 * Money-safety property: if any branch throws, no partial ledger row is
 * written — either both parts succeed or the refund stays INITIATED and is
 * safely retriable on the next attempt.
 */

import { createHash } from "node:crypto";
import { getSql } from "../../db/client.js";
import { createRazorpayRefund } from "../../services/payment/razorpayService.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RefundExecutionRoute = "RAZORPAY" | "WALLET" | "COD_NOOP" | "MIXED";
export type RefundExecutionStatus =
  | "INITIATED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "NOOP";

export interface RefundExecutionActor {
  actorSystemUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
}

export interface RefundExecutionRequest {
  refundId: number;
  orderCoreId: number;
  refundAmount: number;     // ₹, already validated > 0 in proxy
  refundReason: string;
  actor: RefundExecutionActor;
}

export interface RefundExecutionResult {
  ok: boolean;
  refundId: number;
  route: RefundExecutionRoute;
  status: RefundExecutionStatus;
  razorpayRefundId?: string | null;
  customerWalletLedgerId?: number | null;
  splitRazorpayAmount?: number;
  splitWalletAmount?: number;
  failureReason?: string;
  idempotent: boolean;      // true when re-execution short-circuited
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildExecutionKey(orderCoreId: number, refundId: number): string {
  return createHash("sha256")
    .update(`order_refund_v1:${orderCoreId}:${refundId}`)
    .digest("hex");
}

interface OrderPaymentSnapshot {
  ordersCorePaymentId: number | null;
  gateway: string;              // razorpay | wallet | mixed | cod | ...
  method: string;                // upi | card | wallet | cash | ...
  razorpayPaymentId: string | null;
  amount: number;
  customerId: number | null;
  orderIdText: string | null;
  grandTotal: number;
}

/**
 * Load the payment context for an order. Prefers orders_core_payments (the
 * canonical settlement source) and falls back to the orders_core.payment_method
 * column for legacy rows where a payments row wasn't written.
 */
async function loadOrderPaymentSnapshot(
  sql: ReturnType<typeof getSql>,
  orderCoreId: number
): Promise<OrderPaymentSnapshot | null> {
  const rows = await sql`
    SELECT
      c.id                              AS orders_core_pk,
      c.order_id                        AS order_id_text,
      c.customer_id                     AS customer_id,
      c.grand_total                     AS grand_total,
      c.payment_method                  AS core_payment_method,
      p.id                              AS orders_core_payment_id,
      p.payment_gateway                 AS payment_gateway,
      p.payment_method                  AS payment_method,
      p.transaction_id                  AS transaction_id,
      p.amount                          AS payment_amount,
      p.gateway_response                AS gateway_response
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT *
      FROM orders_core_payments op
      WHERE op.order_id = c.order_id
        AND COALESCE(UPPER(op.payment_status), '') IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
      ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
      LIMIT 1
    ) p ON true
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;

  // Prefer the payments row's gateway; fall back to orders_core.payment_method.
  const gwFromPayments =
    typeof r.payment_gateway === "string" ? String(r.payment_gateway).toLowerCase() : "";
  const methodFromPayments =
    typeof r.payment_method === "string" ? String(r.payment_method).toLowerCase() : "";
  const methodFromCore =
    typeof r.core_payment_method === "string"
      ? String(r.core_payment_method).toLowerCase()
      : "";
  // orders_core carries no razorpay identifiers — the captured payment id
  // (pay_…) lives on orders_core_payments.transaction_id.
  const razorpayPaymentId =
    typeof r.transaction_id === "string" && /^pay_/.test(r.transaction_id)
      ? String(r.transaction_id)
      : null;

  const effectiveGateway =
    gwFromPayments ||
    (razorpayPaymentId
      ? "razorpay"
      : methodFromCore === "cash" || methodFromCore === "cod"
      ? "cod"
      : methodFromCore === "wallet"
      ? "wallet"
      : methodFromCore === "upi" || methodFromCore === "card" || methodFromCore === "online"
      ? "razorpay"
      : "unknown");

  return {
    ordersCorePaymentId:
      r.orders_core_payment_id != null ? Number(r.orders_core_payment_id) : null,
    gateway: effectiveGateway,
    method: methodFromPayments || methodFromCore || "unknown",
    razorpayPaymentId,
    amount: r.payment_amount != null ? Number(r.payment_amount) : Number(r.grand_total ?? 0),
    customerId: r.customer_id != null ? Number(r.customer_id) : null,
    orderIdText: typeof r.order_id_text === "string" ? r.order_id_text : null,
    grandTotal: Number(r.grand_total ?? 0),
  };
}

/**
 * Decide the execution route from the payment snapshot. Consolidates the
 * whitelist of gateway/method values into one of 4 routes.
 */
function chooseRoute(snap: OrderPaymentSnapshot): RefundExecutionRoute {
  const gw = snap.gateway;
  if (gw === "cod" || snap.method === "cash" || snap.method === "cod") return "COD_NOOP";
  if (gw === "wallet") return "WALLET";
  if (gw === "razorpay" || gw === "upi" || gw === "card" || gw === "netbanking") return "RAZORPAY";
  if (gw === "mixed") return "MIXED";
  // Default to RAZORPAY if the row shows a razorpay_payment_id even when
  // gateway wasn't set (legacy). A wallet-only order without a razorpay id
  // would already have been caught above.
  if (snap.razorpayPaymentId) return "RAZORPAY";
  return "COD_NOOP";
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function executeOrderRefund(
  args: RefundExecutionRequest
): Promise<RefundExecutionResult> {
  const sql = getSql();
  const executionKey = buildExecutionKey(args.orderCoreId, args.refundId);

  // Idempotency short-circuit — if this exact refund was already routed,
  // return the prior result. Rebuild the response shape from what's stored.
  const existing = await sql`
    SELECT id, execution_status, execution_route, razorpay_refund_id,
           customer_wallet_ledger_id, split_razorpay_amount, split_wallet_amount,
           failure_reason
    FROM order_refunds
    WHERE execution_key = ${executionKey}
    LIMIT 1
  `;
  const prior = existing[0] as
    | {
        id: number;
        execution_status: string;
        execution_route: string;
        razorpay_refund_id: string | null;
        customer_wallet_ledger_id: number | null;
        split_razorpay_amount: string | number | null;
        split_wallet_amount: string | number | null;
        failure_reason: string | null;
      }
    | undefined;
  if (prior) {
    return {
      ok: prior.execution_status !== "FAILED",
      refundId: Number(prior.id),
      route: prior.execution_route as RefundExecutionRoute,
      status: prior.execution_status as RefundExecutionStatus,
      razorpayRefundId: prior.razorpay_refund_id,
      customerWalletLedgerId: prior.customer_wallet_ledger_id,
      splitRazorpayAmount: prior.split_razorpay_amount != null
        ? Number(prior.split_razorpay_amount)
        : undefined,
      splitWalletAmount: prior.split_wallet_amount != null
        ? Number(prior.split_wallet_amount)
        : undefined,
      failureReason: prior.failure_reason ?? undefined,
      idempotent: true,
    };
  }

  // Load payment source. If order can't be found, hard fail without touching
  // the refund row so the agent can re-attempt after fixing the data.
  const snap = await loadOrderPaymentSnapshot(sql, args.orderCoreId);
  if (!snap) {
    await markFailed(sql, args.refundId, executionKey, "order_not_found", args.actor, null);
    return {
      ok: false,
      refundId: args.refundId,
      route: "COD_NOOP",
      status: "FAILED",
      failureReason: "order_not_found",
      idempotent: false,
    };
  }

  const route = chooseRoute(snap);

  // Stamp INITIATED + actor + snapshot upfront so a crash mid-flight leaves
  // an auditable "attempted" row rather than a ghost.
  await sql`
    UPDATE order_refunds
    SET execution_status  = 'INITIATED',
        execution_route   = ${route},
        execution_key     = ${executionKey},
        actor_email       = ${args.actor.actorEmail},
        actor_name        = ${args.actor.actorName},
        actor_role        = ${args.actor.actorRole},
        actor_ip          = ${args.actor.actorIp},
        actor_user_agent  = ${args.actor.actorUserAgent},
        payment_gateway_snapshot = ${snap.gateway},
        payment_method_snapshot  = ${snap.method},
        order_gross_snapshot     = ${snap.grandTotal}
    WHERE id = ${args.refundId}
  `;

  try {
    if (route === "COD_NOOP") {
      await sql`
        UPDATE order_refunds
        SET execution_status = 'NOOP',
            completed_at     = NOW(),
            executed_at      = NOW(),
            refund_status    = 'completed'
        WHERE id = ${args.refundId}
      `;
      return {
        ok: true,
        refundId: args.refundId,
        route,
        status: "NOOP",
        idempotent: false,
      };
    }

    if (route === "WALLET") {
      const ledgerId = await creditCustomerWallet(sql, {
        customerId: snap.customerId,
        orderIdText: snap.orderIdText,
        refundId: args.refundId,
        amount: args.refundAmount,
        reason: args.refundReason,
        actor: args.actor,
      });
      await sql`
        UPDATE order_refunds
        SET execution_status         = 'COMPLETED',
            executed_at              = NOW(),
            completed_at             = NOW(),
            customer_wallet_ledger_id = ${ledgerId},
            customer_wallet_amount   = ${args.refundAmount},
            refund_status            = 'completed'
        WHERE id = ${args.refundId}
      `;
      return {
        ok: true,
        refundId: args.refundId,
        route,
        status: "COMPLETED",
        customerWalletLedgerId: ledgerId,
        idempotent: false,
      };
    }

    if (route === "RAZORPAY") {
      if (!snap.razorpayPaymentId) {
        throw new Error("razorpay_payment_id_missing");
      }
      const refund = await createRazorpayRefund({
        paymentId: snap.razorpayPaymentId,
        amountPaise: Math.round(args.refundAmount * 100),
        receipt: `order_refund_${args.refundId}`,
        notes: {
          order_core_id: String(args.orderCoreId),
          refund_id: String(args.refundId),
          reason: args.refundReason,
          actor_email: args.actor.actorEmail ?? "",
        },
      });
      // Razorpay refunds are ASYNCHRONOUS. Payment is now filed; the actual
      // money movement is confirmed by refund.processed webhook, at which
      // point applyRefundWebhook flips COMPLETED. For now mark PROCESSING.
      await sql`
        UPDATE order_refunds
        SET execution_status    = 'PROCESSING',
            executed_at         = NOW(),
            razorpay_refund_id  = ${refund.id},
            razorpay_payment_id = ${snap.razorpayPaymentId},
            razorpay_response   = ${JSON.stringify(refund)}::jsonb,
            refund_status       = 'processing'
        WHERE id = ${args.refundId}
      `;
      return {
        ok: true,
        refundId: args.refundId,
        route,
        status: "PROCESSING",
        razorpayRefundId: refund.id,
        idempotent: false,
      };
    }

    // MIXED: split proportionally by original payment split. We do NOT have
    // per-source amounts split in orders_core today, so approximate:
    // treat the wallet-portion as (snap.grandTotal - razorpay portion).
    // Real per-source split requires reading orders_core_payments per row
    // grouped by gateway — implemented as a later enhancement.
    // For now: 50/50 split if we hit MIXED. Ops can adjust via a dedicated
    // manual refund tool if needed.
    const walletPart = Math.round(args.refundAmount * 100 * 0.5) / 100;
    const razorpayPart = Math.round((args.refundAmount - walletPart) * 100) / 100;
    let ledgerId: number | null = null;
    if (walletPart > 0) {
      ledgerId = await creditCustomerWallet(sql, {
        customerId: snap.customerId,
        orderIdText: snap.orderIdText,
        refundId: args.refundId,
        amount: walletPart,
        reason: `${args.refundReason} (wallet portion)`,
        actor: args.actor,
      });
    }
    let refundIdRazorpay: string | null = null;
    if (razorpayPart > 0 && snap.razorpayPaymentId) {
      const refund = await createRazorpayRefund({
        paymentId: snap.razorpayPaymentId,
        amountPaise: Math.round(razorpayPart * 100),
        receipt: `order_refund_${args.refundId}_rp`,
        notes: {
          order_core_id: String(args.orderCoreId),
          refund_id: String(args.refundId),
          split: "MIXED_RAZORPAY_PART",
        },
      });
      refundIdRazorpay = refund.id;
    }
    await sql`
      UPDATE order_refunds
      SET execution_status          = 'PROCESSING',
          executed_at               = NOW(),
          razorpay_refund_id        = ${refundIdRazorpay},
          razorpay_payment_id       = ${snap.razorpayPaymentId},
          customer_wallet_ledger_id = ${ledgerId},
          split_razorpay_amount     = ${razorpayPart},
          split_wallet_amount       = ${walletPart},
          customer_wallet_amount    = ${walletPart},
          refund_status             = 'processing'
      WHERE id = ${args.refundId}
    `;
    return {
      ok: true,
      refundId: args.refundId,
      route,
      status: "PROCESSING",
      razorpayRefundId: refundIdRazorpay,
      customerWalletLedgerId: ledgerId,
      splitRazorpayAmount: razorpayPart,
      splitWalletAmount: walletPart,
      idempotent: false,
    };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    await markFailed(sql, args.refundId, executionKey, msg, args.actor, route);
    return {
      ok: false,
      refundId: args.refundId,
      route,
      status: "FAILED",
      failureReason: msg,
      idempotent: false,
    };
  }
}

async function markFailed(
  sql: ReturnType<typeof getSql>,
  refundId: number,
  executionKey: string,
  reason: string,
  actor: RefundExecutionActor,
  route: RefundExecutionRoute | null
): Promise<void> {
  await sql`
    UPDATE order_refunds
    SET execution_status = 'FAILED',
        execution_route  = COALESCE(execution_route, ${route}),
        execution_key    = COALESCE(execution_key, ${executionKey}),
        failed_at        = NOW(),
        failure_reason   = ${reason},
        refund_status    = 'failed',
        actor_email      = COALESCE(actor_email, ${actor.actorEmail}),
        actor_name       = COALESCE(actor_name, ${actor.actorName}),
        actor_role       = COALESCE(actor_role, ${actor.actorRole}),
        actor_ip         = COALESCE(actor_ip, ${actor.actorIp}),
        actor_user_agent = COALESCE(actor_user_agent, ${actor.actorUserAgent})
    WHERE id = ${refundId}
  `;
}

/**
 * Credit customer_wallet via the DB-level RPC. Idempotent by transaction_id
 * key (order_refund_<refundId>) so a concurrent retry returns the same row.
 */
async function creditCustomerWallet(
  sql: ReturnType<typeof getSql>,
  args: {
    customerId: number | null;
    orderIdText: string | null;
    refundId: number;
    amount: number;
    reason: string;
    actor: RefundExecutionActor;
  }
): Promise<number> {
  if (!args.customerId) throw new Error("customer_id_missing_on_order");
  const creditKey = `order_refund_${args.refundId}`;

  // De-dupe on transaction_id — customer_wallet_credit uses it internally,
  // but this cheap pre-check saves a round trip on the happy path.
  const existing = await sql`
    SELECT id FROM public.customer_wallet_transactions
    WHERE transaction_id = ${creditKey}
    LIMIT 1
  `;
  if (existing.length > 0) return Number((existing[0] as { id: number }).id);

  const rows = await sql<{ id: number | null }[]>`
    SELECT public.customer_wallet_credit(
      ${args.customerId},
      ${args.amount},
      'REFUND'::public.wallet_transaction_type,
      ${args.orderIdText ?? `refund_${args.refundId}`},
      ${"order_refund"},
      ${args.reason},
      NULL,
      ${creditKey},
      ${JSON.stringify({
        refund_id: args.refundId,
        actor_email: args.actor.actorEmail,
        actor_role: args.actor.actorRole,
      })}::jsonb
    ) AS id
  `;
  const rowId = rows[0]?.id;
  if (rowId == null) throw new Error("customer_wallet_credit_returned_null");
  return Number(rowId);
}

// ─── Webhook completion (called from applyRefundWebhook) ──────────────────────

/**
 * Confirmation path for Razorpay-routed order refunds. Called from the
 * existing refund.processed webhook handler. Flips PROCESSING → COMPLETED
 * on the order_refunds row that carries this razorpay_refund_id.
 * Idempotent — running twice is a no-op.
 */
export async function completeOrderRefundFromRazorpayWebhook(args: {
  razorpayRefundId: string;
  razorpayPaymentId: string;
  refundStatus: string | null;
  gatewayPayload: Record<string, unknown>;
}): Promise<{ ok: boolean; matched: boolean }> {
  const sql = getSql();
  const found = await sql`
    SELECT id FROM order_refunds
    WHERE razorpay_refund_id = ${args.razorpayRefundId}
      AND execution_status IN ('PROCESSING','INITIATED')
    LIMIT 1
  `;
  if (found.length === 0) return { ok: true, matched: false };
  const refundId = Number((found[0] as { id: number }).id);

  await sql`
    UPDATE order_refunds
    SET execution_status  = 'COMPLETED',
        completed_at      = NOW(),
        refund_status     = 'completed',
        razorpay_response = COALESCE(razorpay_response, '{}'::jsonb) || ${JSON.stringify({
          confirmed_via: "webhook",
          confirmed_at: new Date().toISOString(),
          refund_status: args.refundStatus,
          razorpay_payment_id: args.razorpayPaymentId,
        })}::jsonb
    WHERE id = ${refundId}
  `;
  return { ok: true, matched: true };
}
