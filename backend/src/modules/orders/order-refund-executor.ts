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
import { syncOrderRefundCompletionMarkers } from "../../lib/order-refund-completion-sync.js";
import {
  isLegacyGatiCashTxnId,
  isModernGatiCashTxnId,
  readStoredGatiCashTxnId,
} from "../../lib/gaticash-txn-id.js";
import { ensureRefundRrn } from "../../lib/refund-rrn.js";

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

/**
 * Razorpay's SDK often throws a plain object (statusCode + error.description),
 * not an Error. `String(err)` then becomes "[object Object]" and is stored on
 * order_refunds.failure_reason — which is what the 442k FAILED rows contain.
 * Never include secrets/keys; keep the string short for the TEXT column.
 */
function serializeRefundFailure(err: unknown): string {
  const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 500);
  if (err == null) return "unknown_error";
  if (typeof err === "string") return clip(err) || "unknown_error";
  if (err instanceof Error) {
    const msg = clip(err.message);
    if (msg && msg !== "[object Object]") return msg;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const nested =
      o.error != null && typeof o.error === "object"
        ? (o.error as Record<string, unknown>)
        : null;
    const parts: string[] = [];
    const code = nested?.code ?? o.code;
    const description = nested?.description ?? o.description ?? o.message;
    const status = o.statusCode ?? o.status ?? nested?.statusCode;
    if (code != null && String(code).trim()) parts.push(String(code));
    if (description != null && String(description).trim()) parts.push(String(description));
    if (status != null && String(status).trim()) parts.push(`status=${String(status)}`);
    if (parts.length > 0) return clip(parts.join(" | "));
    try {
      const json = JSON.stringify(o);
      if (json && json !== "{}") return clip(json);
    } catch {
      /* circular */
    }
  }
  const fallback = clip(String(err));
  return fallback && fallback !== "[object Object]" ? fallback : "unserializable_error";
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
  /** GatiCash consumed at checkout (must return to wallet). */
  gatiCashUsed: number;
  /** Amount captured on the payment gateway (must return via Razorpay). */
  gatewayAmount: number;
  /** Original unique GatiCash payment txn id (GC-{UUID} or legacy). */
  gatiCashTxnId: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function numOrZero(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Read gatiCashUsed / gatewayAmount from orders_core_payments.gateway_response.breakdown. */
function parseBreakdownAmounts(gatewayResponse: unknown): {
  gatiCashUsed: number;
  gatewayAmount: number;
  settlement: string | null;
} {
  if (!gatewayResponse || typeof gatewayResponse !== "object") {
    return { gatiCashUsed: 0, gatewayAmount: 0, settlement: null };
  }
  const root = gatewayResponse as Record<string, unknown>;
  const breakdown =
    root.breakdown && typeof root.breakdown === "object"
      ? (root.breakdown as Record<string, unknown>)
      : root;
  let gatiCashUsed = Math.max(0, round2(numOrZero(breakdown.gatiCashUsed)));
  let gatewayAmount = Math.max(0, round2(numOrZero(breakdown.gatewayAmount)));
  // Mixed checkouts also stamp these at the gateway_response root.
  if (gatiCashUsed <= 0.005 && numOrZero(root.gatiCashUsed) > 0.005) {
    gatiCashUsed = round2(numOrZero(root.gatiCashUsed));
  }
  if (gatewayAmount <= 0.005 && numOrZero(root.gatewayAmount) > 0.005) {
    gatewayAmount = round2(numOrZero(root.gatewayAmount));
  }
  return {
    gatiCashUsed,
    gatewayAmount,
    settlement:
      typeof breakdown.settlement === "string"
        ? breakdown.settlement.trim().toLowerCase()
        : typeof root.settledBy === "string" && root.settledBy.trim().toLowerCase() === "mixed"
          ? "mixed"
          : null,
  };
}

function extractRazorpayPaymentId(
  transactionId: string,
  gatewayResponse: unknown
): string | null {
  if (/^pay_/.test(transactionId)) return transactionId;
  if (!gatewayResponse || typeof gatewayResponse !== "object") return null;
  const root = gatewayResponse as Record<string, unknown>;
  const candidates = [
    root.razorpayPaymentId,
    root.razorpay_payment_id,
    (root.payment as Record<string, unknown> | undefined)?.id,
  ];
  for (const candidate of candidates) {
    const id = typeof candidate === "string" ? candidate.trim() : "";
    if (/^pay_/.test(id)) return id;
  }
  return null;
}

/** Infer gateway capture when breakdown only recorded the wallet half. */
function inferGatewayAmountForMixedCheckout(args: {
  gatiCashUsed: number;
  gatewayAmount: number;
  paymentAmount: number;
  grandTotal: number;
  hasRazorpayPaymentId: boolean;
}): number {
  let gatewayAmount = args.gatewayAmount;
  if (!args.hasRazorpayPaymentId) return round2(gatewayAmount);

  if (args.gatiCashUsed > 0.005 && gatewayAmount <= 0.005) {
    if (args.paymentAmount > args.gatiCashUsed + 0.005) {
      gatewayAmount = round2(args.paymentAmount - args.gatiCashUsed);
    } else if (args.grandTotal > 0.005) {
      gatewayAmount = round2(args.grandTotal);
    } else if (args.paymentAmount > 0.005) {
      gatewayAmount = args.paymentAmount;
    }
  }

  if (
    args.gatiCashUsed > 0.005 &&
    gatewayAmount > 0.005 &&
    args.paymentAmount > 0.005 &&
    round2(args.gatiCashUsed + gatewayAmount) > round2(args.paymentAmount + 0.02)
  ) {
    const corrected = round2(Math.max(0, args.paymentAmount - args.gatiCashUsed));
    if (corrected > 0.005 && corrected < gatewayAmount) {
      gatewayAmount = corrected;
    }
  }

  return round2(gatewayAmount);
}

/**
 * Load the payment context for an order. Prefers orders_core_payments (the
 * canonical settlement source) and falls back to the orders_core.payment_method
 * column for legacy rows where a payments row wasn't written.
 *
 * Source-of-truth for split refunds is gateway_response.breakdown
 * (gatiCashUsed + gatewayAmount), with pending_orders.gati_cash_applied as fallback.
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
      p.gateway_response                AS gateway_response,
      po.gati_cash_applied              AS pending_gati_cash
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT *
      FROM orders_core_payments op
      WHERE op.order_id = c.order_id
        AND COALESCE(UPPER(op.payment_status), '') IN ('PAID','CAPTURED','SUCCESS','COMPLETED')
      ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
      LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT gati_cash_applied
      FROM pending_orders po
      WHERE po.finalized_order_id = c.order_id
      ORDER BY po.finalized_at DESC NULLS LAST
      LIMIT 1
    ) po ON true
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
  const txn =
    typeof r.transaction_id === "string" ? String(r.transaction_id).trim() : "";
  const razorpayPaymentId = extractRazorpayPaymentId(txn, r.gateway_response);

  const fromBreakdown = parseBreakdownAmounts(r.gateway_response);
  const pendingGati = Math.max(0, round2(numOrZero(r.pending_gati_cash)));
  const paymentAmount = r.payment_amount != null ? round2(numOrZero(r.payment_amount)) : 0;
  const grandTotal = round2(numOrZero(r.grand_total));

  let gatiCashUsed = fromBreakdown.gatiCashUsed;
  let gatewayAmount = fromBreakdown.gatewayAmount;

  if (gatiCashUsed <= 0.005 && pendingGati > 0.005) {
    gatiCashUsed = pendingGati;
  }

  // Infer missing half when breakdown was incomplete.
  gatewayAmount = inferGatewayAmountForMixedCheckout({
    gatiCashUsed,
    gatewayAmount,
    paymentAmount,
    grandTotal,
    hasRazorpayPaymentId: Boolean(razorpayPaymentId),
  });
  if (
    gatewayAmount <= 0.005 &&
    razorpayPaymentId &&
    gatiCashUsed <= 0.005 &&
    paymentAmount > 0.005
  ) {
    gatewayAmount = paymentAmount;
  }
  if (
    gatiCashUsed <= 0.005 &&
    !razorpayPaymentId &&
    (gwFromPayments === "gati_cash" ||
      gwFromPayments === "wallet" ||
      methodFromCore === "wallet" ||
      methodFromCore === "gati_cash" ||
      methodFromPayments === "wallet" ||
      methodFromPayments === "gati_cash")
  ) {
    // Prefer payment amount; grand_total is often 0 for 100% wallet checkouts.
    gatiCashUsed = paymentAmount > 0.005 ? paymentAmount : grandTotal;
  }

  // Prepaid / GatiCash often stamped payment_gateway=online with no pay_* id.
  if (
    gatiCashUsed <= 0.005 &&
    !razorpayPaymentId &&
    paymentAmount > 0.005 &&
    gwFromPayments !== "cod" &&
    methodFromCore !== "cash" &&
    methodFromCore !== "cod" &&
    methodFromPayments !== "cash" &&
    methodFromPayments !== "cod"
  ) {
    gatiCashUsed = paymentAmount;
  }

  gatiCashUsed = round2(gatiCashUsed);
  gatewayAmount = round2(gatewayAmount);

  // Never map bare "online" → razorpay without a pay_* capture. Prepaid wallet
  // checkouts are stamped PaymentMode=Online / Source=Wallet and have no gateway id;
  // treating them as Razorpay leaves refunds stuck (Pending RRN / never credited).
  let effectiveGateway =
    gwFromPayments ||
    (razorpayPaymentId
      ? "razorpay"
      : methodFromCore === "cash" || methodFromCore === "cod"
      ? "cod"
      : methodFromCore === "wallet" || methodFromCore === "gati_cash"
      ? "gati_cash"
      : methodFromCore === "upi" || methodFromCore === "card"
      ? "razorpay"
      : methodFromCore === "online"
      ? "online"
      : "unknown");

  if (fromBreakdown.settlement === "mixed" || (gatiCashUsed > 0.005 && gatewayAmount > 0.005)) {
    effectiveGateway = "mixed";
  } else if (gatiCashUsed > 0.005 && gatewayAmount <= 0.005) {
    effectiveGateway = "gati_cash";
  } else if (gatewayAmount > 0.005 && gatiCashUsed <= 0.005 && razorpayPaymentId) {
    effectiveGateway = "razorpay";
  } else if (
    !razorpayPaymentId &&
    (effectiveGateway === "online" ||
      effectiveGateway === "unknown" ||
      effectiveGateway === "razorpay")
  ) {
    // Wallet / prepaid "online"/mis-stamped razorpay with no pay_* → GatiCash.
    if (gatiCashUsed > 0.005 || paymentAmount > 0.005 || grandTotal > 0.005) {
      effectiveGateway = "gati_cash";
      if (gatiCashUsed <= 0.005) {
        gatiCashUsed = round2(paymentAmount > 0.005 ? paymentAmount : grandTotal);
      }
    }
  }

  const totalPaid = round2(
    Math.max(
      gatiCashUsed + gatewayAmount,
      paymentAmount,
      grandTotal
    )
  );

  const fromResp = readStoredGatiCashTxnId(
    r.gateway_response && typeof r.gateway_response === "object"
      ? (r.gateway_response as Record<string, unknown>)
      : null
  );
  let gatiCashTxnId: string | null = fromResp;
  if (
    !gatiCashTxnId &&
    txn &&
    (effectiveGateway === "gati_cash" ||
      isModernGatiCashTxnId(txn) ||
      isLegacyGatiCashTxnId(txn))
  ) {
    gatiCashTxnId = txn;
  }

  return {
    ordersCorePaymentId:
      r.orders_core_payment_id != null ? Number(r.orders_core_payment_id) : null,
    gateway: effectiveGateway,
    method: methodFromPayments || methodFromCore || "unknown",
    razorpayPaymentId,
    amount: totalPaid,
    customerId: r.customer_id != null ? Number(r.customer_id) : null,
    orderIdText: typeof r.order_id_text === "string" ? r.order_id_text : null,
    grandTotal,
    gatiCashUsed,
    gatewayAmount,
    gatiCashTxnId,
  };
}

/**
 * Decide the execution route from the ORIGINAL payment distribution.
 * Wallet → wallet only; gateway → Razorpay only; both → MIXED (never collapse to one pipe).
 */
function chooseRoute(snap: OrderPaymentSnapshot): RefundExecutionRoute {
  const looksCod =
    snap.gateway === "cod" || snap.method === "cash" || snap.method === "cod";
  // True COD with nothing paid → no money to move.
  if (
    looksCod &&
    snap.gatiCashUsed <= 0.005 &&
    !snap.gatiCashTxnId &&
    snap.amount <= 0.005
  ) {
    return "COD_NOOP";
  }

  const walletPart = snap.gatiCashUsed > 0.005 || Boolean(snap.gatiCashTxnId);
  const gatewayPart = snap.gatewayAmount > 0.005 || !!snap.razorpayPaymentId;

  if (walletPart && gatewayPart && snap.gatiCashUsed > 0.005 && snap.gatewayAmount > 0.005) {
    return "MIXED";
  }
  if (walletPart && !snap.razorpayPaymentId) return "WALLET";
  if (
    snap.gateway === "wallet" ||
    snap.gateway === "gati_cash" ||
    snap.method === "wallet" ||
    snap.method === "gati_cash"
  ) {
    return "WALLET";
  }
  if (snap.gateway === "mixed") return "MIXED";
  if (
    snap.gateway === "razorpay" ||
    snap.gateway === "upi" ||
    snap.gateway === "card" ||
    snap.gateway === "netbanking" ||
    snap.razorpayPaymentId
  ) {
    // Razorpay-stamped row that still consumed GatiCash → restore both sources.
    if (walletPart && snap.gatiCashUsed > 0.005 && snap.gatewayAmount > 0.005) {
      return "MIXED";
    }
    // Stamped razorpay/online but never captured a pay_* → money was prepaid (wallet).
    if (!snap.razorpayPaymentId) return "WALLET";
    if (walletPart && snap.gatiCashUsed > 0.005) return "MIXED";
    return "RAZORPAY";
  }
  if (snap.gateway === "online") return "WALLET";
  if (walletPart) return "WALLET";
  // Paid amount exists but no Razorpay capture → treat as wallet settlement
  // (covers legacy 100% GatiCash rows that were mis-routed to COD_NOOP).
  if (!snap.razorpayPaymentId && snap.amount > 0.005) return "WALLET";
  // Mis-stamped COD/cash but money was paid (GatiCash / prepaid) → still wallet.
  if (!snap.razorpayPaymentId && (snap.grandTotal > 0.005 || snap.amount > 0.005)) {
    return "WALLET";
  }
  return "COD_NOOP";
}

/**
 * Split a (possibly partial) refund across wallet vs gateway using the original
 * payment ratio. Full refunds use the exact original amounts.
 */
function splitRefundByOriginalSources(
  snap: OrderPaymentSnapshot,
  refundAmount: number
): { walletPart: number; razorpayPart: number } {
  const walletOrig = Math.max(0, round2(snap.gatiCashUsed));
  const gatewayOrig = Math.max(0, round2(snap.gatewayAmount));
  const totalOrig = round2(walletOrig + gatewayOrig);
  const amount = round2(Math.max(0, refundAmount));

  if (totalOrig <= 0.005) {
    if (snap.razorpayPaymentId) return { walletPart: 0, razorpayPart: amount };
    return { walletPart: amount, razorpayPart: 0 };
  }

  // Exact full refund — mirror the original distribution to the paise.
  if (Math.abs(amount - totalOrig) < 0.015) {
    return { walletPart: walletOrig, razorpayPart: gatewayOrig };
  }

  const walletPart = round2(Math.min(walletOrig, (amount * walletOrig) / totalOrig));
  const razorpayPart = round2(Math.max(0, amount - walletPart));
  return { walletPart, razorpayPart };
}

function buildRefundTimelineJson(args: {
  amount: number;
  initiatedAtIso?: string | null;
  processedAtIso?: string | null;
  completedAtIso?: string | null;
  completed: boolean;
}): string {
  const amt = ` for ₹${round2(args.amount).toFixed(2)}`;
  const initiated = args.initiatedAtIso ?? new Date().toISOString();
  const processed = args.processedAtIso ?? initiated;
  const steps: Array<{ key: string; label: string; at: string }> = [
    { key: "initiated", label: `Refund initiated${amt}`, at: initiated },
    { key: "processed", label: "Refund processed", at: processed },
  ];
  if (args.completed) {
    steps.push({
      key: "completed",
      label: "Refund completed",
      at: args.completedAtIso ?? processed,
    });
  }
  return JSON.stringify(steps);
}

async function stampRefundSourceSnapshot(
  sql: ReturnType<typeof getSql>,
  args: {
    refundId: number;
    gatiCashUsed: number;
    gatewayAmount: number;
    timelineJson: string;
    reference?: string | null;
    originalGatiCashTxnId?: string | null;
    markInitiated?: boolean;
  }
): Promise<void> {
  const rrn = ensureRefundRrn(args.reference);
  try {
    await sql`
      UPDATE order_refunds
      SET original_gati_cash_amount = COALESCE(original_gati_cash_amount, ${args.gatiCashUsed}),
          original_gateway_amount   = COALESCE(original_gateway_amount, ${args.gatewayAmount}),
          refund_timeline           = ${args.timelineJson}::text::jsonb,
          original_gati_cash_txn_id = COALESCE(
            NULLIF(TRIM(original_gati_cash_txn_id), ''),
            NULLIF(TRIM(${args.originalGatiCashTxnId ?? null}), '')
          ),
          refund_reference          = CASE
            WHEN refund_reference IS NOT NULL
              AND TRIM(refund_reference) ~* '^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
              THEN refund_reference
            ELSE ${rrn}
          END,
          initiated_at = CASE
            WHEN ${args.markInitiated === true} THEN COALESCE(initiated_at, NOW())
            ELSE initiated_at
          END
      WHERE id = ${args.refundId}
    `;
  } catch {
    /* 0483/0484/0485 columns may be absent until migration runs */
    try {
      await sql`
        UPDATE order_refunds
        SET original_gati_cash_amount = COALESCE(original_gati_cash_amount, ${args.gatiCashUsed}),
            original_gateway_amount   = COALESCE(original_gateway_amount, ${args.gatewayAmount}),
            refund_timeline           = ${args.timelineJson}::text::jsonb,
            refund_reference          = CASE
              WHEN refund_reference IS NOT NULL
                AND TRIM(refund_reference) ~* '^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
                THEN refund_reference
              WHEN ${rrn}::text IS NOT NULL AND TRIM(${rrn}::text) <> ''
                THEN ${rrn}
              ELSE refund_reference
            END,
            initiated_at = CASE
              WHEN ${args.markInitiated === true} THEN COALESCE(initiated_at, NOW())
              ELSE initiated_at
            END
        WHERE id = ${args.refundId}
      `;
    } catch {
      /* ignore */
    }
  }
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
    const priorLedger =
      prior.customer_wallet_ledger_id != null && Number(prior.customer_wallet_ledger_id) > 0
        ? Number(prior.customer_wallet_ledger_id)
        : null;
    const priorRazorpay = String(prior.razorpay_refund_id ?? "").trim() || null;
    const priorStatus = String(prior.execution_status ?? "").toUpperCase();
    // INITIATED / hollow COMPLETED / PROCESSING-without-rfnd must retry — otherwise
    // accept-timeout refunds stay "Pending RRN" forever after a mid-flight crash.
    const hollowIncomplete =
      !priorLedger &&
      !priorRazorpay &&
      args.refundAmount > 0.005 &&
      (priorStatus === "COMPLETED" ||
        priorStatus === "NOOP" ||
        priorStatus === "INITIATED" ||
        priorStatus === "PROCESSING" ||
        (priorStatus === "FAILED" &&
          /razorpay_payment_id_missing|customer_id_missing/i.test(
            String(prior.failure_reason ?? "")
          )));
    if (hollowIncomplete) {
      await sql`
        UPDATE order_refunds
        SET execution_key = NULL,
            execution_status = NULL,
            execution_route = NULL,
            failure_reason = NULL,
            failed_at = NULL,
            refund_status = 'pending',
            refund_reference = CASE
              WHEN TRIM(COALESCE(refund_reference, '')) ~* '^RFND-\\d+$' THEN NULL
              ELSE refund_reference
            END
        WHERE id = ${prior.id}
      `;
    } else {
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
  const sourceSplit = splitRefundByOriginalSources(snap, args.refundAmount);
  const initiatedIso = new Date().toISOString();

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
  await stampRefundSourceSnapshot(sql, {
    refundId: args.refundId,
    gatiCashUsed: sourceSplit.walletPart,
    gatewayAmount: sourceSplit.razorpayPart,
    originalGatiCashTxnId: snap.gatiCashTxnId,
    reference: ensureRefundRrn(null),
    timelineJson: buildRefundTimelineJson({
      amount: args.refundAmount,
      initiatedAtIso: initiatedIso,
      completed: false,
    }),
    markInitiated: true,
  });

  try {
    if (route === "COD_NOOP") {
      // Never stamp Completed for a positive refund with no money moved.
      // Mis-classified prepaid/GatiCash checkouts must credit the wallet.
      if (args.refundAmount > 0.005 && snap.customerId != null) {
        const walletAmount = args.refundAmount;
        const ledgerId = await creditCustomerWallet(sql, {
          customerId: snap.customerId,
          orderIdText: snap.orderIdText,
          refundId: args.refundId,
          amount: walletAmount,
          reason: args.refundReason,
          actor: args.actor,
          originalGatiCashTxnId: snap.gatiCashTxnId,
        });
        await sql`
          UPDATE order_refunds
          SET execution_status          = 'COMPLETED',
              execution_route           = 'WALLET',
              executed_at               = NOW(),
              completed_at              = NOW(),
              customer_wallet_ledger_id = ${ledgerId},
              customer_wallet_amount    = ${walletAmount},
              split_wallet_amount       = ${walletAmount},
              split_razorpay_amount     = 0,
              refund_status             = 'completed'
          WHERE id = ${args.refundId}
        `;
        await syncOrderRefundCompletionMarkers({
          orderCoreId: args.orderCoreId,
          refundId: args.refundId,
          kind: "completed",
          refundAmount: walletAmount,
        }, sql);
        await stampRefundSourceSnapshot(sql, {
          refundId: args.refundId,
          gatiCashUsed: walletAmount,
          gatewayAmount: 0,
          reference: ensureRefundRrn(null),
          originalGatiCashTxnId: snap.gatiCashTxnId,
          timelineJson: buildRefundTimelineJson({
            amount: walletAmount,
            initiatedAtIso: initiatedIso,
            processedAtIso: new Date().toISOString(),
            completedAtIso: new Date().toISOString(),
            completed: true,
          }),
        });
        return {
          ok: true,
          refundId: args.refundId,
          route: "WALLET",
          status: "COMPLETED",
          customerWalletLedgerId: ledgerId,
          splitWalletAmount: walletAmount,
          splitRazorpayAmount: 0,
          idempotent: false,
        };
      }

      await sql`
        UPDATE order_refunds
        SET execution_status = 'NOOP',
            completed_at     = NOW(),
            executed_at      = NOW(),
            refund_status    = 'completed'
        WHERE id = ${args.refundId}
      `;
      await syncOrderRefundCompletionMarkers({
        orderCoreId: args.orderCoreId,
        refundId: args.refundId,
        kind: "completed",
        refundAmount: 0,
      }, sql);
      return {
        ok: true,
        refundId: args.refundId,
        route,
        status: "NOOP",
        idempotent: false,
      };
    }

    if (route === "WALLET") {
      // Pure wallet route: always restore the full requested amount (already capped
      // to paid by callers). Do not clamp to a possibly-incomplete gatiCashUsed
      // snapshot — that left accept-timeout refunds under-credited / stuck.
      const walletAmount = round2(args.refundAmount);
      if (!snap.customerId) throw new Error("customer_id_missing_on_order");
      const ledgerId = await creditCustomerWallet(sql, {
        customerId: snap.customerId,
        orderIdText: snap.orderIdText,
        refundId: args.refundId,
        amount: walletAmount,
        reason: args.refundReason,
        actor: args.actor,
        originalGatiCashTxnId: snap.gatiCashTxnId,
      });
      await sql`
        UPDATE order_refunds
        SET execution_status         = 'COMPLETED',
            executed_at              = NOW(),
            completed_at             = NOW(),
            customer_wallet_ledger_id = ${ledgerId},
            customer_wallet_amount   = ${walletAmount},
            split_wallet_amount      = ${walletAmount},
            split_razorpay_amount    = 0,
            refund_status            = 'completed'
        WHERE id = ${args.refundId}
      `;
      await syncOrderRefundCompletionMarkers({
        orderCoreId: args.orderCoreId,
        refundId: args.refundId,
        kind: "completed",
        refundAmount: walletAmount,
      }, sql);
      await stampRefundSourceSnapshot(sql, {
        refundId: args.refundId,
        gatiCashUsed: walletAmount,
        gatewayAmount: 0,
        reference: ensureRefundRrn(null),
        originalGatiCashTxnId: snap.gatiCashTxnId,
        timelineJson: buildRefundTimelineJson({
          amount: walletAmount,
          initiatedAtIso: initiatedIso,
          processedAtIso: new Date().toISOString(),
          completedAtIso: new Date().toISOString(),
          completed: true,
        }),
      });
      return {
        ok: true,
        refundId: args.refundId,
        route,
        status: "COMPLETED",
        customerWalletLedgerId: ledgerId,
        splitWalletAmount: walletAmount,
        splitRazorpayAmount: 0,
        idempotent: false,
      };
    }

    if (route === "RAZORPAY") {
      if (!snap.razorpayPaymentId) {
        // Mis-stamped gateway row with no capture — restore via wallet instead of
        // leaving Pending RRN forever.
        if (!snap.customerId) throw new Error("razorpay_payment_id_missing");
        const walletAmount = round2(args.refundAmount);
        const ledgerId = await creditCustomerWallet(sql, {
          customerId: snap.customerId,
          orderIdText: snap.orderIdText,
          refundId: args.refundId,
          amount: walletAmount,
          reason: args.refundReason,
          actor: args.actor,
          originalGatiCashTxnId: snap.gatiCashTxnId,
        });
        await sql`
          UPDATE order_refunds
          SET execution_status          = 'COMPLETED',
              execution_route           = 'WALLET',
              executed_at               = NOW(),
              completed_at              = NOW(),
              customer_wallet_ledger_id = ${ledgerId},
              customer_wallet_amount    = ${walletAmount},
              split_wallet_amount       = ${walletAmount},
              split_razorpay_amount     = 0,
              refund_status             = 'completed',
              failure_reason            = NULL,
              failed_at                 = NULL
          WHERE id = ${args.refundId}
        `;
        await syncOrderRefundCompletionMarkers({
          orderCoreId: args.orderCoreId,
          refundId: args.refundId,
          kind: "completed",
          refundAmount: walletAmount,
        }, sql);
        await stampRefundSourceSnapshot(sql, {
          refundId: args.refundId,
          gatiCashUsed: walletAmount,
          gatewayAmount: 0,
          reference: ensureRefundRrn(null),
          originalGatiCashTxnId: snap.gatiCashTxnId,
          timelineJson: buildRefundTimelineJson({
            amount: walletAmount,
            initiatedAtIso: initiatedIso,
            processedAtIso: new Date().toISOString(),
            completedAtIso: new Date().toISOString(),
            completed: true,
          }),
        });
        return {
          ok: true,
          refundId: args.refundId,
          route: "WALLET",
          status: "COMPLETED",
          customerWalletLedgerId: ledgerId,
          splitWalletAmount: walletAmount,
          splitRazorpayAmount: 0,
          idempotent: false,
        };
      }
      const gatewayRefundAmount =
        snap.gatewayAmount > 0.005
          ? round2(Math.min(args.refundAmount, snap.gatewayAmount))
          : args.refundAmount;
      const refund = await createRazorpayRefund({
        paymentId: snap.razorpayPaymentId,
        amountPaise: Math.round(gatewayRefundAmount * 100),
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
            pg_refund_id        = COALESCE(NULLIF(TRIM(pg_refund_id), ''), ${refund.id}),
            razorpay_payment_id = ${snap.razorpayPaymentId},
            razorpay_response   = ${JSON.stringify(refund)}::text::jsonb,
            split_razorpay_amount = ${gatewayRefundAmount},
            split_wallet_amount   = 0,
            refund_status       = 'processing'
        WHERE id = ${args.refundId}
      `;
      await syncOrderRefundCompletionMarkers({
        orderCoreId: args.orderCoreId,
        refundId: args.refundId,
        kind: "processing",
        refundAmount: gatewayRefundAmount,
      }, sql);
      await stampRefundSourceSnapshot(sql, {
        refundId: args.refundId,
        gatiCashUsed: 0,
        gatewayAmount: gatewayRefundAmount,
        reference: ensureRefundRrn(null),
        originalGatiCashTxnId: snap.gatiCashTxnId,
        timelineJson: buildRefundTimelineJson({
          amount: gatewayRefundAmount,
          initiatedAtIso: initiatedIso,
          processedAtIso: new Date().toISOString(),
          completed: false,
        }),
      });
      return {
        ok: true,
        refundId: args.refundId,
        route,
        status: "PROCESSING",
        razorpayRefundId: refund.id,
        splitRazorpayAmount: gatewayRefundAmount,
        splitWalletAmount: 0,
        idempotent: false,
      };
    }

    // MIXED: restore wallet portion to GatiCash and gateway portion via Razorpay.
    // Never collapse a split payment into a single pipe.
    const { walletPart, razorpayPart } = splitRefundByOriginalSources(snap, args.refundAmount);
    let ledgerId: number | null = null;
    if (walletPart > 0.005) {
      ledgerId = await creditCustomerWallet(sql, {
        customerId: snap.customerId,
        orderIdText: snap.orderIdText,
        refundId: args.refundId,
        amount: walletPart,
        reason: `${args.refundReason} (GatiCash portion)`,
        actor: args.actor,
        originalGatiCashTxnId: snap.gatiCashTxnId,
      });
    }
    let refundIdRazorpay: string | null = null;
    let razorpayPayload: Record<string, unknown> | null = null;
    if (razorpayPart > 0.005) {
      if (!snap.razorpayPaymentId) {
        throw new Error("razorpay_payment_id_missing_for_mixed_refund");
      }
      const refund = await createRazorpayRefund({
        paymentId: snap.razorpayPaymentId,
        amountPaise: Math.round(razorpayPart * 100),
        receipt: `order_refund_${args.refundId}_rp`,
        notes: {
          order_core_id: String(args.orderCoreId),
          refund_id: String(args.refundId),
          split: "MIXED_RAZORPAY_PART",
          wallet_part: String(walletPart),
          razorpay_part: String(razorpayPart),
        },
      });
      refundIdRazorpay = refund.id;
      razorpayPayload = refund as unknown as Record<string, unknown>;
    }

    const mixedDone = razorpayPart <= 0.005 || !refundIdRazorpay;
    const mixedStatus = mixedDone ? "COMPLETED" : "PROCESSING";
    const mixedRefundStatus = mixedDone ? "completed" : "processing";

    if (mixedDone) {
      await sql`
        UPDATE order_refunds
        SET execution_status          = 'COMPLETED',
            executed_at               = NOW(),
            completed_at              = NOW(),
            razorpay_refund_id        = ${refundIdRazorpay},
            pg_refund_id              = COALESCE(NULLIF(TRIM(pg_refund_id), ''), ${refundIdRazorpay}),
            razorpay_payment_id       = ${snap.razorpayPaymentId},
            razorpay_response         = ${razorpayPayload ? JSON.stringify(razorpayPayload) : null}::text::jsonb,
            customer_wallet_ledger_id = ${ledgerId},
            split_razorpay_amount     = ${razorpayPart},
            split_wallet_amount       = ${walletPart},
            customer_wallet_amount    = ${walletPart},
            refund_status             = 'completed'
        WHERE id = ${args.refundId}
      `;
    } else {
      await sql`
        UPDATE order_refunds
        SET execution_status          = 'PROCESSING',
            executed_at               = NOW(),
            razorpay_refund_id        = ${refundIdRazorpay},
            pg_refund_id              = COALESCE(NULLIF(TRIM(pg_refund_id), ''), ${refundIdRazorpay}),
            razorpay_payment_id       = ${snap.razorpayPaymentId},
            razorpay_response         = ${razorpayPayload ? JSON.stringify(razorpayPayload) : null}::text::jsonb,
            customer_wallet_ledger_id = ${ledgerId},
            split_razorpay_amount     = ${razorpayPart},
            split_wallet_amount       = ${walletPart},
            customer_wallet_amount    = ${walletPart},
            refund_status             = 'processing'
        WHERE id = ${args.refundId}
      `;
    }
    await syncOrderRefundCompletionMarkers({
      orderCoreId: args.orderCoreId,
      refundId: args.refundId,
      kind: mixedDone ? "completed" : "processing",
      refundAmount: args.refundAmount,
    }, sql);
    await stampRefundSourceSnapshot(sql, {
      refundId: args.refundId,
      gatiCashUsed: walletPart,
      gatewayAmount: razorpayPart,
      reference: ensureRefundRrn(null),
      originalGatiCashTxnId: snap.gatiCashTxnId,
      timelineJson: buildRefundTimelineJson({
        amount: args.refundAmount,
        initiatedAtIso: initiatedIso,
        processedAtIso: new Date().toISOString(),
        completedAtIso: mixedDone ? new Date().toISOString() : null,
        completed: mixedDone,
      }),
    });
    return {
      ok: true,
      refundId: args.refundId,
      route,
      status: mixedStatus as RefundExecutionStatus,
      razorpayRefundId: refundIdRazorpay,
      customerWalletLedgerId: ledgerId,
      splitRazorpayAmount: razorpayPart,
      splitWalletAmount: walletPart,
      idempotent: false,
    };
  } catch (err) {
    const msg = serializeRefundFailure(err);
    await markFailed(sql, args.refundId, executionKey, msg, args.actor, route);
    await syncOrderRefundCompletionMarkers({
      orderCoreId: args.orderCoreId,
      refundId: args.refundId,
      kind: "failed",
      refundAmount: args.refundAmount,
    }, sql);
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
    originalGatiCashTxnId?: string | null;
  }
): Promise<number> {
  if (!args.customerId) throw new Error("customer_id_missing_on_order");
  const creditKey = `order_refund_${args.refundId}`;
  const walletDescription = "GatiCash Refunded - Credit Wallet";

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
      ${walletDescription},
      NULL,
      ${creditKey},
      ${JSON.stringify({
        refund_id: args.refundId,
        refund_reason: args.reason,
        actor_email: args.actor.actorEmail,
        actor_role: args.actor.actorRole,
        original_gati_cash_txn_id: args.originalGatiCashTxnId ?? null,
      })}::text::jsonb
    ) AS id
  `;
  const rowId = rows[0]?.id;
  if (rowId == null) throw new Error("customer_wallet_credit_returned_null");

  try {
    const { emitEvent } = await import("../notifications/eventBus.js");
    const balRows = await sql<{ available_balance: string | number }[]>`
      SELECT available_balance
      FROM public.customer_wallet
      WHERE customer_id = ${args.customerId}
      LIMIT 1
    `;
    const balance = Number(balRows[0]?.available_balance ?? 0);
    emitEvent("wallet.updated", {
      userId: String(args.customerId),
      role: "customer",
      direction: "CREDIT",
      amount: args.amount,
      balance: Number.isFinite(balance) ? balance : args.amount,
      reason: args.reason || "order_refund",
    });
  } catch {
    /* notification best-effort */
  }

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
    SELECT id, order_id, refund_amount
    FROM order_refunds
    WHERE razorpay_refund_id = ${args.razorpayRefundId}
      AND execution_status IN ('PROCESSING','INITIATED')
    LIMIT 1
  `;
  if (found.length === 0) return { ok: true, matched: false };
  const row = found[0] as { id: number; order_id: number; refund_amount: string | number | null };
  const refundId = Number(row.id);
  const orderCoreId = Number(row.order_id);
  const refundAmount =
    row.refund_amount != null && Number.isFinite(Number(row.refund_amount))
      ? Number(row.refund_amount)
      : null;

  await sql`
    UPDATE order_refunds
    SET execution_status  = 'COMPLETED',
        completed_at      = NOW(),
        refund_status     = 'completed',
        pg_refund_id      = COALESCE(
          NULLIF(TRIM(pg_refund_id), ''),
          NULLIF(TRIM(razorpay_refund_id), ''),
          ${args.razorpayRefundId}
        ),
        razorpay_response = COALESCE(razorpay_response, '{}'::jsonb) || ${JSON.stringify({
          confirmed_via: "webhook",
          confirmed_at: new Date().toISOString(),
          refund_status: args.refundStatus,
          razorpay_payment_id: args.razorpayPaymentId,
        })}::text::jsonb
    WHERE id = ${refundId}
  `;

  if (Number.isFinite(orderCoreId) && orderCoreId > 0) {
    await syncOrderRefundCompletionMarkers({
      orderCoreId,
      refundId,
      kind: "completed",
      refundAmount,
    }, sql);

    try {
      const { getDb } = await import("../../db/client.js");
      const { releasePlatformOfferUsagesOnRefund } = await import(
        "../billing/platformOfferUsage.service.js"
      );
      const [core] = await sql<{ order_id: string | null }[]>`
        SELECT order_id FROM orders_core WHERE id = ${orderCoreId} LIMIT 1
      `;
      await releasePlatformOfferUsagesOnRefund(
        getDb(),
        core?.order_id ?? orderCoreId
      );
    } catch {
      /* non-fatal */
    }
  }
  return { ok: true, matched: true };
}
