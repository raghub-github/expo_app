/**
 * Normalize orders_core.delivery_type (+ billing hints) for partner / merchant UI.
 */
export type PartnerDeliveryType = "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP";

function normalizeFulfillmentHint(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
}

export function isSelfPickupDeliveryType(raw: string | null | undefined): boolean {
  const dt = normalizeFulfillmentHint(raw);
  return (
    dt === "self_pickup" ||
    dt === "pickup" ||
    dt === "takeaway" ||
    dt === "take_away" ||
    dt.includes("self_pickup") ||
    (dt.includes("pickup") && !dt.includes("ready_for_pickup"))
  );
}

export function mapPartnerDeliveryType(
  deliveryType: string | null | undefined,
  billingSnap?: Record<string, unknown> | null
): PartnerDeliveryType {
  if (isSelfPickupDeliveryType(deliveryType)) return "SELF_PICKUP";
  if (billingSnap?.isSelfPickup === true) return "SELF_PICKUP";
  const billed = normalizeFulfillmentHint(
    billingSnap?.deliveryType ?? billingSnap?.delivery_type
  );
  if (isSelfPickupDeliveryType(billed)) return "SELF_PICKUP";

  const dt = normalizeFulfillmentHint(deliveryType);
  if (dt === "self_delivery" || dt === "mx_self") return "SELF_DELIVERY";
  return "GATIMITRA_RIDER";
}

export function isPartnerSelfPickupOrder(order: {
  delivery_type?: string | null;
  billing_snapshot?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!order) return false;
  if (isSelfPickupDeliveryType(order.delivery_type)) return true;
  return mapPartnerDeliveryType(order.delivery_type, order.billing_snapshot) === "SELF_PICKUP";
}

/** Compact card / list badge: Self-Pick-Up | Self Delivery | GatiMitra Delivery */
export function partnerFulfillmentLabel(order: {
  delivery_type?: string | null;
  billing_snapshot?: Record<string, unknown> | null;
} | null | undefined): string {
  const t = mapPartnerDeliveryType(order?.delivery_type, order?.billing_snapshot);
  if (t === "SELF_PICKUP") return "Self-Pick-Up";
  if (t === "SELF_DELIVERY") return "Self Delivery";
  return "GatiMitra Delivery";
}
