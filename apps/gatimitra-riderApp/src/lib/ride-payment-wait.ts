import type { RiderOrderSummary } from "@/src/services/api/riderApi";

const PAYABLE_EPS = 0.005;

function customerPayableOf(
  order: Pick<RiderOrderSummary, "customerPayable" | "paymentRequired">
): number | null {
  if (typeof order.customerPayable === "number" && Number.isFinite(order.customerPayable)) {
    return Math.max(0, order.customerPayable);
  }
  return null;
}

export function isRideFarePaymentPending(
  order: Pick<
    RiderOrderSummary,
    | "category"
    | "status"
    | "paymentStatus"
    | "adminRiderPaymentClearedAt"
    | "customerPayable"
    | "paymentRequired"
  >
): boolean {
  if (order.category !== "ride") return false;
  if (order.status !== "delivered") return false;
  if (order.adminRiderPaymentClearedAt?.trim()) return false;
  if (order.paymentRequired === false) return false;
  const payable = customerPayableOf(order);
  if (payable != null && payable <= PAYABLE_EPS) return false;
  const ps = String(order.paymentStatus ?? "").trim().toLowerCase();
  return ps !== "paid" && ps !== "completed";
}

export function isRideFarePaymentSettled(
  order: Pick<
    RiderOrderSummary,
    | "category"
    | "status"
    | "paymentStatus"
    | "adminRiderPaymentClearedAt"
    | "customerPayable"
    | "paymentRequired"
  >
): boolean {
  return order.category === "ride" && order.status === "delivered" && !isRideFarePaymentPending(order);
}
