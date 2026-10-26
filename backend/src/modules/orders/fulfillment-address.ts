/**
 * Delivery orders must carry a real customer address.
 * Takeaway / self-pickup orders must not. A missing address is never treated as takeaway —
 * only an explicit `self_pickup` fulfillment type skips the address requirement, and that
 * type is what gets persisted (no rider, no customer drop).
 */
export type FulfillmentAddressDecision =
  | { ok: true; selfPickup: false; addressId: number }
  | { ok: true; selfPickup: true; addressId: null }
  | { ok: false; code: "INVALID_ADDRESS_DATA"; message: string };

export function resolveCheckoutFulfillmentAddress(input: {
  deliveryType?: string | null;
  addressId?: string | number | null;
}): FulfillmentAddressDecision {
  const fulfillment = String(input.deliveryType ?? "delivery").trim().toLowerCase();
  const selfPickup = fulfillment === "self_pickup";

  if (!selfPickup) {
    const raw = input.addressId;
    if (raw == null || String(raw).trim() === "") {
      return {
        ok: false,
        code: "INVALID_ADDRESS_DATA",
        message: "A delivery address is required for delivery orders.",
      };
    }
    const addressId = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(addressId) || addressId < 1) {
      return {
        ok: false,
        code: "INVALID_ADDRESS_DATA",
        message: "Invalid addressId.",
      };
    }
    return { ok: true, selfPickup: false, addressId };
  }

  return { ok: true, selfPickup: true, addressId: null };
}
