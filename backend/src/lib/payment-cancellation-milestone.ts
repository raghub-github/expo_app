export type PaymentCancelledBy =
  | "CUSTOMER"
  | "MERCHANT"
  | "RIDER"
  | "ADMIN"
  | "SYSTEM"
  | "PLATFORM";

export function resolvePaymentCancellationMilestone(input: {
  previousStatus: string;
  cancelledByType: string;
  wasDelivered?: boolean;
}): { orderMilestone: string; cancelledBy: PaymentCancelledBy | null } {
  const prev = String(input.previousStatus ?? "").toUpperCase();
  const actor = String(input.cancelledByType ?? "store").toLowerCase();

  let cancelledBy: PaymentCancelledBy | null = null;
  if (actor === "customer") cancelledBy = "CUSTOMER";
  else if (actor === "store" || actor === "merchant") cancelledBy = "MERCHANT";
  else if (actor === "rider") cancelledBy = "RIDER";
  else if (actor === "admin" || actor === "dashboard") cancelledBy = "ADMIN";
  else if (actor === "system" || actor === "auto") cancelledBy = "SYSTEM";

  if (input.wasDelivered || prev === "DELIVERED") {
    return { orderMilestone: "CANCELLED_AFTER_DELIVERED", cancelledBy };
  }

  if (prev === "OUT_FOR_DELIVERY" || prev === "PICKED_UP" || prev === "IN_TRANSIT") {
    return { orderMilestone: "POST_PICKUP_CANCELLED", cancelledBy };
  }

  if (prev === "READY_FOR_PICKUP" || prev === "RIDER_ASSIGNED" || prev === "ASSIGNED") {
    return { orderMilestone: "RIDER_ASSIGNED", cancelledBy };
  }

  if (prev === "PREPARING" || prev === "MERCHANT_PREPARING") {
    return { orderMilestone: "MERCHANT_PREPARING", cancelledBy };
  }

  if (prev === "ACCEPTED") {
    return { orderMilestone: "ORDER_ACCEPTED", cancelledBy };
  }

  return { orderMilestone: "PRE_PICKUP_CANCELLED", cancelledBy };
}
