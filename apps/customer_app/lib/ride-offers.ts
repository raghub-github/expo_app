import type { HomeBannerOffer } from "@/services/offers.service";

/** Ride surfaces use fare/ride copy instead of food order wording from the offers API. */
export function formatRideOfferSubline(
  sub: string | null | undefined,
  opts?: { minFare?: number | null; maxDiscount?: number | null }
): string {
  const trimmed = sub?.trim();
  if (trimmed) {
    return trimmed
      .replace(/\bon orders above\b/gi, "on rides above")
      .replace(/\bon order above\b/gi, "on ride above")
      .replace(/\bon your first order\b/gi, "on your first ride")
      .replace(/\bfirst order\b/gi, "first ride")
      .replace(/\bMin order\b/g, "Min fare")
      .replace(/\bmin order\b/g, "min fare");
  }

  const parts: string[] = [];
  const min = opts?.minFare;
  const max = opts?.maxDiscount;
  if (min != null && min > 0) parts.push(`on rides above ₹${Math.round(min)}`);
  if (max != null && max > 0) parts.push(`save up to ₹${Math.round(max)}`);
  return parts.join(" · ") || "Get exciting offers on every ride.";
}

/** Ride-book offers shown in the Offers bottom sheet (populated when campaigns are live). */
export type RideBookOffer = {
  id: string;
  label: string;
  subLabel?: string | null;
  couponCode?: string | null;
  /** Short eligibility line, e.g. "Min fare ₹150" */
  criteria?: string | null;
  autoApply?: boolean;
};

const RIDE_BOOK_EXCLUDED_OFFER_TYPES = new Set([
  "TIERED",
  "BUY_X_GET_Y",
  "BUY_N_GET_M",
  "BOGO",
  "BUNDLE",
  "FREE_DELIVERY",
  "FREE_ITEM",
]);

/** Platform ride coupons/discounts only — no food merchant or tiered promos. */
export function filterRideBookFeaturedOffers(offers: HomeBannerOffer[]): HomeBannerOffer[] {
  return offers.filter((offer) => {
    if (offer.kind !== "platform") return false;
    if (offer.store_id?.trim()) return false;
    const type = String(offer.offer_type ?? "").toUpperCase();
    if (RIDE_BOOK_EXCLUDED_OFFER_TYPES.has(type)) return false;
    const title = offer.title?.trim() ?? "";
    if (/spend more save more|buy more save more|buy 1 get 1|bundle deal|free delivery/i.test(title)) {
      return false;
    }
    return true;
  });
}

/** Map super-admin platform ride offers → ride book sheet rows. */
export function mapFeaturedOffersToRideBookOffers(
  offers: HomeBannerOffer[]
): RideBookOffer[] {
  return filterRideBookFeaturedOffers(offers).slice(0, 10).map((offer) => {
    const couponCode = offer.coupon_code?.trim() || null;
    const minFare =
      offer.min_order_amount != null && offer.min_order_amount > 0
        ? Math.round(offer.min_order_amount)
        : null;
    return {
      id: offer.id,
      label: offer.title?.trim() || "Ride offer",
      subLabel:
        formatRideOfferSubline(offer.sub, {
          minFare,
          maxDiscount: offer.max_discount_amount,
        }) || null,
      couponCode,
      criteria: minFare != null ? `Min fare ₹${minFare}` : null,
      autoApply: !couponCode,
    };
  });
}
