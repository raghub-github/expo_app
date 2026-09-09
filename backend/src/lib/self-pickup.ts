/**
 * Canonical self-pickup (takeaway) detection for a food order.
 *
 * A self-pickup order is collected by the customer themselves and NEVER needs a rider, so it must
 * be kept out of every rider dispatch path — the push session (isOrderStillDispatchable) AND the
 * HTTP idle-rider poll pool. Signal can live on ordersCore.delivery_type, or inside the persisted
 * billing snapshot / checkout metadata, so all three are checked.
 */
export function isSelfPickupFulfillment(
  deliveryType: string | null | undefined,
  billingSnapshot?: unknown,
  checkoutMetadata?: unknown
): boolean {
  const fromStored = String(deliveryType ?? "").trim().toLowerCase();
  if (
    fromStored === "self_pickup" ||
    fromStored === "takeaway" ||
    fromStored === "take_away" ||
    fromStored === "pickup"
  ) {
    return true;
  }
  const billing =
    billingSnapshot && typeof billingSnapshot === "object"
      ? (billingSnapshot as Record<string, unknown>)
      : null;
  const billed = String(billing?.deliveryType ?? billing?.delivery_type ?? "")
    .trim()
    .toLowerCase();
  if (billed === "self_pickup" || billing?.isSelfPickup === true) return true;
  const checkout =
    checkoutMetadata && typeof checkoutMetadata === "object"
      ? (checkoutMetadata as Record<string, unknown>)
      : null;
  const meta = String(checkout?.deliveryType ?? checkout?.delivery_type ?? "")
    .trim()
    .toLowerCase();
  return meta === "self_pickup" || meta === "takeaway";
}
