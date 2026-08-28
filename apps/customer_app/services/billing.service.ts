/**
 * Server-authoritative bill preview for checkout (POST /v1/billing/calculate).
 * Final charged amount always comes from createPendingOrder / finalize on the backend.
 *
 * Pricing rules (priority, value_numeric, formulas) are defined in the dashboard DB only;
 * this app never edits rule rows — it only sends cart/context for the engine.
 * Delivery fee may come from billing rules (rate card or geo `pricing_rules`); the server loads the
 * customer address pincode for geo resolution — always send a valid `addressId` at checkout.
 */

import api from "./api";
import { BILLING_CALCULATE_TIMEOUT_MS } from "@/constants";

const BILLING_PREFIX = "/v1/billing";

export type BillingLine = {
  kind: "charge" | "discount" | "tax";
  ruleId?: number;
  label: string;
  amount: number;
  hidden?: boolean;
  meta?: Record<string, unknown>;
};

export type BillingBreakdownStep = {
  step: string;
  amount: number;
  meta?: Record<string, unknown>;
};

export type GstComponentLine = {
  original: number;
  discount: number;
  taxable_value: number;
  gst: number;
};

export type DeliverySlabQuote = {
  distanceKm?: number;
  baseFareApplied?: number;
  perKmRate?: number;
  minCharge?: number | null;
  maxKm?: number | null;
  includedKm?: number;
  segments?: Array<{
    slabId?: number;
    minKm?: number;
    maxKm?: number | null;
    segmentKm?: number;
    perKmRate?: number;
    segmentAmount?: number;
  }>;
};

export type CalculateBillResponse = {
  /** Route distance (km) used for delivery pricing; aligns with store→drop routing on server. */
  distanceKm: number | null;
  /** Route duration (minutes) from the same routing engine used for distance. */
  durationMin?: number | null;
  /** mapbox | osrm | haversine — which engine produced distanceKm. */
  routingSource: "mapbox" | "osrm" | "haversine" | null;
  /** True when Mapbox/OSRM unavailable and straight-line ETA was used. */
  routingApproximate: boolean;
  routeCached: boolean;
  dropPostalCode: string | null;
  /** Server-authoritative: whether delivery is serviceable for this store+drop. */
  serviceable?: boolean;
  /** Effective service radius used to compute `serviceable`. */
  serviceRadiusKm?: number | null;
  /** Reason when `serviceable=false`, for UI copy. */
  unserviceableReason?: "out_of_range" | "store_inactive" | null;
  /** slab_geo | fallback_per_km | no_slab_configured | no_geo_match | slab_invalid */
  deliveryPricingEngine?: string | null;
  /** Geo slab quote from `delivery_rate_slabs` for this drop location. */
  deliverySlabQuote?: DeliverySlabQuote | null;
  /** Human-readable slab formula, e.g. "₹25 for first 3 km, then ₹6 per km". */
  deliveryFeeExplainSubtext?: string | null;
  itemTotal: number;
  addonTotal: number;
  discountTotal: number;
  deliveryFee: number;
  /**
   * Delivery fee from store→drop quote before self-pickup waiver.
   * When `deliveryType` is self_pickup, `deliveryFee` is 0 but this shows what would have applied (for UI strikethrough).
   */
  deliveryFeeQuotedInr?: number | null;
  /** Delivery fee waived by subscription free-delivery benefit (for strikethrough UI). */
  deliveryFeeWaivedInr?: number | null;
  /** Membership delivery benefit applied on this bill (full or partial). */
  subscriptionDeliveryBenefit?: {
    waivedInr: number;
    membershipDeliveryFeeInr: number;
    coveredRadiusKm: number;
    excessDistanceKm: number;
    isPartial: boolean;
    applied: boolean;
  } | null;
  /** Preview savings if customer joins the checkout plan (not yet applied). */
  subscriptionDeliveryBenefitEstimate?: {
    waivedInr: number;
    membershipDeliveryFeeInr: number;
    coveredRadiusKm: number;
    excessDistanceKm: number;
    isPartial: boolean;
    applied: boolean;
  } | null;
  platformFee: number;
  packagingFee: number;
  surgeFee: number;
  smallOrderFee: number;
  convenienceFee: number;
  miscFee: number;
  taxTotal: number;
  tipAmount: number;
  donationAmount: number;
  finalAmount: number;
  itemsNetAfterDiscounts: number;
  taxesByGroup: Record<string, number>;
  /** GST audit: per-supply component after discount allocation, before tax. */
  components: {
    items: GstComponentLine;
    delivery: GstComponentLine;
    platform: GstComponentLine;
    surge: GstComponentLine;
    packaging: GstComponentLine;
    small_order: GstComponentLine;
    convenience: GstComponentLine;
    /** Tax on the misc bucket (subscription rules like GMitra Plus / Gold). */
    subscription?: GstComponentLine;
  };
  totals: {
    total_discount: number;
    total_tax: number;
    final_payable: number;
  };
  charges: BillingLine[];
  discounts: BillingLine[];
  taxes: BillingLine[];
  breakdownSteps: BillingBreakdownStep[];
  rulesetVersion: number;
  /** Offer Engine v2 — coupon/platform min-order base (excludes Boost/BOGO/MRP lines). */
  eligibleSubtotal?: number;
  orderLineEligibility?: Array<{
    menuItemId: string;
    lineTotal: number;
    quantity: number;
    isDiscountEligible: boolean;
    ineligibilityReason: "ITEM_PROMO" | "MRP" | null;
  }>;
};

export type CalculateBillItemAddon = {
  addonId: string;
  customizationId?: string | null;
  addonName: string;
  addonPrice: number;
  quantity: number;
};

export type CalculateBillItem = {
  menuItemId: string;
  itemName: string;
  quantity: number;
  basePrice: number;
  variantId?: string | null;
  variantName?: string | null;
  addons?: CalculateBillItemAddon[];
  itemSnapshot?: Record<string, unknown> | null;
  /** Client hint only — server recomputes discount eligibility. */
  isDiscountEligible?: boolean;
};

export type CalculateBillPayload = {
  merchantId: string;
  /** Saved delivery address — required for placeable checkout bills. */
  addressId?: string | null;
  /** Provisional GPS drop when no saved address is selected yet. */
  dropLat?: number;
  dropLon?: number;
  items: CalculateBillItem[];
  tipAmount?: number;
  donationAmount?: number;
  couponCode?: string | null;
  pickupLat?: number;
  pickupLon?: number;
  /** FOOD | PARCEL | RIDE — defaults to FOOD on backend */
  serviceType?: "FOOD" | "GROCERY" | "PARCEL" | "RIDE" | "ALL";
  cityName?: string | null;
  userSegment?: "NEW" | "EXISTING" | "ALL";
  /** Opt-in platform subscription add-on (DB-driven plan from Super Admin). */
  subscriptionOptIn?: boolean;
  subscriptionPlanId?: number;
  subscriptionBillingCycle?: "weekly" | "monthly" | "yearly";
  /** 'delivery' (default) or 'self_pickup'. Self-pickup zeroes the delivery fee in billing. */
  deliveryType?: "delivery" | "self_pickup";
  selectedPlatformOfferId?: number | null;
  selectedMerchantOfferId?: number | null;
  forceNoAutoOffer?: boolean;
};

export type CheckoutOfferMerchantRow = {
  id: number;
  title: string;
  summary: string;
  autoApply?: boolean;
  requiresCouponCode?: string | null;
  minOrderAmount?: number | null;
  displaySurface?: "item" | "sheet" | "both";
  offerType?: string;
  /** boost | precision | bogo — precision must not unlock via GatiCash. */
  conditionsMode?: "boost" | "precision" | "bogo" | null;
};

export type CheckoutOffersResponse = {
  ok: true;
  coupons: {
    code: string;
    discountType: string;
    description: string;
    estimatedSavingsInr?: number | null;
    minOrderAmount?: number | null;
    customerSegment?: string | null;
    autoApply?: boolean;
  }[];
  merchantOffers: Array<
    CheckoutOfferMerchantRow & { estimatedSavingsInr?: number | null }
  >;
  merchantOffersIneligible?: Array<
    CheckoutOfferMerchantRow & {
      reason: string;
      lockReason: string;
      estimatedSavingsInr?: number | null;
    }
  >;
  platformOffers: {
    id: number;
    name: string | null;
    couponCode?: string | null;
    offerKind: string;
    summary: string;
    estimatedSavingsInr?: number | null;
  }[];
  /**
   * Offers the server filtered out for this cart. We render them disabled with
   * the rejection reason so the customer can see what's available but locked.
   */
  platformOffersIneligible?: {
    id: number;
    name: string | null;
    couponCode?: string | null;
    offerKind: string;
    summary: string;
    reason: string;
    estimatedSavingsInr?: number | null;
    minCartAmount?: number | null;
  }[];
  /** Server-computed promo-eligible cart (Offer Engine v2). */
  eligibleSubtotal?: number;
  /** Cart ₹ used when this listing was fetched — live unlock math while refetching. */
  fetchedCartSubtotal?: number;
  orderLineEligibility?: Array<{
    menuItemId: string;
    lineTotal: number;
    quantity: number;
    isDiscountEligible: boolean;
    ineligibilityReason: "ITEM_PROMO" | "MRP" | null;
  }>;
};

export const billingService = {
  async calculateBill(
    payload: CalculateBillPayload,
    options?: { signal?: AbortSignal }
  ): Promise<CalculateBillResponse> {
    const { data } = await api.post<CalculateBillResponse>(`${BILLING_PREFIX}/calculate`, payload, {
      timeout: BILLING_CALCULATE_TIMEOUT_MS,
      signal: options?.signal,
    });
    return data;
  },

  async getCheckoutOffers(params: {
    merchantId: string;
    addressId: string;
    cartSubtotal: number;
    serviceType?: "FOOD" | "GROCERY" | "PARCEL" | "RIDE" | "ALL";
    userSegment?: "NEW" | "EXISTING" | "ALL";
    /** Live location from the location store — preferred over saved address fields. */
    pincode?: string | null;
    state?: string | null;
    city?: string | null;
    /** Cart menu item ids — needed so item-scoped store offers list as eligible. */
    menuItemIds?: string[];
  }): Promise<CheckoutOffersResponse> {
    const { data } = await api.get<CheckoutOffersResponse>(`${BILLING_PREFIX}/checkout-offers`, {
      params: {
        merchantId: params.merchantId,
        addressId: params.addressId,
        cartSubtotal: params.cartSubtotal,
        ...(params.serviceType != null ? { serviceType: params.serviceType } : {}),
        ...(params.userSegment != null ? { userSegment: params.userSegment } : {}),
        ...(params.pincode ? { pincode: params.pincode } : {}),
        ...(params.state ? { state: params.state } : {}),
        ...(params.city ? { city: params.city } : {}),
        ...(params.menuItemIds && params.menuItemIds.length > 0
          ? { menuItemIds: params.menuItemIds.join(",") }
          : {}),
      },
    });
    return data;
  },
};
