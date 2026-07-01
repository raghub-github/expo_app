/**
 * Single surface-online formula for merchant app, partner portal, and customer app.
 * OPEN only when operational gate passes AND current time is inside configured hours.
 */

export type MerchantStoreGateRow = {
  operational_status?: string | null;
  is_active?: boolean | null;
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
  approval_status?: string | null;
  deleted_at?: string | Date | null;
  delisted_at?: string | Date | null;
};

/** Partner / merchant portal: approval + triple flags + operational OPEN. */
export function effectiveOperationalFromStoreRow(
  storeRow: MerchantStoreGateRow | null | undefined
): "OPEN" | "CLOSED" {
  if (!storeRow) return "CLOSED";
  const approval = String(storeRow.approval_status || "").toUpperCase();
  const rawOperational = String(storeRow.operational_status || "CLOSED").toUpperCase();
  const isDelisted = approval === "DELISTED";
  const ok =
    !isDelisted &&
    approval === "APPROVED" &&
    storeRow.is_active === true &&
    storeRow.is_accepting_orders === true &&
    storeRow.is_available === true &&
    rawOperational === "OPEN" &&
    !storeRow.deleted_at &&
    !storeRow.delisted_at;
  return ok ? "OPEN" : "CLOSED";
}

/** Customer-facing operational gate (no approval — delisted stores are filtered upstream). */
export function customerOperationalFromStoreRow(row: {
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  operational_status?: string | null;
}): "OPEN" | "CLOSED" {
  const op = (row.operational_status ?? "").toString().trim().toUpperCase();
  const isAvailable = row.is_available === undefined ? true : row.is_available === true;
  if (
    row.is_active === true &&
    isAvailable &&
    row.is_accepting_orders === true &&
    op === "OPEN"
  ) {
    return "OPEN";
  }
  return "CLOSED";
}

export function computeSurfaceLiveStatus(
  operational: "OPEN" | "CLOSED",
  withinOperatingHours: boolean
): "OPEN" | "CLOSED" {
  return operational === "OPEN" && withinOperatingHours ? "OPEN" : "CLOSED";
}

export function partnerSurfaceOnlineFromBody(data: {
  operational_status?: string | null;
  within_operating_hours?: boolean | null;
}): boolean {
  const opOpen = String(data.operational_status ?? "CLOSED").trim().toUpperCase() === "OPEN";
  if (typeof data.within_operating_hours === "boolean") {
    return opOpen && data.within_operating_hours;
  }
  return opOpen;
}
