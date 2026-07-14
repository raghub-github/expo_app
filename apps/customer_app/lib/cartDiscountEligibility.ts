/**
 * Client display hint only (badges / optimistic UI).
 * Offer Engine v2: billing/calculate and checkout-offers recompute eligibility server-side.
 * Do not use this for coupon min-order money math.
 */
import type { ItemOfferDisplay } from "@/lib/itemOfferDisplay";

export function computeIsDiscountEligible(
  _menuItem: unknown,
  itemOffer: ItemOfferDisplay | null | undefined
): boolean {
  if (itemOffer != null) return false;
  return true;
}
