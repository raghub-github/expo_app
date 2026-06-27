import type { OrderSummary } from "@/services/order.service";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { isPersonRideOrderSummary } from "@/lib/person-ride-orders";

export function isRideFarePaymentPending(paymentStatus?: string | null): boolean {
  const ps = String(paymentStatus ?? "").trim().toLowerCase();
  return ps !== "paid" && ps !== "completed";
}

/** Delivered person-ride with unpaid fare — blocks new bookings. */
export function isOutstandingRideFareOrder(order: OrderSummary): boolean {
  if (!isPersonRideOrderSummary(order)) return false;
  const status = normalizeCustomerOrderStatus(order.status);
  if (status !== "DELIVERED") return false;
  return isRideFarePaymentPending(order.paymentStatus);
}

export const RIDE_DUE_FARE_NOTICE =
  "Please clear the previous due fare to complete or book a new ride.";

/** POST ride-fare-payment returned 409 — fare already settled; refresh UI instead of failing. */
export function isRideFareAlreadyPaidError(error: unknown): boolean {
  const err = error as {
    status?: number;
    message?: string;
    response?: { status?: number; data?: { message?: string } };
  };
  const status = err.status ?? err.response?.status;
  const message = String(err.message ?? err.response?.data?.message ?? "").toLowerCase();
  return status === 409 && message.includes("already paid");
}
