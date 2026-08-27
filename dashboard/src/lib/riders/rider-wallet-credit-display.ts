/** When rider wallet credit may be shown as landed (same gate as delivery credit engine). */

export function isPersonRideOrderType(orderType?: string | null): boolean {
  const t = String(orderType ?? "").trim().toLowerCase();
  return t === "person_ride" || t === "ride";
}

/** True only after food/parcel Delivered or person-ride Completed/Delivered. */
export function isOrderDeliveredForRiderWalletCredit(input: {
  status?: string | null;
  orderType?: string | null;
}): boolean {
  const s = String(input.status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s === "delivered") return true;
  if (isPersonRideOrderType(input.orderType) && (s === "completed" || s === "complete")) {
    return true;
  }
  return false;
}

/**
 * Credit / Debit / Pending for rider dashboard recent orders + orders page.
 * Credit only after delivery — even if a ledger earning row already exists.
 */
export function resolveRiderOrderWalletEntryType(order: {
  status?: string | null;
  orderType?: string | null;
  walletCredited?: boolean;
  walletDebited?: boolean;
}): "Credit" | "Debit" | "Pending" | "—" {
  if (order.walletDebited === true) return "Debit";

  const status = String(order.status ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "failed") return "—";

  if (
    order.walletCredited === true &&
    isOrderDeliveredForRiderWalletCredit(order)
  ) {
    return "Credit";
  }

  return "Pending";
}
