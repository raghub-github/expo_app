/** Person ride terminal status is shown as "Completed"; food/parcel stay "Delivered". */
export function isPersonRideOrderType(orderType?: string | null): boolean {
  const t = String(orderType ?? "").trim().toLowerCase();
  return t === "person_ride" || t === "ride";
}

export type RiderDashboardOrderStatusInput = {
  status: string | null | undefined;
  orderType?: string | null;
  riderAssignmentStatus?: string | null;
  riderRideUnassigned?: boolean;
};

const RIDER_ASSIGNMENT_ENDED = new Set(["cancelled", "unassigned", "rejected"]);

/** Raw orders_core status → title case (Delivered, Assigned, …). */
export function formatRiderOrderStatusDisplayLabel(
  status: string | null | undefined,
  orderType?: string | null
): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  const key = raw.toLowerCase();
  if (key === "delivered" && isPersonRideOrderType(orderType)) {
    return "Completed";
  }
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Rider dashboard recent orders:
 * - Order cancelled/failed → "Cancelled"
 * - Rider assignment ended (cancel/unassign/reject) → "Assignment Cancelled"
 * - Otherwise → normal status label
 */
export function resolveRiderDashboardOrderStatusLabel(
  input: RiderDashboardOrderStatusInput
): string {
  const orderStatus = String(input.status ?? "").trim().toLowerCase();

  if (orderStatus === "cancelled" || orderStatus === "failed") {
    return "Cancelled";
  }

  if (input.riderRideUnassigned) {
    return "Assignment Cancelled";
  }

  const assignSt = String(input.riderAssignmentStatus ?? "").trim().toLowerCase();
  if (RIDER_ASSIGNMENT_ENDED.has(assignSt)) {
    return "Assignment Cancelled";
  }

  return formatRiderOrderStatusDisplayLabel(input.status, input.orderType);
}

/** Badge color key for OrderStatusBadge. */
export function resolveRiderDashboardOrderStatusKey(
  input: RiderDashboardOrderStatusInput
): string {
  const label = resolveRiderDashboardOrderStatusLabel(input);
  if (label === "Cancelled") return "cancelled";
  if (label === "Assignment Cancelled") return "assignment_cancelled";
  return String(input.status ?? "").trim().toLowerCase() || "unknown";
}

/** Timeline / milestone label for terminal ride delivery step. */
export function riderDeliveryMilestoneLabel(orderType?: string | null): string {
  return isPersonRideOrderType(orderType) ? "Completed" : "Delivered";
}
