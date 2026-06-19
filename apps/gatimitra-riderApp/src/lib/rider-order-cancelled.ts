import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export function isRiderOrderCancelled(order: RiderOrderSummary | null | undefined): boolean {
  if (!order) return false;
  if (order.status === "cancelled") return true;
  const foodSt = String(order.foodOrderStatus ?? "")
    .trim()
    .toUpperCase();
  return foodSt === "CANCELLED" || foodSt === "RTO";
}

export function resolveRiderCancellationPenaltyAmount(
  order: RiderOrderSummary | null | undefined
): number | null {
  if (!order?.cancellationPenaltyApplied) return null;
  const amount = Number(order.cancellationPenaltyAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}
