/** Human labels for super-admin cancellation payment rules UI. */
export const PAYMENT_MILESTONE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "ORDER_CREATED", label: "Order placed (pre-accept)", hint: "Customer/merchant cancel before restaurant accepts" },
  { value: "ORDER_ACCEPTED", label: "Accepted, not preparing", hint: "Cancel right after accept" },
  { value: "MERCHANT_PREPARING", label: "Merchant preparing (pre-pickup)", hint: "Food being prepared, rider may not be assigned" },
  { value: "RIDER_ASSIGNED", label: "Rider assigned (pre-pickup)", hint: "Rider assigned but not picked up yet" },
  { value: "OUT_FOR_DELIVERY", label: "Post-pickup / out for delivery", hint: "Rider picked up — cancel during delivery" },
  { value: "DELIVERED", label: "Delivered (normal pay)", hint: "Settlement on deliver — not a cancel rule" },
  { value: "CANCELLED_AFTER_DELIVERED", label: "Cancelled after delivered", hint: "Refund/reversal after order was delivered" },
  { value: "PRE_PICKUP_CANCELLED", label: "Pre-pickup cancel (any party)", hint: "Shorthand: before rider pickup" },
  { value: "POST_PICKUP_CANCELLED", label: "Post-pickup cancel (any party)", hint: "Shorthand: after pickup, before/at delivery" },
  { value: "FAILED_DELIVERY", label: "Failed delivery / RTO", hint: "Could not complete delivery" },
  { value: "CUSTOMER_CANCELLED", label: "Customer fault (generic)", hint: "Matches customer as canceller" },
  { value: "MERCHANT_CANCELLED", label: "Merchant fault (generic)", hint: "Restaurant reject/cancel" },
  { value: "RIDER_CANCELLED", label: "Rider fault (generic)", hint: "Rider-side cancel" },
  { value: "ADMIN_CANCELLED", label: "Admin / CX cancel", hint: "Dashboard agent cancelled" },
  { value: "SYSTEM_CANCELLED", label: "System / timeout", hint: "Auto-cancel, SLA breach" },
];

export const PAYMENT_CANCELLED_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any party (fallback)" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "MERCHANT", label: "Merchant / restaurant" },
  { value: "RIDER", label: "Rider" },
  { value: "ADMIN", label: "Admin / CX" },
  { value: "SYSTEM", label: "System / auto" },
  { value: "PLATFORM", label: "Platform" },
];

export const CUSTOMER_REFUND_OPTIONS = [
  { value: "NONE", label: "No refund" },
  { value: "FULL", label: "Full refund" },
  { value: "PARTIAL", label: "Partial refund" },
  { value: "PLATFORM_POLICY", label: "Use % below" },
];

export function describeCancellationRule(row: Record<string, unknown>): string {
  const milestone = PAYMENT_MILESTONE_OPTIONS.find((m) => m.value === row.order_milestone)?.label
    ?? String(row.order_milestone);
  const by = row.cancelled_by
    ? PAYMENT_CANCELLED_BY_OPTIONS.find((c) => c.value === row.cancelled_by)?.label
    : "any party";
  return `${milestone} · ${by}`;
}
