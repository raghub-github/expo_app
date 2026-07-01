import type { OrderRecord } from "@/hooks/useOrders";
import type { ApiFoodOrder, FoodOrderRiderLogEntry } from "@/services/ordersApi";

export function orderHasAssignedRider(order: OrderRecord): boolean {
  return order.riderId != null || !!(order.riderName?.trim());
}

export function isOrderPastRiderAssignment(stage: OrderRecord["status"]): boolean {
  return stage === "rejected" || stage === "rto";
}

export function pendingRiderStatusLabel(stage: OrderRecord["status"]): string {
  if (isOrderPastRiderAssignment(stage)) {
    return "No delivery partner assigned";
  }
  return "Assigning delivery partner…";
}

export function riderFirstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "Delivery partner";
  return n.split(/\s+/)[0] ?? n;
}

export function riderStatusLabelFromOrder(order: OrderRecord): string {
  if (order.riderPickedUpAt) return "Out for delivery";
  if (order.riderReachedAt) return "Rider at store";
  const status = (order.riderAssignmentStatus ?? "").toUpperCase();
  if (status === "ACCEPTED" || status === "ACTIVE" || status === "PICKED_UP") {
    return order.riderReachedAt ? "Rider at store" : "Rider on the way";
  }
  if (orderHasAssignedRider(order)) return "Rider assigned";
  return pendingRiderStatusLabel(order.status);
}

/** Card headline — "{Name} is on the way" / "arriving in N mins" (partnersite-style). */
export function riderCardHeadline(order: OrderRecord, etaMinutes?: number | null): string {
  const name = (order.riderName ?? "").trim() || "Delivery partner";
  if (order.riderPickedUpAt) return `${name} is out for delivery`;
  if (order.riderReachedAt) return `${name} has arrived`;
  if (etaMinutes != null && etaMinutes > 0) {
    return `${name} is arriving in ${etaMinutes} min${etaMinutes === 1 ? "" : "s"}`;
  }
  if (order.status === "ready") return `${name} is arriving soon`;
  return `${name} is on the way`;
}

export function canTrackAssignedRider(order: OrderRecord): boolean {
  if (order.deliveryType !== "GATIMITRA_RIDER") return false;
  if (!orderHasAssignedRider(order)) return false;
  if (order.riderPickedUpAt || order.status === "picked_up") return false;
  return order.status !== "delivered" && order.status !== "rejected" && order.status !== "rto";
}

export function shouldShowPendingRiderAssign(
  order: OrderRecord,
  statuses: Array<OrderRecord["status"]>
): boolean {
  if (order.deliveryType !== "GATIMITRA_RIDER") return false;
  if (orderHasAssignedRider(order)) return false;
  return statuses.includes(order.status);
}

export function apiFoodOrderToRiderLog(order: ApiFoodOrder): FoodOrderRiderLogEntry | null {
  if (order.rider_id == null && !order.rider_name?.trim()) return null;
  return {
    rider_id: Number(order.rider_id ?? 0),
    rider_name: order.rider_name ?? null,
    rider_mobile: order.rider_mobile ?? null,
    selfie_url: order.rider_selfie_url ?? null,
    assignment_status: order.rider_assignment_status ?? "ACTIVE",
    assigned_at: null,
    accepted_at: null,
    rejected_at: null,
    reached_merchant_at: order.rider_reached_at ?? null,
    picked_up_at: order.rider_picked_up_at ?? null,
    delivered_at: order.delivered_at ?? null,
    cancelled_at: null,
  };
}
