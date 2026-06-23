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
export function getHistoryOrderStatusLabel(
  status: string,
  options?: { orderType?: string | null }
): string {
  const s = status.toUpperCase();
  if (s === "CANCELLED") return "Cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED") return "Payment failed";
  if (s === "DELIVERED") {
    const type = String(options?.orderType ?? "").trim().toLowerCase();
    if (type === "person_ride" || type === "ride") return "Completed";
    return "Delivered";
  }
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Primary cancellation line for history cards and banners. */
export function getCustomerOrderCancellationDisplayLabel(input: {
  status: string;
  paymentStatus?: string | null;
  cancellationReason?: string | null;
  cancelledByLabel?: string | null;
}): string {
  const statusNorm = normalizeCustomerOrderStatus(input.status);
  if (statusNorm === "PAYMENT_FAILED" || statusNorm === "FAILED") {
    return "Payment failed";
  }
  if (
    input.paymentStatus?.trim().toLowerCase() === "failed" &&
    statusNorm !== "CANCELLED"
  ) {
    return "Payment failed";
  }
  if (statusNorm === "CANCELLED") {
    return "Cancelled";
  }
  return getHistoryOrderStatusLabel(input.status);
}

/** Refund completed — show "Refunded" under Cancelled on history cards. */
export function isCustomerOrderRefundCompleted(input: {
  paymentStatus?: string | null;
  refundStatus?: string | null;
}): boolean {
  const ps = (input.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "refunded" || ps === "partially_refunded") return true;
  const rs = (input.refundStatus ?? "").trim().toLowerCase();
  return rs === "refunded" || rs === "completed" || rs === "processed";
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

/** Live tracking — show delivery OTP from rider en-route through arrival until delivered. */
export function shouldShowCustomerDeliveryOtp(
  status: string | null | undefined,
  deliveryOtp: string | null | undefined
): boolean {
  if (!deliveryOtp?.trim()) return false;
  const s = normalizeCustomerOrderStatus(status);
  if (isTerminalOrderStatus(s)) return false;
  return isCustomerOrderOnTheWayStatus(s) || isRiderAtCustomerStatus(s);
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

/** Person-ride started — captain en route to drop (post pickup OTP / start ride). */
export function isPersonRideInProgressStatus(status: string | null | undefined): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return (
    s === "RIDE_IN_PROGRESS" ||
    isCustomerOrderOnTheWayStatus(s) ||
    isRiderAtCustomerStatus(s)
  );
}

/** Customer should see drop-leg UI (map nav, drop address, no pickup PIN). */
export function isPersonRideOnDropLeg(input: {
  status: string | null | undefined;
  rideStarted?: boolean | null;
}): boolean {
  if (input.rideStarted === true) return true;
  return isPersonRideInProgressStatus(input.status);
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

/** Statuses where the rider is at the merchant / picking up the order. */
export function isRiderAtStoreStatus(status: string | null | undefined): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return (
    s === "REACHED_STORE" ||
    s === "RIDER_AT_PICKUP" ||
    s === "REACHED_MERCHANT" ||
    s === "RIDER_AT_MERCHANT" ||
    s === "REACHED_PICKUP" ||
    s === "AT_PICKUP"
  );
}

/** Rider marked arrived at customer drop — before OTP / handoff. */
export function isRiderAtCustomerStatus(status: string | null | undefined): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return s === "REACHED_CUSTOMER" || s === "RIDER_AT_DROP" || s === "AT_CUSTOMER";
}

/** Merchant accepted — kitchen prep in progress (no rider leg yet). */
export function isMerchantPreparingStatus(status: string | null | undefined): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return (
    s === "ACCEPTED" ||
    s === "PREPARING" ||
    s === "READY_FOR_PICKUP" ||
    s === "READY"
  );
}

/** Large headline on the live food tracking screen (GatiMitra-style). */
export function getCustomerOrderLiveHeadline(
  status: string,
  hasRider: boolean,
  options?: {
    merchantDelayed?: boolean;
    etaContextLabel?: string | null;
    riderReachedPickupAt?: string | null;
  }
): string {
  const s = normalizeCustomerOrderStatus(status);

  if (s === "DELIVERED") return "Delivered";
  if (s === "CANCELLED") return "Order was cancelled";

  if (isRiderAtCustomerStatus(s)) {
    return "Rider has arrived";
  }

  if (isCustomerOrderOnTheWayStatus(s)) {
    return "Order is on the way";
  }

  if (
    isRiderAtStoreStatus(s) ||
    (options?.riderReachedPickupAt && !isCustomerOrderOnTheWayStatus(s))
  ) {
    return "Picking up your order";
  }

  if (s === "RIDER_ASSIGNED" || s === "ASSIGNED") {
    return "Rider heading to store";
  }

  if (
    hasRider &&
    !isRiderAtStoreStatus(s) &&
    !options?.riderReachedPickupAt &&
    (s === "ACCEPTED" || s === "PREPARING" || s === "ORDER_PLACED" || s === "CREATED")
  ) {
    return "Rider heading to store";
  }

  if (s === "SEARCHING_RIDER") {
    return "Finding a delivery partner";
  }

  if (s === "READY_FOR_PICKUP" || s === "READY") {
    return hasRider ? "Order is ready — rider on the way" : "Order is ready for pickup";
  }

  if (s === "PREPARING") {
    if (options?.merchantDelayed) return "Restaurant is taking longer than expected";
    return "Restaurant is preparing your order";
  }

  if (s === "ACCEPTED") {
    if (options?.merchantDelayed) return "Restaurant is taking longer than expected";
    return "Order accepted by restaurant";
  }

  if (isMerchantPreparingStatus(s)) {
    if (options?.merchantDelayed) return "Restaurant is taking longer than expected";
    return "Order Accepted & Being Prepared";
  }

  if (s === "ORDER_PLACED" || s === "PLACED" || s === "CREATED") {
    return "Order placed successfully";
  }

  if (options?.merchantDelayed && options?.etaContextLabel) {
    return options.etaContextLabel;
  }

  return "Order in progress";
}

/** ETA pill on the live tracking header — single minute value only. */
export function getCustomerOrderEtaPillText(
  etaMinutes: number | null | undefined,
  options?: { merchantDelayed?: boolean; etaUpdated?: boolean; riderArrived?: boolean }
): string {
  if (options?.riderArrived) {
    return "Reached your location";
  }
  if (etaMinutes != null && etaMinutes > 0) {
    const mins = Math.round(etaMinutes);
    const minLabel = mins === 1 ? "min" : "mins";
    if (options?.merchantDelayed) {
      return `Arriving in ${mins} ${minLabel} • Updated estimate`;
    }
    if (options?.etaUpdated) {
      return `Arriving in ${mins} ${minLabel} • Updated estimate`;
    }
    return `Arriving in ${mins} ${minLabel} • On time`;
  }
  return "Updating ETA…";
}

/** Subtitle on the floating order tracking pill (GatiMitra-style). */
export function getFloatingOrderStatusText(
  status: string | null | undefined,
  hasRider = false
): string {
  const s = normalizeCustomerOrderStatus(status);
  if (isRiderAtCustomerStatus(s)) return "Rider has arrived";
  if (isCustomerOrderOnTheWayStatus(s)) return "Order is on the way";
  if (isRiderAtStoreStatus(s)) return "Picking up your order";
  if (s === "RIDER_ASSIGNED" || s === "ASSIGNED") return "Rider heading to store";
  if (
    hasRider &&
    !isRiderAtStoreStatus(s) &&
    (s === "ACCEPTED" || s === "PREPARING" || s === "ORDER_PLACED" || s === "CREATED")
  ) {
    return "Rider heading to store";
  }
  if (s === "READY_FOR_PICKUP" || s === "READY") {
    return hasRider ? "Order is ready — rider on the way" : "Order ready for pickup";
  }
  if (s === "PREPARING") return "Restaurant is preparing your order";
  if (s === "ACCEPTED") return "Order accepted by restaurant";
  if (isMerchantPreparingStatus(s)) return "Order accepted & being prepared";
  if (s === "ORDER_PLACED" || s === "PLACED" || s === "CREATED") return "Order confirmed";
  if (s === "SEARCHING_RIDER") return "Finding a delivery partner";
  return "Order in progress";
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
