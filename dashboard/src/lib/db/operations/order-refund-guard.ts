/**
 * Money-safety guard for order cancellation / refund actions.
 *
 * The dashboard refund flow (POST /api/orders/[orderId]/refunds) previously
 * had NO server-side state check — an already-cancelled or already-fully-
 * refunded order could be cancelled again or refunded again straight from the
 * panel, double-moving money. This module is the single source of truth for
 * "is this cancel/refund allowed right now?".
 *
 * Two invariants are enforced:
 *   1. An order that is already cancelled cannot be cancelled again
 *      (cancel_without_refund / refund_with_cancellation).
 *   2. The sum of all non-failed refunds for an order can never exceed its
 *      grand total. A fully-refunded order accepts no further refund; a
 *      partially-refunded order accepts top-ups only up to the remainder.
 *
 * Scope: this catches the real-world case — a cancelled/refunded order that
 * still exposes the refund UI hours/days later — and every sequential retry.
 * It does NOT by itself serialize two truly-simultaneous submits (the pooled
 * connection is autocommit, so the FOR UPDATE lock is released at statement
 * end). A DB-level exclusion constraint / trigger is the follow-up for that
 * millisecond-race window; the executor's per-refund idempotency key already
 * prevents the same refund row from moving money twice.
 */

import { getSql } from "../client";

export type RefundGuardAction =
  | "cancel_without_refund"
  | "refund_with_cancellation"
  | "refund_without_cancellation";

/** Small tolerance for floating-point money comparisons (₹0.01). */
const MONEY_EPSILON = 0.01;

export interface OrderRefundGuardState {
  orderId: number;
  found: boolean;
  isCancelled: boolean;
  grandTotal: number;
  /** Sum of refund_amount across all non-failed / non-cancelled refunds. */
  alreadyRefunded: number;
  activeRefundCount: number;
  /** max(grandTotal - alreadyRefunded, 0). */
  remainingRefundable: number;
  fullyRefunded: boolean;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Load the authoritative refund/cancel state for an order: its cancellation
 * status, grand total, and the sum of all non-failed refunds already recorded.
 */
export async function loadOrderRefundGuardState(
  orderId: number
): Promise<OrderRefundGuardState> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      c.id                              AS id,
      c.grand_total                     AS grand_total,
      LOWER(COALESCE(c.status, ''))          AS status,
      LOWER(COALESCE(c.current_status, ''))  AS current_status,
      COALESCE(agg.refunded, 0)         AS already_refunded,
      COALESCE(agg.cnt, 0)              AS active_refund_count
    FROM orders_core c
    LEFT JOIN LATERAL (
      SELECT
        SUM(r.refund_amount)::numeric AS refunded,
        COUNT(*)                      AS cnt
      FROM order_refunds r
      WHERE r.order_id = c.id
        AND LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
        AND UPPER(COALESCE(r.execution_status, '')) <> 'FAILED'
    ) agg ON TRUE
    WHERE c.id = ${orderId}
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) {
    return {
      orderId,
      found: false,
      isCancelled: false,
      grandTotal: 0,
      alreadyRefunded: 0,
      activeRefundCount: 0,
      remainingRefundable: 0,
      fullyRefunded: false,
    };
  }

  const status = String(r.status ?? "");
  const currentStatus = String(r.current_status ?? "");
  const isCancelled =
    status === "cancelled" ||
    status === "canceled" ||
    currentStatus.includes("cancel");

  const grandTotal = toNum(r.grand_total);
  const alreadyRefunded = toNum(r.already_refunded);
  const remainingRefundable = Math.max(grandTotal - alreadyRefunded, 0);
  const fullyRefunded =
    grandTotal > 0 && alreadyRefunded >= grandTotal - MONEY_EPSILON;

  return {
    orderId,
    found: true,
    isCancelled,
    grandTotal,
    alreadyRefunded,
    activeRefundCount: Math.trunc(toNum(r.active_refund_count)),
    remainingRefundable,
    fullyRefunded,
  };
}

export interface RefundGuardVerdict {
  ok: boolean;
  code?: string;
  message?: string;
  state: OrderRefundGuardState;
}

/**
 * Decide whether the requested action is allowed against the loaded state.
 * Pure function — no I/O — so it is trivially unit-testable and reusable by
 * the UI to pre-disable controls.
 */
export function evaluateRefundGuard(
  state: OrderRefundGuardState,
  action: RefundGuardAction | string,
  refundAmount: number
): RefundGuardVerdict {
  if (!state.found) {
    return { ok: false, code: "order_not_found", message: "Order not found.", state };
  }

  const cancelsOrder =
    action === "cancel_without_refund" || action === "refund_with_cancellation";
  const movesRefund =
    action === "refund_with_cancellation" || action === "refund_without_cancellation";

  if (cancelsOrder && state.isCancelled) {
    return {
      ok: false,
      code: "already_cancelled",
      message: "This order is already cancelled — it cannot be cancelled again.",
      state,
    };
  }

  if (movesRefund) {
    if (state.fullyRefunded) {
      return {
        ok: false,
        code: "already_refunded",
        message: `This order is already fully refunded (₹${state.alreadyRefunded.toFixed(
          2
        )} of ₹${state.grandTotal.toFixed(2)}). No further refund is allowed.`,
        state,
      };
    }
    const amt = toNum(refundAmount);
    if (amt > 0 && amt - state.remainingRefundable > MONEY_EPSILON) {
      return {
        ok: false,
        code: "refund_exceeds_remaining",
        message: `Refund of ₹${amt.toFixed(
          2
        )} exceeds the remaining refundable amount ₹${state.remainingRefundable.toFixed(
          2
        )} (already refunded ₹${state.alreadyRefunded.toFixed(
          2
        )} of ₹${state.grandTotal.toFixed(2)}).`,
        state,
      };
    }
  }

  return { ok: true, state };
}
