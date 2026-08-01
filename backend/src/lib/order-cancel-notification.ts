/**
 * Decide which customer cancel notification to send from recorded refund intent.
 */

const NO_REFUND_STATUSES = new Set([
  "no_refund",
  "not_applicable",
  "none",
  "ineligible",
]);

const REFUND_ACTIVE_STATUSES = new Set([
  "pending",
  "pending_approval",
  "processing",
  "initiated",
  "completed",
  "refunded",
  "partial",
  "partial_refund",
  "success",
]);

export function isOrderCancelRefundEligible(input: {
  refundEligible?: boolean | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
}): boolean {
  if (input.refundEligible === true) return true;
  if (input.refundEligible === false) return false;

  const amount = Number(input.refundAmount ?? 0);
  if (Number.isFinite(amount) && amount > 0.005) return true;

  const status = String(input.refundStatus ?? "")
    .trim()
    .toLowerCase();
  if (!status || NO_REFUND_STATUSES.has(status)) return false;
  return REFUND_ACTIVE_STATUSES.has(status);
}

/** Customer-facing template codes for cancel (push + notification center). */
export function resolveCustomerOrderCancelledTemplateCode(input: {
  refundEligible?: boolean | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
}): "ORDER_CANCELLED_REFUND_ELIGIBLE" | "ORDER_CANCELLED_NO_REFUND" {
  return isOrderCancelRefundEligible(input)
    ? "ORDER_CANCELLED_REFUND_ELIGIBLE"
    : "ORDER_CANCELLED_NO_REFUND";
}
