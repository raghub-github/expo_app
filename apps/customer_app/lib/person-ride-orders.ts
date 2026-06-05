import type { OrderSummary } from "@/services/order.service";
import {
  isActiveOrderStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

/** List row heuristics when orderType is absent from summary API. */
export function isPersonRideOrderSummary(order: OrderSummary): boolean {
  if ((order.orderType ?? "").trim().toLowerCase() === "person_ride") return true;
  const ref = (order.formattedOrderId ?? order.orderId ?? "").trim().toUpperCase();
  if (/^GMP\d*/.test(ref)) return true;
  if ((order.rideType ?? "").trim().length > 0) return true;
  const items = order.items ?? [];
  if (order.merchantStoreId != null) return false;
  if (items.length > 0) return false;
  return true;
}

export function isActivePersonRideOrder(order: OrderSummary): boolean {
  if (!isPersonRideOrderSummary(order)) return false;
  return isActiveOrderStatus(order.status);
}

export function getActiveRideTrackLabel(status: string): { title: string; subtitle: string } {
  const s = normalizeCustomerOrderStatus(status);
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
