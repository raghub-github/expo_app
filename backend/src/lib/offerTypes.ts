/**
 * Shared offer type definitions used across the billing engine and merchant offer APIs.
 * Canonical offer_type strings match the merchant_offers.offer_type CHECK constraint.
 */

export type MerchantOfferType =
  | "PERCENTAGE"
  | "FLAT"
  | "CART_PERCENTAGE"
  | "CART_FLAT"
  | "BUY_X_GET_Y"
  | "BUY_N_GET_M"
  | "BOGO"
  | "FREE_ITEM"
  | "FREE_DELIVERY"
  | "BUNDLE"
  | "TIERED"
  | "COUPON";

export type OfferApprovalStatus = "PENDING" | "AUTO_APPROVED" | "APPROVED" | "REJECTED";

export type OfferSourcePlatform =
  | "MERCHANT_APP"
  | "MERCHANT_PORTAL"
  | "ADMIN_DASHBOARD"
  | "AGENT_DASHBOARD"
  | "SYSTEM";

export type OfferCreatorRole = "MERCHANT" | "AGENT" | "ADMIN" | "SYSTEM";

/** Conditions stored in offer_metadata or billing_platform_offers.conditions. */
export interface OfferConditions {
  min_order_value?: number;
  max_order_value?: number;
  applicable_items?: string[];
  excluded_items?: string[];
  applicable_categories?: string[];
  excluded_categories?: string[];
  first_order_only?: boolean;
  user_segments?: string[];
  order_channel?: string;
  payment_methods?: string[];
  day_of_week?: number[];
  time_slots?: { start: string; end: string }[];
  max_uses_total?: number | null;
  max_uses_per_user?: number | null;
}

/** PERCENTAGE / CART_PERCENTAGE benefit. */
export interface PercentageBenefits {
  percentage_value: number;
  max_discount_cap: number;
  apply_on: "ITEM" | "CART";
}

/** FLAT / CART_FLAT benefit. */
export interface FlatBenefits {
  flat_amount: number;
}

/** COUPON benefit wrapper. */
export interface CouponBenefits {
  coupon_code: string;
  discount: PercentageBenefits | FlatBenefits;
}

/** BUY_N_GET_M / BUY_X_GET_Y / BOGO benefit. */
export interface BuyNGetMBenefits {
  buy_quantity: number;
  get_quantity: number;
  cheapest_free?: boolean;
  mapping?: {
    buy_from_items?: string[];
    get_from_items?: string[];
  };
}

/** FREE_ITEM benefit. */
export interface FreeItemBenefits {
  free_item_ids: string[];
  free_item_qty?: number;
  min_order_value?: number;
}

/** BUNDLE benefit. */
export interface BundleBenefits {
  bundle_items: { item_id: string; qty: number }[];
  discount_percentage?: number;
  flat_amount?: number;
  bundle_price?: number;
}

/** FREE_DELIVERY benefit. */
export interface FreeDeliveryBenefits {
  max_delivery_waiver?: number;
  min_order_value?: number;
}

/** TIERED benefit — pick highest qualifying tier. */
export interface TieredBenefits {
  tiers: Array<{
    min_order: number;
    discount_pct?: number;
    discount_flat?: number;
  }>;
}

export type OfferBenefits =
  | PercentageBenefits
  | FlatBenefits
  | CouponBenefits
  | BuyNGetMBenefits
  | FreeItemBenefits
  | BundleBenefits
  | FreeDeliveryBenefits
  | TieredBenefits;
