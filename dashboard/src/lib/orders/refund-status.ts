/**
 * Single source of truth for "did this refund actually happen?".
 *
 * A row existing in order_refunds does NOT mean money moved — it may be
 * INITIATED (never executed) or FAILED (gateway rejected it). Every surface
 * that renders "Refunded", a refunded amount, or a cancellation badge must go
 * through here so the dashboard, partner site and merchant app can't disagree.
 *
 * Razorpay settles asynchronously, so PROCESSING is treated as money-committed:
 * the gateway has accepted it and the refund.processed webhook will flip it to
 * COMPLETED. Only FAILED (or a never-executed row) is "not refunded".
 */

export interface RefundStatusLike {
  refundStatus?: string | null;
  executionStatus?: string | null;
}

export type RefundOutcome = "settled" | "pending" | "failed";

const FAILED_REFUND_STATUSES = new Set(["failed", "cancelled", "rejected"]);

/**
 * Classify one refund row.
 *  - "settled" → money is committed (COMPLETED / PROCESSING / NOOP)
 *  - "failed"  → gateway or executor rejected it; no money moved
 *  - "pending" → recorded but not yet executed (INITIATED / unknown)
 */
export function classifyRefund(r: RefundStatusLike): RefundOutcome {
  const exec = String(r.executionStatus ?? "").trim().toUpperCase();
  const status = String(r.refundStatus ?? "").trim().toLowerCase();

  if (exec === "FAILED" || FAILED_REFUND_STATUSES.has(status)) return "failed";
  if (exec === "COMPLETED" || exec === "PROCESSING" || exec === "NOOP") return "settled";
  if (status === "completed" || status === "processing" || status === "refunded") {
    return "settled";
  }
  return "pending";
}

/** True when this refund actually moved (or is committed to move) money. */
export function isRefundSettled(r: RefundStatusLike): boolean {
  return classifyRefund(r) === "settled";
}

/** True when this refund definitively did not move money. */
export function isRefundFailed(r: RefundStatusLike): boolean {
  return classifyRefund(r) === "failed";
}

/** Sum of only the refunds that actually moved money. */
export function settledRefundTotal(
  rows: Array<RefundStatusLike & { refundAmount?: string | number | null }>
): number {
  return rows.reduce((sum, r) => {
    if (!isRefundSettled(r)) return sum;
    const amt = Number(r.refundAmount ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
}

/**
 * Order-level refund state for badges/labels.
 *  - "refunded"       → at least one settled refund
 *  - "refund_failed"  → no settled refund, but at least one failed attempt
 *  - "none"           → nothing to show
 */
export function orderRefundState(
  rows: Array<RefundStatusLike & { refundAmount?: string | number | null }>
): "refunded" | "refund_failed" | "none" {
  if (rows.some(isRefundSettled)) return "refunded";
  if (rows.some(isRefundFailed)) return "refund_failed";
  return "none";
}
