/**
 * Types for the rule-based billing engine (server-side source of truth).
 */

export type BillLineCategory = {
  categoryName: string | null;
};

/** Geo UUIDs for the customer's delivery pincode (see `resolveDropGeoRefsFromPincode`). */
export type DropGeoRefByLevel = Partial<
  Record<"state" | "region" | "district" | "division" | "post_office" | "pincode", string>
>;

export type BillContext = {
  itemSubtotal: number;
  addonSubtotal: number;
  /** Total add-on pieces: Σ line (qty × Σ addon.quantity). */
  addonQtyTotal: number;
  /** Per-line totals for merchant offer item targeting (menu_item_ids in offer_metadata). */
  orderLines: { menuItemId: string; lineTotal: number; quantity: number }[];
  distanceKm: number | null;
  merchantStoreId: number;
  merchantParentId: number | null;
  now: Date;
  /** Legacy coarse bucket (e.g. customer). Prefer userSegment for offer targeting. */
  userType: string;
  /** NEW | EXISTING | ALL — for platform offer `conditions.user_segment`. */
  userSegment: "NEW" | "EXISTING" | "ALL";
  couponCode: string | null;
  lineCategories: BillLineCategory[];
  /** Sum of per-item packaging when item snapshot has packaging_enabled. */
  itemPackagingTotal: number;
  packagingChargeAmount: number;
  deliveryChargePerKm: number;
  /** FOOD | PARCEL | RIDE | ALL */
  serviceType: string;
  cityName: string | null;
  /** Drop postal code for geo `pricing_rules` (customer_delivery_fee). */
  dropPostalCode: string | null;
  /** Hierarchy UUIDs resolved from `dropPostalCode` for platform offer targeting. */
  dropGeoRefByLevel: DropGeoRefByLevel | null;
  /**
   * Platform offers whose geo bindings apply to this drop location (pincode chain merge in SQL).
   * Empty when pincode is unknown or no bindings; use with GEO / GEO_MERCHANT scoped offers.
   */
  platformOfferGeoBindingEffectiveIds: ReadonlySet<number>;
  /** Delivery fee computed by Delivery Rate Card Engine (same as legacy pre-pipeline injection). */
  deliveryFeeFromRateCard: number;
  /** Delivery fee computed by progressive geo slabs (DELIVERY_SLABS_GEO_V2). */
  deliveryFeeFromSlabsGeoV2?: number;
  /** Optional breakdown for audit/simulator/UI. */
  deliverySlabsGeoV2Quote?: Record<string, unknown> | null;
  deliverySlabsGeoV2AppliedGeo?: { level: string; refId: string } | null;
  /**
   * Location-based delivery from `pricing_rules_resolve_totals` (customer_delivery_fee).
   * Null when pincode missing or geo engine returned no rule.
   */
  deliveryFeeFromGeo: number | null;
  /**
   * When set, after DELIVERY rules and fallbacks, `delivery_fee` is at least this (INR) if `distanceKm` > 0.
   * From env `DELIVERY_MIN_FEE_INR` in `computeBillForOrder`.
   */
  deliveryMinimumInr?: number;
  /**
   * Last-resort delivery when geo/rate-card/legacy are zero: max(base, per_km × distanceKm).
   * From env `DELIVERY_DEFAULT_*` with product defaults in `computeBillForOrder`.
   */
  deliveryDefaultBaseInr: number;
  deliveryDefaultPerKmInr: number;
  tipAmount: number;
  donationAmount: number;
  /** User opted into a platform subscription add-on at checkout (SUBSCRIPTION pricing rules). */
  subscriptionOptIn?: boolean;
  /**
   * Who is checking out; must match `billing_discounts.offer_audience` for a coupon to apply.
   * Customer checkout should use CUSTOMER (default).
   */
  checkoutAudience: "CUSTOMER" | "MERCHANT" | "RIDER";
  /**
   * How many times this actor already redeemed the requested coupon code (for per-user cap).
   * When omitted, treated as 0 (quote may overstate eligibility until order commit validates).
   */
  couponRedemptionsByUser?: number;
};

export type AppliedLine = {
  kind: "charge" | "discount" | "tax";
  ruleId?: number;
  label: string;
  amount: number;
  hidden?: boolean;
  meta?: Record<string, unknown>;
};

export type BreakdownStep = {
  step: string;
  amount: number;
  meta?: Record<string, unknown>;
};

/** Per-line GST audit (Indian GST: tax after discount on each supply component). */
export type GstComponentLine = {
  original: number;
  discount: number;
  taxable_value: number;
  gst: number;
};

/** Auditable split matching food-delivery GST component breakdown. */
export type GstComponentsBreakdown = {
  items: GstComponentLine;
  delivery: GstComponentLine;
  platform: GstComponentLine;
  surge: GstComponentLine;
  packaging: GstComponentLine;
  small_order: GstComponentLine;
  convenience: GstComponentLine;
};

export type GstTotalsAudit = {
  total_discount: number;
  total_tax: number;
  final_payable: number;
};

export type BillingResult = {
  item_total: number;
  addon_total: number;
  discount_total: number;
  delivery_fee: number;
  platform_fee: number;
  packaging_fee: number;
  surge_fee: number;
  small_order_fee: number;
  convenience_fee: number;
  misc_fee: number;
  tax_total: number;
  tip_amount: number;
  donation_amount: number;
  final_amount: number;
  /** Net item line after all discounts (for GST on items). */
  items_net_after_discounts: number;
  /** Optional rollup by tax_group from billing_tax_configs. */
  taxes_by_group: Record<string, number>;
  /** Component-level original / discount / taxable / GST (2dp); tip/donation excluded. */
  gst_components: GstComponentsBreakdown;
  /** Rollup for reconciliation with gst_components + non-taxable lines. */
  gst_totals: GstTotalsAudit;
  charges: AppliedLine[];
  discounts: AppliedLine[];
  taxes: AppliedLine[];
  breakdown_steps: BreakdownStep[];
  ruleset_version: number;
};

export type ConditionRow = {
  conditionType: string;
  operator: string;
  valueMin: number | null;
  valueMax: number | null;
  valueText: string | null;
  valueJson: unknown;
};

export type RuleRow = {
  id: number;
  name: string | null;
  type: string;
  calculationType: string;
  valueNumeric: number | null;
  valueJson: unknown;
  priority: number;
  /** Canonical pipeline order (billing_pricing_rules.charge_order_key). */
  chargeOrderKey: number;
  stackable: boolean;
  appliesTo: string;
  offerOwner: string;
  isHidden: boolean;
  metadata: Record<string, unknown> | null;
  conditions: ConditionRow[];
  serviceType: string;
  /** DB + engine: DISCOUNT/OFFER target base (default ITEMS_TOTAL). */
  discountAppliesOn: string;
  chargeSubtype: string | null;
};

export type SlabRow = {
  id: number;
  name: string | null;
  minKm: number | null;
  maxKm: number | null;
  feeFixed: number;
  feePerKm: number;
  scopeType: string;
  scopeId: number | null;
  priority: number;
};

/** Cart band (item + add-on subtotal before discounts). */
export type PackagingSlabRow = {
  id: number;
  name: string | null;
  minCart: number | null;
  maxCart: number | null;
  feeFixed: number;
  feePerAddonQty: number;
  scopeType: string;
  scopeId: number | null;
  priority: number;
};

export type TaxConfigRow = {
  id: number;
  name: string;
  rate: number;
  applicableBase: string;
  taxGroup: string | null;
  priority: number;
  chargeOrderKey: number;
  isHidden: boolean;
  serviceType: string;
};

export type DiscountRow = {
  id: number;
  code: string;
  discountType: string;
  valueNumeric: number | null;
  maxDiscountCap: number | null;
  usageLimit: number | null;
  usedCount: number;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  isHidden: boolean;
  serviceType: string;
  /** CUSTOMER | MERCHANT | RIDER */
  offerAudience: string;
  /** Max redemptions per checkout actor; null = unlimited per user. */
  perUserUsageLimit: number | null;
  /** JSON from billing_discounts.metadata (e.g. customer_segment, discount_applies_on). */
  metadata: Record<string, unknown> | null;
};

export type DeliveryRateCardRow = {
  id: number;
  name: string | null;
  serviceType: string;
  cityName: string | null;
  timeSlot: string | null;
  baseFare: number;
  perKmRate: number;
  surgeMultiplier: number;
  minKm: number | null;
  maxKm: number | null;
  freeDeliveryAbove: number | null;
  priority: number;
};

export type PlatformOfferRow = {
  id: number;
  name: string | null;
  serviceType: string;
  discountType: string;
  valueNumeric: number | null;
  deliveryDiscountType: string | null;
  deliveryDiscountValue: number | null;
  offerKind: string;
  /** CUSTOMER | MERCHANT | RIDER — customer checkout only applies CUSTOMER (missing treated as CUSTOMER). */
  offerAudience: string;
  fundingMode: string;
  platformSharePct: number;
  merchantSharePct: number;
  maxPlatformContribution: number | null;
  maxMerchantContribution: number | null;
  targetScope: string;
  geoLevel: string | null;
  geoIds: string[];
  merchantIds: number[];
  customerSegment: string;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  buyQty: number | null;
  getQty: number | null;
  isStackable: boolean;
  exclusionGroup: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  budgetTotal: number | null;
  budgetUsed: number | null;
  priority: number;
  isHidden: boolean;
  conditions: Record<string, unknown>;
};

/** Row from `merchant_offers` for the current store (see merchantOffersApply). */
export type MerchantOfferRow = {
  id: number;
  title: string;
  offerType: string;
  discountValue: number | null;
  discountPercentage: number | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  metadata: Record<string, unknown>;
  displayPriority: number;
};

export type BillingDataset = {
  rulesetVersion: number;
  rules: RuleRow[];
  deliverySlabs: SlabRow[];
  packagingSlabs: PackagingSlabRow[];
  deliveryRateCards: DeliveryRateCardRow[];
  platformOffers: PlatformOfferRow[];
  /** Active store offers (item-scoped via offer_metadata.menu_item_ids). */
  merchantOffers: MerchantOfferRow[];
  taxConfigs: TaxConfigRow[];
  merchantOverrides: Record<string, unknown> | null;
  coupon: DiscountRow | null;
};

/** Mutable fee + item buckets after discounts (mirrors pipeline `rem`). */
export type FeeRem = {
  items: number;
  delivery: number;
  platform: number;
  packaging: number;
  surge: number;
  smallOrder: number;
  convenience: number;
  misc: number;
};

export type MutableBillState = {
  discountTotal: number;
  deliveryFee: number;
  platformFee: number;
  packagingFee: number;
  surgeFee: number;
  smallOrderFee: number;
  convenienceFee: number;
  miscFee: number;
  taxTotal: number;
  appliedNonStackableDiscount: boolean;
  charges: AppliedLine[];
  discounts: AppliedLine[];
  taxes: AppliedLine[];
  breakdown_steps: BreakdownStep[];
};
