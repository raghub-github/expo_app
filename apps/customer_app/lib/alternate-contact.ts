import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";

const BLOCKED_ALTERNATE_CONTACT_STATUSES = new Set([
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

/** Keep in sync with backend `canCustomerUpdateAlternateContact`. */
export function canCustomerUpdateAlternateContact(status: string | null | undefined): boolean {
  const statusUpper = normalizeCustomerOrderStatus(status ?? "");
  return !BLOCKED_ALTERNATE_CONTACT_STATUSES.has(statusUpper);
}
