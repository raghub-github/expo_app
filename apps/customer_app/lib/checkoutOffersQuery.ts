/**
 * Shared React Query key for GET /billing/checkout-offers.
 * Merchant dock + checkout must use the same shape so a dock prefetch
 * lands as a cache hit on checkout instead of a second network round trip.
 */
export type CheckoutOffersQueryKeyParams = {
  merchantId: string | null | undefined;
  addressId: string | number | null | undefined;
  /** Stable cart identity: sorted "menuItemId:qty" pairs (or equivalent). */
  cartQtyFingerprint: string;
  pincode?: string | null;
  state?: string | null;
};

export function buildCheckoutOffersQueryKey(
  p: CheckoutOffersQueryKeyParams
): readonly unknown[] {
  return [
    "billing-checkout-offers",
    p.merchantId ?? null,
    p.addressId != null ? String(p.addressId) : null,
    p.cartQtyFingerprint,
    (p.pincode ?? "").trim() || null,
    (p.state ?? "").trim() || null,
  ] as const;
}

/** Sorted `id:qty` fingerprint — ignores floating rupee subtotals that used to re-key offers. */
export function buildCartQtyFingerprint(
  items: ReadonlyArray<{ menuItemId: string; quantity: number }>
): string {
  return items
    .map((i) => `${String(i.menuItemId).trim()}:${i.quantity}`)
    .sort()
    .join("|");
}
