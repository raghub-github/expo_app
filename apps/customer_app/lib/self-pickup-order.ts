import type { LiveOrderStatusView } from "@/lib/live-order-status-engine";

function readFulfillmentHint(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  return "";
}

/** True when the customer chose takeaway / self-pickup at checkout. */
export function isSelfPickupOrder(order: {
  deliveryType?: string | null;
  billingSnapshot?: Record<string, unknown> | null;
  checkoutMetadata?: Record<string, unknown> | null;
}): boolean {
  const billed = order.billingSnapshot ?? null;
  const meta = order.checkoutMetadata ?? null;
  const candidates = [
    order.deliveryType,
    billed ? readFulfillmentHint(billed.deliveryType ?? billed.delivery_type) : "",
    meta ? readFulfillmentHint(meta.deliveryType ?? meta.delivery_type) : "",
  ];
  for (const raw of candidates) {
    const dt = String(raw ?? "")
      .toLowerCase()
      .replace(/-/g, "_")
      .replace(/\s+/g, "_");
    if (
      dt === "self_pickup" ||
      dt === "pickup" ||
      dt === "takeaway" ||
      dt === "take_away" ||
      dt.includes("self_pickup")
    ) {
      return true;
    }
  }
  return billed?.isSelfPickup === true;
}

/**
 * Copy-only overlay for takeaway tracking. Stage resolution stays the same as delivery.
 */
export function remapSelfPickupLiveStatus(view: LiveOrderStatusView): LiveOrderStatusView {
  switch (view.stage) {
    case "MERCHANT_PREPARING":
      return {
        ...view,
        reassurance: "We'll notify you when it's ready for Self-Pick-Up.",
      };
    case "WAITING_FOR_RIDER":
    case "RIDER_TO_MERCHANT":
    case "AT_STORE":
    case "PICKED_UP":
    case "NEARBY":
      return {
        ...view,
        headline: "Order is ready for Self-Pick-Up",
        reassurance: "Visit the restaurant and show your OTP to collect.",
        pillText: "Ready for Self-Pick-Up",
        deliveryLate: false,
      };
    case "DELIVERED":
      return {
        ...view,
        headline: "Picked up successfully",
        pillText: "✅ Order collected",
        layers: view.layers.map((layer) =>
          layer.key === "done" ? { ...layer, title: "Order collected" } : layer
        ),
      };
    default:
      return view;
  }
}
