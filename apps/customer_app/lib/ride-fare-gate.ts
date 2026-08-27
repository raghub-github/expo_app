import type { OrderSummary } from "@/services/order.service";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { isPersonRideOrderSummary } from "@/lib/person-ride-order-kind";

export function isCashRidePaymentMethod(method?: string | null): boolean {
  const m = String(method ?? "").trim().toLowerCase();
  return m === "cash" || m === "cod";
}

export function resolveRidePaymentMethod(order: {
  paymentMethod?: string | null;
  checkoutMetadata?: Record<string, unknown> | null;
}): string {
  const direct = String(order.paymentMethod ?? "").trim();
  if (direct) return direct;
  const meta = order.checkoutMetadata;
  if (meta && typeof meta === "object") {
    const fromMeta = String(meta.paymentMethod ?? meta.payment_method ?? "").trim();
    if (fromMeta) return fromMeta;
  }
  return "";
}

function isRideFareMarkedPaidInSnapshot(snap?: Record<string, unknown> | null): boolean {
  return typeof snap?.ride_fare_paid_at === "string" && snap.ride_fare_paid_at.trim().length > 0;
}

export function isRideFarePaymentPending(
  paymentStatus?: string | null,
  extras?: { billingSnapshot?: Record<string, unknown> | null }
): boolean {
  const ps = String(paymentStatus ?? "").trim().toLowerCase();
  if (ps === "paid" || ps === "completed") return false;
  if (isRideFareMarkedPaidInSnapshot(extras?.billingSnapshot)) return false;
  return true;
}

/** Cash is collected by the rider — show cash handover screen until rider confirms. */
export function shouldShowRideCashPayScreen(order: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  checkoutMetadata?: Record<string, unknown> | null;
  billingSnapshot?: Record<string, unknown> | null;
}): boolean {
  if (!isCashRidePaymentMethod(resolveRidePaymentMethod(order))) return false;
  return isRideFarePaymentPending(order.paymentStatus, {
    billingSnapshot: order.billingSnapshot,
  });
}

/** Online fare — customer pays in app (or via rider QR). */
export function shouldShowRideFarePaymentPendingScreen(order: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  checkoutMetadata?: Record<string, unknown> | null;
  billingSnapshot?: Record<string, unknown> | null;
}): boolean {
  if (isCashRidePaymentMethod(resolveRidePaymentMethod(order))) return false;
  return isRideFarePaymentPending(order.paymentStatus, {
    billingSnapshot: order.billingSnapshot,
  });
}

/** Delivered person-ride with unpaid online fare — blocks new bookings. */
export function isOutstandingRideFareOrder(order: OrderSummary): boolean {
  if (!isPersonRideOrderSummary(order)) return false;
  const status = normalizeCustomerOrderStatus(order.status);
  if (status !== "DELIVERED") return false;
  return shouldShowRideFarePaymentPendingScreen(order);
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
