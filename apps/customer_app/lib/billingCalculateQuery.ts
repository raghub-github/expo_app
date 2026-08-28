/**
 * Single source of truth for the `billing-calculate` React Query key/params shape.
 * Any future prefetch (e.g. from the cart's "Proceed to Checkout" tap) must build its
 * key from `buildBillingCalculateQueryKey` so it can actually land a cache hit in
 * checkout — a hand-copied key here would silently drift and warm a dead cache entry.
 */
import type { CalculateBillItem, CalculateBillPayload } from "@/services/billing.service";

export type BillingCalculateKeyParams = {
  merchantId: string | null | undefined;
  addressId: string | null | undefined;
  /** Rounded GPS drop used for provisional bills before address selection. */
  dropLat?: number | null;
  dropLon?: number | null;
  billingCartKey: string;
  tipAmount: number;
  donationAmount: number;
  couponCode: string | null;
  selectedPlatformOfferId: number | null;
  selectedMerchantOfferId: number | null;
  forceNoAutoOffer: boolean;
  subscriptionOptIn: boolean;
  subscriptionBillingCycle: "weekly" | "monthly" | "yearly" | undefined;
  subscriptionPlanId: number | undefined;
  deliveryType: "delivery" | "self_pickup";
  /** Store coords — without these the first bill is item-only (no delivery quote). */
  pickupLat?: number | null;
  pickupLon?: number | null;
  /** FOOD (default) | GROCERY — grocery must not receive FOOD platform offers. */
  serviceType?: "FOOD" | "GROCERY" | "PARCEL" | "RIDE" | "ALL";
};

export function buildBillingCalculateQueryKey(p: BillingCalculateKeyParams): readonly unknown[] {
  return [
    "billing-calculate",
    p.merchantId,
    p.addressId,
    p.dropLat ?? null,
    p.dropLon ?? null,
    p.billingCartKey,
    p.tipAmount,
    p.donationAmount,
    p.couponCode,
    p.selectedPlatformOfferId,
    p.selectedMerchantOfferId,
    p.forceNoAutoOffer,
    p.subscriptionOptIn,
    p.subscriptionBillingCycle,
    p.subscriptionPlanId,
    p.deliveryType,
    p.pickupLat ?? null,
    p.pickupLon ?? null,
    p.serviceType ?? "FOOD",
  ] as const;
}

export type BillingCalculateParamsInput = BillingCalculateKeyParams & {
  items: CalculateBillItem[];
  /** Subscription upsell is only offered on some carts — gates all subscription fields. */
  showSubscriptionPromo: boolean;
  cityName?: string | null;
  pickupLat?: number;
  pickupLon?: number;
};

export function buildBillingCalculateParams(p: BillingCalculateParamsInput): CalculateBillPayload {
  // Platform offers apply by selectedPlatformOfferId. Do not also send their
  // couponCode as billing_discounts lookup — that can steal the exclusive winner
  // or load the wrong dataset cache key when codes collide.
  const couponForBilling =
    p.selectedPlatformOfferId != null ? undefined : p.couponCode ?? undefined;
  return {
    merchantId: p.merchantId!,
    ...(p.addressId != null && String(p.addressId).trim() !== ""
      ? { addressId: String(p.addressId) }
      : {}),
    ...(p.addressId == null && p.dropLat != null && p.dropLon != null
      ? { dropLat: p.dropLat, dropLon: p.dropLon }
      : {}),
    items: p.items,
    tipAmount: p.tipAmount,
    donationAmount: p.donationAmount,
    couponCode: couponForBilling,
    selectedPlatformOfferId: p.selectedPlatformOfferId,
    selectedMerchantOfferId: p.selectedMerchantOfferId,
    forceNoAutoOffer: p.forceNoAutoOffer,
    serviceType: p.serviceType ?? "FOOD",
    subscriptionOptIn: p.showSubscriptionPromo ? p.subscriptionOptIn : undefined,
    subscriptionPlanId: p.showSubscriptionPromo ? p.subscriptionPlanId : undefined,
    subscriptionBillingCycle:
      p.showSubscriptionPromo && p.subscriptionOptIn ? p.subscriptionBillingCycle : undefined,
    deliveryType: p.deliveryType,
    ...(p.cityName != null && String(p.cityName).trim() !== "" ? { cityName: String(p.cityName).trim() } : {}),
    ...(p.pickupLat != null && p.pickupLon != null
      ? { pickupLat: p.pickupLat, pickupLon: p.pickupLon }
      : {}),
  };
}
