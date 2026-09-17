/**
 * Admin "Cancel without refund" must never trip auto-refund repair.
 * Manual "Refund without cancellation" later remains allowed (separate action).
 */

export function isIntentionalNoRefundCancel(input: {
  refundStatus?: string | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  // Bare refund_status=`no_refund` is NOT intentional — the financial rule
  // engine stamps that for auto-cancels that still must refund the customer.
  // Only explicit admin "Cancel without refund" signals skip auto-refund.
  const code = String(input.reasonCode ?? "").trim().toLowerCase();
  if (
    code === "cancelled_without_refund" ||
    code === "cancel_without_refund"
  ) {
    return true;
  }

  const meta = input.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return false;
  }

  if (
    meta.skipAutoRefund === true ||
    String(meta.skipAutoRefund ?? "").trim().toLowerCase() === "true"
  ) {
    return true;
  }

  const refundType = String(meta.refundType ?? meta.refundTypeUI ?? "")
    .trim()
    .toLowerCase();
  return refundType === "cancel_without_refund";
}
