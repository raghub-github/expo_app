/** Normalize API / DB status strings to uppercase app-facing values. */
export function normalizeCustomerOrderStatus(status: string | null | undefined): string {
  const raw = (status ?? "").trim();
  if (!raw) return "";
  if (raw === "PLACED") return "ORDER_PLACED";
  const upper = raw.toUpperCase();
  if (upper === "PLACED") return "ORDER_PLACED";
  return upper;
}

/** Terminal statuses — shown under History, not Active. */
export function isTerminalOrderStatus(status: string | null | undefined): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return (
    s === "DELIVERED" ||
    s === "CANCELLED" ||
    s === "PAYMENT_FAILED" ||
    s === "FAILED"
  );
}

export function isActiveOrderStatus(status: string | null | undefined): boolean {
  return !isTerminalOrderStatus(status);
}

/** Compact badge for the My Orders → Active tab. */
export function getActiveOrderBadge(status: string): {
  label: string;
  color: string;
  bg: string;
} {
  const s = status.toUpperCase();
  if (isCustomerOrderOnTheWayStatus(s)) {
    return { label: "On the way", color: "#1D4ED8", bg: "#DBEAFE" };
  }
  if (s === "PREPARING" || s === "READY_FOR_PICKUP" || s === "READY") {
    return { label: "Preparing", color: "#C2410C", bg: "#FFEDD5" };
  }
  if (s === "ORDER_PLACED" || s === "ACCEPTED" || s === "PLACED") {
    return { label: "Confirmed", color: "#047857", bg: "#D1FAE5" };
  }
  return { label: "Processing", color: "#C2410C", bg: "#FFEDD5" };
}

/** Short label for history list rows. */
export function getHistoryOrderStatusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "CANCELLED") return "Cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED") return "Payment failed";
  if (s === "DELIVERED") return "Delivered";
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Statuses where the order is with the rider en route to the customer. */
export function isCustomerOrderOnTheWayStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toUpperCase();
  if (!s) return false;
  return (
    s === "PICKED_UP" ||
    s === "PICKED_BY_RIDER" ||
    s === "ON_THE_WAY" ||
    s === "OUT_FOR_DELIVERY" ||
    s === "IN_TRANSIT" ||
    s === "DISPATCHED"
  );
}

/** Person-ride order (mobility), not food delivery. */
export function isPersonRideOrder(order: {
  orderType?: string | null;
  merchantStoreId?: number | null;
  pickupOtp?: string | null;
  formattedOrderId?: string | null;
  orderId?: string;
  rideType?: string | null;
  items?: unknown[] | null;
}): boolean {
  if ((order.orderType ?? "").trim().toLowerCase() === "person_ride") return true;
  const ref = (order.formattedOrderId ?? order.orderId ?? "").trim().toUpperCase();
  if (/^GMP\d*/.test(ref)) return true;
  if ((order.rideType ?? "").trim().length > 0) return true;
  if (order.merchantStoreId != null) return false;
  const items = order.items ?? [];
  if (Array.isArray(items) && items.length > 0) return false;
  return !!order.pickupOtp?.trim();
}

/** Active person-ride — show live tracking UI instead of food order details. */
export function shouldShowPersonRideTrackingUi(
  order: Parameters<typeof isPersonRideOrder>[0],
  status: string | null | undefined
): boolean {
  if (!isPersonRideOrder(order)) return false;
  const s = normalizeCustomerOrderStatus(status);
  if (isTerminalOrderStatus(s)) return false;
  if (s === "SEARCHING_RIDER") return false;
  return true;
}

/** Ride order still finding a captain — redirect to ride-searching, not food order UI. */
export function isPersonRideSearchingStatus(
  order: Parameters<typeof isPersonRideOrder>[0],
  status: string | null | undefined
): boolean {
  if (!isPersonRideOrder(order)) return false;
  return normalizeCustomerOrderStatus(status) === "SEARCHING_RIDER";
}

/** Banner for completed / cancelled ride orders (not food). */
export function getPersonRideStatusBannerText(
  status: string,
  paymentStatus?: string | null
): string {
  const s = status.toUpperCase();
  if (s === "CANCELLED") return "Ride was cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED" || paymentStatus?.toLowerCase() === "failed") {
    return "Payment failed";
  }
  if (s === "DELIVERED") return "Ride completed";
  if (s === "RIDE_IN_PROGRESS" || isCustomerOrderOnTheWayStatus(s)) return "Ride in progress";
  if (s === "RIDER_ASSIGNED" || s === "REACHED_STORE" || s === "ACCEPTED" || s === "ASSIGNED") {
    return "Captain is on the way";
  }
  if (s === "SEARCHING_RIDER") return "Finding your captain";
  return "Ride in progress";
}

/** Rider assigned but customer not picked up yet — show pre-trip tracking UI. */
export function isRideAwaitingPickupStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toUpperCase();
  if (!s) return false;
  if (isCustomerOrderOnTheWayStatus(s)) return false;
  if (s === "RIDE_IN_PROGRESS" || s === "DELIVERED" || s === "CANCELLED") return false;
  return (
    s === "RIDER_ASSIGNED" ||
    s === "REACHED_STORE" ||
    s === "ACCEPTED" ||
    s === "ASSIGNED"
  );
}

/** Primary banner line on the order details screen. */
export function getCustomerOrderStatusBannerText(
  status: string,
  paymentStatus?: string | null
): string {
  const s = status.toUpperCase();
  if (s === "CANCELLED") return "Order was cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED" || paymentStatus?.toLowerCase() === "failed") {
    return "Payment failed";
  }
  if (s === "DELIVERED") return "Order was delivered";
  if (isCustomerOrderOnTheWayStatus(s)) return "Order is on the way";
  if (s === "PREPARING" || s === "READY_FOR_PICKUP" || s === "READY") {
    return "Restaurant is preparing your order";
  }
  if (s === "ORDER_PLACED" || s === "ACCEPTED" || s === "PLACED") {
    return "Order placed";
  }
  return "Order in progress";
}
