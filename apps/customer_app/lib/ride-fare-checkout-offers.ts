import type { CheckoutOffersResponse } from "@/services/billing.service";
import { billingService } from "@/services/billing.service";
import type { HomeBannerOffer } from "@/services/offers.service";
import { offersService } from "@/services/offers.service";

const FEATURED_OFFERS_LIMIT = 12;

function roundInr(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cleanGeoParam(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return undefined;
  return trimmed;
}

function finiteCoord(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value < -90 || value > 90) return undefined;
  return value;
}

function finiteLng(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value < -180 || value > 180) return undefined;
  return value;
}

export type RideFareCheckoutOffersResult = {
  checkoutOffers: CheckoutOffersResponse;
  featuredOffers: HomeBannerOffer[];
};

/** Load ride checkout offers — featured banners + billing checkout-offers fallback. */
export async function fetchRideFareCheckoutOffers(args: {
  fareSubtotal: number;
  lat?: number | null;
  lng?: number | null;
  pincode?: string | null;
  state?: string | null;
  city?: string | null;
  merchantStoreId?: string | null;
  addressId?: number | null;
}): Promise<RideFareCheckoutOffersResult> {
  const lat = finiteCoord(args.lat);
  const lng = finiteLng(args.lng);
  const pincode = cleanGeoParam(args.pincode);
  const state = cleanGeoParam(args.state);
  const city = cleanGeoParam(args.city);

  let featuredOffers: HomeBannerOffer[] = [];
  try {
    const featured = await offersService.getFeaturedOffers({
      serviceType: "RIDE",
      lat,
      lng,
      pincode,
      state,
      city,
      limit: FEATURED_OFFERS_LIMIT,
    });
    featuredOffers = featured.offers ?? [];
  } catch {
    featuredOffers = [];
  }

  const merchantId = args.merchantStoreId?.trim();
  const addressId = args.addressId;
  if (merchantId && addressId != null && addressId > 0) {
    try {
      const billing = await billingService.getCheckoutOffers({
        merchantId,
        addressId: String(addressId),
        cartSubtotal: args.fareSubtotal,
        serviceType: "RIDE",
        pincode,
        state,
        city,
      });
      if (billing?.ok) {
        return {
          checkoutOffers: billing,
          featuredOffers,
        };
      }
    } catch {
      // fall through to featured-only mapping
    }
  }

  return {
    checkoutOffers: mapFeaturedOffersToCheckoutOffers(featuredOffers, args.fareSubtotal),
    featuredOffers,
  };
}

export function resolveAppliedRideOfferDiscount(args: {
  fareSubtotal: number;
  checkoutOffers: CheckoutOffersResponse;
  featuredOffers: HomeBannerOffer[];
  appliedCouponCode: string | null;
  appliedPlatformOfferId: number | null;
  appliedMerchantOfferId: number | null;
}): number {
  const { checkoutOffers, featuredOffers, fareSubtotal } = args;

  if (args.appliedCouponCode) {
    const code = args.appliedCouponCode.trim().toLowerCase();
    const fromBilling = checkoutOffers.coupons.find((c) => c.code.toLowerCase() === code);
    if (fromBilling?.estimatedSavingsInr != null && fromBilling.estimatedSavingsInr > 0) {
      return roundInr(fromBilling.estimatedSavingsInr);
    }
    const fromFeatured = featuredOffers.find(
      (o) => o.coupon_code?.trim().toLowerCase() === code,
    );
    if (fromFeatured) return estimateFeaturedOfferSavings(fromFeatured, fareSubtotal);
  }

  if (args.appliedPlatformOfferId != null) {
    const fromBilling = checkoutOffers.platformOffers.find(
      (o) => o.id === args.appliedPlatformOfferId,
    );
    if (fromBilling?.estimatedSavingsInr != null && fromBilling.estimatedSavingsInr > 0) {
      return roundInr(fromBilling.estimatedSavingsInr);
    }
    const fromFeatured = featuredOffers.find(
      (o) => o.kind === "platform" && o.source_offer_id === args.appliedPlatformOfferId,
    );
    if (fromFeatured) return estimateFeaturedOfferSavings(fromFeatured, fareSubtotal);
  }

  if (args.appliedMerchantOfferId != null) {
    const fromBilling = checkoutOffers.merchantOffers.find(
      (o) => o.id === args.appliedMerchantOfferId,
    );
    if (fromBilling?.estimatedSavingsInr != null && fromBilling.estimatedSavingsInr > 0) {
      return roundInr(fromBilling.estimatedSavingsInr);
    }
    const fromFeatured = featuredOffers.find(
      (o) => o.kind === "merchant" && o.source_offer_id === args.appliedMerchantOfferId,
    );
    if (fromFeatured) return estimateFeaturedOfferSavings(fromFeatured, fareSubtotal);
  }

  return 0;
}

export function estimateFeaturedOfferSavings(
  offer: HomeBannerOffer,
  fareSubtotal: number,
): number {
  const min = Number(offer.min_order_amount ?? 0);
  if (fareSubtotal + 0.005 < min) return 0;
  const cap =
    offer.max_discount_amount != null && Number.isFinite(offer.max_discount_amount)
      ? Math.max(0, Number(offer.max_discount_amount))
      : Infinity;
  if (offer.discount_value != null && Number(offer.discount_value) > 0) {
    return roundInr(Math.min(Number(offer.discount_value), cap, fareSubtotal));
  }
  if (offer.discount_percentage != null && Number(offer.discount_percentage) > 0) {
    const pct = (fareSubtotal * Number(offer.discount_percentage)) / 100;
    return roundInr(Math.min(pct, cap, fareSubtotal));
  }
  return 0;
}

export function mapFeaturedOffersToCheckoutOffers(
  offers: HomeBannerOffer[],
  fareSubtotal: number,
): CheckoutOffersResponse {
  const coupons: CheckoutOffersResponse["coupons"] = [];
  const platformOffers: CheckoutOffersResponse["platformOffers"] = [];
  const merchantOffers: CheckoutOffersResponse["merchantOffers"] = [];
  const platformOffersIneligible: CheckoutOffersResponse["platformOffersIneligible"] = [];
  const merchantOffersIneligible: CheckoutOffersResponse["merchantOffersIneligible"] = [];

  for (const offer of offers) {
    const savings = estimateFeaturedOfferSavings(offer, fareSubtotal);
    const summary = offer.sub?.trim() || offer.title;
    if (offer.kind === "platform") {
      const row = {
        id: offer.source_offer_id,
        name: offer.title,
        offerKind: offer.offer_type?.toUpperCase() ?? "DISCOUNT",
        summary,
        estimatedSavingsInr: savings > 0 ? savings : null,
      };
      if (savings > 0) platformOffers.push(row);
      else
        platformOffersIneligible?.push({
          ...row,
          reason: minOrderReason(offer, fareSubtotal),
        });
      if (offer.coupon_code?.trim()) {
        coupons.push({
          code: offer.coupon_code.trim(),
          discountType: offer.offer_type ?? "DISCOUNT",
          description: summary,
          estimatedSavingsInr: savings > 0 ? savings : null,
        });
      }
    } else {
      const row = {
        id: offer.source_offer_id,
        title: offer.title,
        summary,
        requiresCouponCode: offer.coupon_code?.trim() || null,
        minOrderAmount: offer.min_order_amount ?? null,
        estimatedSavingsInr: savings > 0 ? savings : null,
      };
      if (savings > 0) merchantOffers.push(row);
      else
        merchantOffersIneligible?.push({
          ...row,
          reason: minOrderReason(offer, fareSubtotal),
          lockReason: minOrderReason(offer, fareSubtotal),
        });
    }
  }

  return {
    ok: true,
    coupons,
    merchantOffers,
    merchantOffersIneligible,
    platformOffers,
    platformOffersIneligible,
  };
}

function minOrderReason(offer: HomeBannerOffer, fareSubtotal: number): string {
  const min = Number(offer.min_order_amount ?? 0);
  if (min > 0 && fareSubtotal + 0.005 < min) {
    return `Min fare ₹${Math.round(min)} · yours ₹${Math.round(fareSubtotal)}`;
  }
  return "Not applicable on this fare";
}

export function extractRideBillingDiscountLines(
  billingSnapshot?: Record<string, unknown> | null,
): { label: string; amount: number }[] {
  if (!billingSnapshot || typeof billingSnapshot !== "object") return [];
  const lines: { label: string; amount: number }[] = [];
  const raw = billingSnapshot.discounts;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { label?: string; amount?: number };
      const amount = Number(row.amount ?? 0);
      if (amount > 0.005) {
        lines.push({ label: String(row.label ?? "Discount"), amount });
      }
    }
  }
  const totalDiscount = Number(
    billingSnapshot.discount_total ?? billingSnapshot.total_discount ?? 0,
  );
  if (lines.length === 0 && totalDiscount > 0.005) {
    lines.push({ label: "Discount applied", amount: totalDiscount });
  }
  return lines;
}
