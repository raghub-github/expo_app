import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export function isRideFarePaymentPending(
  order: Pick<
    RiderOrderSummary,
    "category" | "status" | "paymentStatus" | "adminRiderPaymentClearedAt"
  >
): boolean {
  if (order.category !== "ride") return false;
  if (order.status !== "delivered") return false;
  if (order.adminRiderPaymentClearedAt?.trim()) return false;
  const ps = String(order.paymentStatus ?? "").trim().toLowerCase();
  return ps !== "paid" && ps !== "completed";
}

export function isRideFarePaymentSettled(
  order: Pick<
    RiderOrderSummary,
    "category" | "status" | "paymentStatus" | "adminRiderPaymentClearedAt"
  >
): boolean {
  return order.category === "ride" && order.status === "delivered" && !isRideFarePaymentPending(order);
}
