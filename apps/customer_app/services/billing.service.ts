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
};

export const billingService = {
  async calculateBill(payload: CalculateBillPayload): Promise<CalculateBillResponse> {
    const { data } = await api.post<CalculateBillResponse>(`${BILLING_PREFIX}/calculate`, payload);
    return data;
  },
};
