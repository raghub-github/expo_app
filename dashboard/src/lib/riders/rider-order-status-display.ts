/** Person ride terminal status is shown as "Completed"; food/parcel stay "Delivered". */
export function isPersonRideOrderType(orderType?: string | null): boolean {
  const t = String(orderType ?? "").trim().toLowerCase();
  return t === "person_ride" || t === "ride";
}

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

/** Timeline / milestone label for terminal ride delivery step. */
export function riderDeliveryMilestoneLabel(orderType?: string | null): string {
  return isPersonRideOrderType(orderType) ? "Completed" : "Delivered";
}
