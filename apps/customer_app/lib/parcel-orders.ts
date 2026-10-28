/**
 * Parcel / courier tracking navigation — search map vs live tracking.
 */

import type { OrderSummary } from "@/services/order.service";
import {
  isParcelOrder,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

/** Still matching a captain — keep users on parcel-searching map, not live tracking. */
export function isParcelSearchingSummary(order: {
  orderType?: string | null;
  formattedOrderId?: string | null;
  orderId?: string;
  status?: string | null;
  rider?: unknown;
}): boolean {
  if (!isParcelOrder(order)) return false;
  if (order.rider) return false;
  const s = normalizeCustomerOrderStatus(order.status);
  return (
    s === "SEARCHING_RIDER" ||
    s === "PLACED" ||
    s === "ORDER_PLACED" ||
    s === "CREATED"
  );
}

export function isParcelSearchingActiveStatus(status: string | null | undefined): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return (
    s === "SEARCHING_RIDER" ||
    s === "PLACED" ||
    s === "ORDER_PLACED" ||
    s === "CREATED"
  );
}

export type ParcelTrackingNav = {
  pathname: "/home/service/parcel-searching" | "/orders/[id]";
  params: Record<string, string>;
};

/** Params to resume an in-flight parcel captain search (skip re-place). */
export function buildParcelSearchingResumeParams(order: {
  orderId: string;
  formattedOrderId?: string | null;
  totalAmount?: number | null;
  distanceKm?: number | null;
  rideType?: string | null;
  vehicleImageKey?: string | null;
}): Record<string, string> {
  const params: Record<string, string> = {
    orderId: order.orderId,
    returnTo: "parcel",
  };
  const fare = order.totalAmount;
  if (fare != null && Number.isFinite(fare) && fare > 0) {
    params.fare = String(Math.round(fare));
    params.quotedGrandTotal = String(Math.round(fare));
  }
  const tripKm = order.distanceKm;
  if (tripKm != null && Number.isFinite(tripKm) && tripKm > 0) {
    params.tripKm = String(Math.round(tripKm * 100) / 100);
  }
  const vehicleId = order.rideType?.trim();
  if (vehicleId) {
    params.vehicleId = vehicleId;
    params.vehicleName =
      vehicleId === "3_wheeler"
        ? "3 Wheeler"
        : vehicleId === "4_wheeler" || vehicleId === "van"
          ? "4 Wheeler"
          : "2 Wheeler";
  }
  const imageKey = order.vehicleImageKey?.trim();
  if (imageKey) params.imageKey = imageKey;
  return params;
}

/** Track order / dock CTA: searching → map search screen; accepted → live tracking. */
export function resolveParcelTrackingNavigation(order: OrderSummary | {
  orderId: string;
  status?: string | null;
  rider?: unknown;
  orderType?: string | null;
  formattedOrderId?: string | null;
  totalAmount?: number | null;
  distanceKm?: number | null;
  rideType?: string | null;
  vehicleImageKey?: string | null;
}): ParcelTrackingNav {
  if (isParcelSearchingSummary(order)) {
    return {
      pathname: "/home/service/parcel-searching",
      params: buildParcelSearchingResumeParams(order),
    };
  }
  return {
    pathname: "/orders/[id]",
    params: { id: order.orderId, returnTo: "parcel" },
  };
}
