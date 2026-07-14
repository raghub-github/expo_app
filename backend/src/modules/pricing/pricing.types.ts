/**
 * Offer Engine V3 — shared pricing types.
 * Runtime pricing never mutates merchant_menu_items.selling_price.
 */

export type OfferLifecycleStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "DISABLED" | "EXPIRED";

export type ProductPriceBreakdown = {
  menuItemId: number;
  itemId: string | null;
  itemName: string | null;
  quantity: number;
  /** Menu base_price (MRP anchor). */
  mrp: number;
  /** Customer list price before offer (commission-inclusive selling price). */
  sellingPrice: number;
  merchantDiscount: number;
  platformDiscount: number;
  couponDiscount: number;
  walletDiscount: number;
  subscriptionDiscount: number;
  finalPrice: number;
  /** Merchant base payout per unit (immutable menu selling_price). */
  merchantBasePerUnit: number;
  /** Platform commission on customer-visible amount. */
  platformCommission: number;
  /** Estimated merchant settlement per line (base × qty − merchant-funded discount). */
  merchantSettlement: number;
  appliedOfferIds: number[];
  appliedOfferTitles: string[];
  cacheVersion: number;
};

export type CartPriceLine = ProductPriceBreakdown & {
  lineTotal: number;
  addonTotal: number;
};

export type CartPriceResult = {
  lines: CartPriceLine[];
  itemSubtotal: number;
  addonSubtotal: number;
  merchantDiscount: number;
  platformDiscount: number;
  couponDiscount: number;
  walletDiscount: number;
  subscriptionDiscount: number;
  packagingFee: number;
  deliveryFee: number;
  taxTotal: number;
  finalAmount: number;
  merchantSettlement: number;
  platformCost: number;
  cacheVersion: number;
  billingSnapshot: Record<string, unknown>;
};

export type CheckoutPriceResult = CartPriceResult & {
  orderSnapshot: OrderPricingSnapshot;
};

export type SettlementLineSnapshot = {
  menuItemId: number;
  quantity: number;
  mrp: number;
  sellingPrice: number;
  merchantBasePerUnit: number;
  customerVisiblePerUnit: number;
  merchantDiscount: number;
  platformDiscount: number;
  couponDiscount: number;
  walletDiscount: number;
  subscriptionDiscount: number;
  finalPricePerUnit: number;
  merchantSettlement: number;
  platformCommission: number;
};

export type OrderPricingSnapshot = {
  version: 3;
  computedAt: string;
  storeId: number;
  lines: SettlementLineSnapshot[];
  totals: {
    mrp: number;
    sellingPrice: number;
    merchantDiscount: number;
    platformDiscount: number;
    couponDiscount: number;
    walletDiscount: number;
    subscriptionDiscount: number;
    packaging: number;
    delivery: number;
    tax: number;
    finalAmount: number;
    merchantSettlement: number;
    platformCost: number;
  };
  appliedOffers: Array<{ id: number; title: string; source: "merchant" | "platform" | "coupon" }>;
};

export type OfferConflict = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  conflictingOfferId: number | null;
  conflictingOfferTitle: string | null;
  overlapType: "product" | "category" | "store" | "time" | "priority" | "stacking";
};

export type OfferPreviewInput = {
  storeId: number;
  menuItemId?: number;
  sampleQuantity?: number;
  draftOffer?: Record<string, unknown>;
  excludeOfferId?: number | null;
  couponCode?: string | null;
};

export type OfferPreviewResult = {
  sample: ProductPriceBreakdown | null;
  conflicts: OfferConflict[];
  cacheVersion: number;
};
