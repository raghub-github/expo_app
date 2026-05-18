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
  itemTotal: number;
  addonTotal: number;
  discountTotal: number;
  deliveryFee: number;
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
};

export type CalculateBillItemAddon = {
  addonId: string;
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
};

export type CalculateBillPayload = {
  merchantId: string;
  addressId: string;
  items: CalculateBillItem[];
  tipAmount?: number;
  donationAmount?: number;
  couponCode?: string | null;
  pickupLat?: number;
  pickupLon?: number;
  /** FOOD | PARCEL | RIDE — defaults to FOOD on backend */
  serviceType?: "FOOD" | "PARCEL" | "RIDE" | "ALL";
  cityName?: string | null;
  userSegment?: "NEW" | "EXISTING" | "ALL";
  /** Opt-in platform subscription add-on (matches backend SUBSCRIPTION pricing rules). */
  subscriptionOptIn?: boolean;
  /** 'delivery' (default) or 'self_pickup'. Self-pickup zeroes the delivery fee in billing. */
  deliveryType?: "delivery" | "self_pickup";
};

export type CheckoutOffersResponse = {
  ok: true;
  coupons: { code: string; discountType: string; description: string }[];
  merchantOffers: { id: number; title: string; summary: string }[];
  platformOffers: { id: number; name: string | null; offerKind: string; summary: string }[];
  /**
   * Offers the server filtered out for this cart. We render them disabled with
   * the rejection reason so the customer can see what's available but locked.
   */
  platformOffersIneligible?: {
    id: number;
    name: string | null;
    offerKind: string;
    summary: string;
    reason: string;
  }[];
};

export const billingService = {
  async calculateBill(payload: CalculateBillPayload): Promise<CalculateBillResponse> {
    const { data } = await api.post<CalculateBillResponse>(`${BILLING_PREFIX}/calculate`, payload);
    return data;
  },

  async getCheckoutOffers(params: {
    merchantId: string;
    addressId: string;
    cartSubtotal: number;
    serviceType?: "FOOD" | "PARCEL" | "RIDE" | "ALL";
    userSegment?: "NEW" | "EXISTING" | "ALL";
    /** Live location from the location store — preferred over saved address fields. */
    pincode?: string | null;
    state?: string | null;
    city?: string | null;
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
      },
    });
    return data;
  },
};
