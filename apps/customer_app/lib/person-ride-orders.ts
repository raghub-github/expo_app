import type { OrderSummary } from "@/services/order.service";
import {
  isActiveOrderStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";
import {
  getRideServiceLabel,
  resolveRideCatalogImageKey,
} from "@/lib/ride-order-display";
import { rideFareDistanceNavParams, parseRideFareDistanceKm } from "@/lib/ride-fare-distance";
import { rideLabelsFromCheckoutMetadata } from "@/lib/ride-address-labels";
import { isDismissedRideOrder } from "@/lib/ride-dismissed-orders";
import {
  isCashRidePaymentMethod,
  isOutstandingRideFareOrder,
  resolveRidePaymentMethod,
} from "@/lib/ride-fare-gate";
import { isPersonRideOrderSummary } from "@/lib/person-ride-order-kind";

export { isPersonRideOrderSummary };

/** Completed person-ride with no captain rating yet — allow rating from history. */
export function isRideCaptainRatingPending(order: {
  status?: string | null;
  deliveryRating?: number | null;
}): boolean {
  if (normalizeCustomerOrderStatus(order.status) !== "DELIVERED") return false;
  const rating = Number(order.deliveryRating);
  return !(Number.isFinite(rating) && rating >= 1);
}

export function isActivePersonRideOrder(order: OrderSummary): boolean {
  if (!isPersonRideOrderSummary(order)) return false;
  if (isDismissedRideOrder(order.orderId) || isDismissedRideOrder(order.formattedOrderId)) {
    return false;
  }
  if (order.cancellationReason?.trim() || order.cancelledByLabel?.trim()) return false;
  return isActiveOrderStatus(order.status);
}

/** Book a Ride home — `/home/service/ride` only (not ride-book / ride-searching). */
export function isBookARideHomeScreen(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized = pathname.split("?")[0]!.replace(/\/$/, "") || "/";
  // Exact or group-prefixed paths (e.g. /(app)/home/service/ride)
  if (normalized === "/home/service/ride") return true;
  if (/(^|\/)home\/service\/ride$/.test(normalized)) return true;
  return false;
}

/** Ride still matching a captain — show ride-searching, not live map. */
export function isPersonRideSearchingSummary(order: OrderSummary): boolean {
  const s = normalizeCustomerOrderStatus(order.status);
  return s === "SEARCHING_RIDER" || s === "PLACED" || s === "ORDER_PLACED";
}

export type PersonRideTrackingNav = {
  pathname: "/home/service/ride-searching" | "/orders/[id]";
  params: Record<string, string>;
};

/** Params for ride-searching when resuming an in-flight captain search. */
export function buildRideSearchingResumeParams(order: OrderSummary): Record<string, string> {
  const params: Record<string, string> = {
    orderId: order.orderId,
    returnTo: "ride",
  };

  const pickup = order.merchantAddress?.trim();
  const drop = order.deliveryAddress?.trim();
  if (pickup) params.pickup = pickup;
  if (drop) params.drop = drop;

  const labels = rideLabelsFromCheckoutMetadata(
    order.checkoutMetadata as Record<string, unknown> | undefined
  );
  if (labels.pickupLabel) params.pickupLabel = labels.pickupLabel;
  if (labels.dropLabel) params.dropLabel = labels.dropLabel;
  if (order.pickupLat != null && Number.isFinite(order.pickupLat)) {
    params.pickupLat = String(order.pickupLat);
  }
  if (order.pickupLng != null && Number.isFinite(order.pickupLng)) {
    params.pickupLng = String(order.pickupLng);
  }

  const rideType = order.rideType?.trim();
  if (rideType) {
    params.selectedRideId = rideType;
    params.selectedRideName = getRideServiceLabel(rideType);
    params.selectedRideImageKey = resolveRideCatalogImageKey(rideType);
  }

  const amount = order.totalAmount;
  if (amount != null && Number.isFinite(amount) && amount > 0) {
    params.estimatedFare = String(Math.round(amount));
  }

  const fareKm =
    parseRideFareDistanceKm(
      order.checkoutMetadata as { routeDistanceKm?: number; tripKm?: number } | undefined
    ) ??
    (order.distanceKm != null && Number.isFinite(order.distanceKm) && order.distanceKm > 0
      ? order.distanceKm
      : undefined);
  if (fareKm != null) {
    Object.assign(params, rideFareDistanceNavParams(fareKm));
  }

  return params;
}

/** Open tracking or payment screen for an active / due-fare ride. */
export function resolvePersonRideTrackingNavigation(order: OrderSummary): PersonRideTrackingNav {
  if (isOutstandingRideFareOrder(order)) {
    return {
      pathname: "/orders/[id]",
      params: { id: order.orderId, returnTo: "ride" },
    };
  }
  if (isPersonRideSearchingSummary(order)) {
    return {
      pathname: "/home/service/ride-searching",
      params: buildRideSearchingResumeParams(order),
    };
  }
  return {
    pathname: "/orders/[id]",
    params: { id: order.orderId, returnTo: "ride" },
  };
}

export function getActiveRideTrackLabel(
  status: string,
  paymentStatus?: string | null,
  paymentMethod?: string | null,
  dueAmount?: number
): { title: string; subtitle: string } {
  const s = normalizeCustomerOrderStatus(status);
  if (s === "DELIVERED") {
    if (isCashRidePaymentMethod(paymentMethod)) {
      return { title: "Ride completed", subtitle: "Tap to rate your captain" };
    }
    const pending = String(paymentStatus ?? "").trim().toLowerCase();
    const owesFare = dueAmount == null || dueAmount > 0.005;
    if (pending !== "paid" && pending !== "completed" && owesFare) {
      return {
        title: "Payment pending",
        subtitle: "Tap to pay your ride fare",
      };
    }
    return { title: "Ride completed", subtitle: "Tap to view receipt" };
  }
  if (s === "SEARCHING_RIDER" || s === "PLACED" || s === "ORDER_PLACED") {
    return { title: "Finding your captain", subtitle: "Tap to view live search" };
  }
  if (
    s === "RIDER_ASSIGNED" ||
    s === "ACCEPTED" ||
    s === "ASSIGNED" ||
    s === "REACHED_STORE" ||
    s === "REACHED_USER" ||
    s === "RIDER_AT_PICKUP"
  ) {
    return { title: "Captain is on the way", subtitle: "Tap to track on map" };
  }
  if (s === "RIDE_IN_PROGRESS" || s === "PICKED_UP" || s === "IN_TRANSIT") {
    return { title: "Ride in progress", subtitle: "Tap to track live" };
  }
  return { title: "Active ride", subtitle: "Tap to open details" };
}
