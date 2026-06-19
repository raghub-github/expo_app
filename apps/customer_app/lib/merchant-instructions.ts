import {
  isCustomerOrderOnTheWayStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

const BLOCKED_COOKING_REQUEST_STATUSES = new Set([
  "OUT_FOR_DELIVERY",
  "ON_THE_WAY",
  "IN_TRANSIT",
  "PICKED_UP",
  "PICKED_BY_RIDER",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "RTO",
  "PAYMENT_FAILED",
]);

export function canAddCookingRequestForOrder(
  status: string | null | undefined,
  options?: { riderReachedPickupAt?: string | null }
): boolean {
  const normalized = normalizeCustomerOrderStatus(status ?? "");
  if (BLOCKED_COOKING_REQUEST_STATUSES.has(normalized)) return false;
  if (isCustomerOrderOnTheWayStatus(normalized)) return false;
  if (options?.riderReachedPickupAt) return false;
  return true;
}
