import { z } from "zod";

/** Must stay in sync with `billing_platform_offers_offer_kind_chk` (migrations). */
export const PLATFORM_OFFER_KINDS = [
  "DISCOUNT",
  "COUPON",
  "FREE_DELIVERY",
  "FLAT_DISCOUNT",
  "BUY_X_GET_Y",
  "CASHBACK",
  "CONVENIENCE_FEE_OFF",
  "SMALL_ORDER_FEE_OFF",
  "PACKAGING_DISCOUNT",
  "SURGE_DISCOUNT",
  "FREE_MENU_ITEM",
  "BUNDLE_DISCOUNT",
  "LOYALTY_REWARD",
  "SUBSCRIPTION_BENEFIT",
  "FLASH_SALE",
] as const;

export type PlatformOfferKind = (typeof PLATFORM_OFFER_KINDS)[number];

export const platformOfferKindSchema = z.enum(PLATFORM_OFFER_KINDS);
