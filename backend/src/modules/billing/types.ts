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
  orderLines: {
    menuItemId: string;
    lineTotal: number;
    quantity: number;
    /** Catalog base×qty only (excludes add-ons) — Boost applies here. */
    baseLineTotal?: number;
    /** Add-on line total. */
    addonLineTotal?: number;
    /** false = already promoted (MRP / Boost / BOGO); excluded from cart/coupon bases. */
    discountEligible: boolean;
    /** Why the line is ineligible (null when eligible). */
    ineligibilityReason?: "ITEM_PROMO" | "MRP" | null;
    /** Filled by item-surface offer apply — SSOT for merchant/customer display. */
    offerDiscountAmount?: number;
    effectiveLineTotal?: number;
    appliedOfferId?: number | null;
    appliedOfferLabel?: string | null;
    appliedOfferType?: string | null;
    /** Merchant-configured Boost % (never derive from disc÷gross). */
    appliedOfferDiscountPct?: number | null;
    /** Merchant-configured flat ₹ off per unit when offer is FLAT. */
    appliedOfferDiscountFlat?: number | null;
    /** v2: Boost already baked into customer catalog via resolveItemPricing. */
    boostAlreadyInPrice?: boolean;
    canonicalPricing?: Record<string, unknown> | null;
  }[];
  /**
   * Cart menu PK → catalog item_id aliases (and similar).
   * Required so Boost targeting matches when offers store item_id but cart sends PK.
   */
  menuIdAliasesByLineId?: Map<string, string[]>;
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
  /**
   * Checkout coupons (billing_discounts) bound on the geo chain for this drop location.
   * Unmapped coupons must never apply or appear in customer APIs.
   */
  checkoutCouponGeoBindingEffectiveIds: ReadonlySet<number>;
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
  /** Active GMitra Plus (or checkout opt-in) — unlocks subscription-tied platform offers. */
  customerSubscriptionActive?: boolean;
  /** Membership free delivery applies on this order (post-pipeline benefit stacks with one promo). */
  customerSubscriptionFreeDeliveryEligible?: boolean;
  /**
   * DB-driven customer plan from Super Admin. When set, generic SUBSCRIPTION pricing
   * rules are skipped — charges come from customer-subscription-billing only.
   */
  subscriptionPlanId?: number;
  /**
   * True when the customer chose "self-pickup" at checkout. The engine must
   * skip every DELIVERY-typed rule AND the delivery-fallback chain, otherwise
   * a per-store DELIVERY rule (fixed or per-km) can re-introduce a fee even
   * after the caller zeroed every delivery input.
   */
  isSelfPickup?: boolean;
  /**
   * Which engine produced `deliveryFeeFromSlabsGeoV2`. Lets the label logic
   * distinguish a real "(slabs)" fee from an env-default fallback that fired
   * because slab validation failed — without this, a fallback would lie and
   * show up as "(slabs)" in the customer's bill.
   */
  deliveryPricingEngine?:
    | "slab_geo"
    | "fallback_slab"
    | "fallback_per_km"
    | "no_slab_configured"
    | "no_geo_match"
    | "slab_invalid";
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
  /**
   * Time-windowed usage for the requested checkout coupon (from billing_discount_usages).
   * When omitted, usage modes that need day/week/month fall back to couponRedemptionsByUser for lifetime only.
   */
  couponUsageSnapshot?: {
    lifetime: number;
    day: number;
    week: number;
    month: number;
    year: number;
  };
  /** Usage snapshots keyed by billing_discounts.id (auto-apply / multi-coupon paths). */
  couponUsageByDiscountId?: Map<
    number,
    {
      lifetime: number;
      day: number;
      week: number;
      month: number;
      year: number;
    }
  >;
  /** Completed orders for this customer (any service) — FIRST_ORDER / FIRST_N coupon modes. */
  customerCompletedOrderCount?: number | null;
  /**
   * Map of merchantOfferId → number of times this user has already used that offer.
   * Used to enforce max_uses_per_user. Omit or leave empty to skip per-user cap check.
   */
  merchantOfferUsagesByUser?: Map<number, number>;
  /**
   * Map of platformOfferId → active redemption counts for this customer.
   * Used to enforce max_uses_per_user / day / month.
   */
  platformOfferUsagesByUser?: Map<number, { lifetime: number; day: number; month: number }>;
  /**
   * Map of platformOfferId → lifetime active redemptions across all customers.
   * Used to enforce max_uses_total.
   */
  platformOfferLifetimeUseCounts?: Map<number, number>;
  /**
   * Count of this customer's completed Person Ride orders (`orders_core.order_type =
   * person_ride` + delivered). Used only for `conditions.first_ride_only`.
   * Omit / null = unknown → first-ride offers fail closed (cannot be bypassed).
   */
  completedPersonRideCount?: number | null;
  /** Completed delivered parcel orders for this customer (Parcel first-N / loyalty). */
  completedParcelCount?: number | null;
  /** Ride catalog code / type (bike, auto, cab-economy, …). */
  rideType?: string | null;
  /** Normalized vehicle class when different from rideType. */
  vehicleType?: string | null;
  /** Checkout payment mode: upi | wallet | card | online | cash | … */
  paymentMode?: string | null;
  /** Parcel weight kg when known. */
  parcelWeightKg?: number | null;
  parcelSpeed?: string | null;
  parcelScope?: string | null;
  /**
   * User explicitly selected this platform offer in the checkout UI.
   * When set and the offer is eligible, it's applied INSTEAD of the auto-picked
   * max-discount winner. Lets the customer override the default selection.
   */
  selectedPlatformOfferId?: number | null;
  /** Same as above for merchant offers. */
  selectedMerchantOfferId?: number | null;
  /**
   * When true, no platform/merchant offer is auto-applied. The customer explicitly
   * removed the applied offer in the UI. Coupons (entered manually) are still applied.
   */
  forceNoAutoOffer?: boolean;
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
  /** Tax on `rem.misc` — captures subscription rules (GMitra Plus, Gold). */
  subscription: GstComponentLine;
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
  /**
   * Standard/gross delivery fare from the delivery rate engine BEFORE any
   * customer-facing subsidy (free delivery, coupons, membership, platform
   * campaigns). This — never the net `delivery_fee` — is the Rider Fare Engine's
   * `customerFare` base, so rider payout is independent of what the customer pays.
   */
  delivery_fee_gross: number;
  /** Platform-absorbed delivery subsidy = delivery_fee_gross − delivery_fee. Platform cost only; never reduces rider payout. */
  delivery_subsidy: number;
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
  /**
   * Offer Engine v2 — Σ line totals where discountEligible !== false.
   * Coupons / platform cart / precision min-order and % bases MUST use this.
   */
  eligible_subtotal: number;
  /** Per-line eligibility snapshot for checkout UI + order freeze. */
  order_line_eligibility: Array<{
    menuItemId: string;
    lineTotal: number;
    quantity: number;
    isDiscountEligible: boolean;
    ineligibilityReason: "ITEM_PROMO" | "MRP" | null;
  }>;
  /**
   * Offer Engine — finalized per-line catalog vs effective selling price after
   * store item offers. Persisted onto orders_core_items at placement.
   */
  order_line_pricing: Array<{
    menuItemId: string;
    quantity: number;
    catalogLineTotal: number;
    effectiveLineTotal: number;
    offerDiscountAmount: number;
    appliedOfferId: number | null;
    appliedOfferLabel: string | null;
    appliedOfferType: string | null;
    appliedOfferDiscountPct: number | null;
    appliedOfferDiscountFlat: number | null;
    isDiscountEligible: boolean;
    ineligibilityReason: "ITEM_PROMO" | "MRP" | null;
    boostAlreadyInPrice?: boolean;
    canonical_pricing?: Record<string, unknown> | null;
  }>;
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
  /** Checkout coupon engine config from billing_discounts.coupon_config. */
  couponConfig: Record<string, unknown> | null;
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
  /** Customer-facing promo code (always present after 0494 migration). */
  couponCode: string | null;
  /** Ride/Parcel promo config (empty for Food). */
  promoConfig: Record<string, unknown> | null;
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
  maxUsesTotal: number | null;
  maxUsesPerUser: number | null;
  maxUsesPerDay: number | null;
  maxUsesPerMonth: number | null;
  consumeMode: string;
  restoreOnCancel: boolean;
  restoreOnRefund: boolean;
  priority: number;
  isHidden: boolean;
  conditions: Record<string, unknown>;
};

/** Row from `merchant_offers` for the current store (see merchantOffersApply). */
export type MerchantOfferRow = {
  id: number;
  offerId: string;
  title: string;
  offerType: string;
  offerSubType: string | null;
  discountValue: number | null;
  discountPercentage: number | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  maxOrderAmount: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  couponCode: string | null;
  autoApply: boolean;
  isStackable: boolean;
  perOrderLimit: number;
  firstOrderOnly: boolean;
  newUserOnly: boolean;
  maxUsesTotal: number | null;
  maxUsesPerUser: number | null;
  currentUses: number;
  applicableOnDays: string[] | null;
  applicableTimeStart: string | null;
  applicableTimeEnd: string | null;
  maxDiscountPerOrder: number | null;
  metadata: Record<string, unknown>;
  displayPriority: number;
  priority: number;
  createdSourcePlatform: string;
  createdByRole: string;
  approvalStatus: string;
};

/** Insert shape for offer_order_applications. */
export type OfferOrderApplicationInsert = {
  orderId: number;
  offerSource: "MERCHANT" | "PLATFORM" | "COUPON";
  merchantOfferId?: number | null;
  platformOfferId?: number | null;
  offerType: string;
  offerTitle: string;
  couponCode?: string | null;
  discountAmount: number;
  platformShare: number;
  merchantShare: number;
  fundingMode: string;
  snapshotJson: Record<string, unknown>;
};

/** Insert shape for merchant_offer_usages. */
export type MerchantOfferUsageInsert = {
  offerId: number;
  userId: number;
  orderId?: number | null;
  discountAmount: number;
};

/** Unified offer API response returned to customer app and checkout. */
export type UnifiedOfferApiResponse = {
  merchant_offers: MerchantOfferRow[];
  platform_offers: PlatformOfferRow[];
  coupon_offers: DiscountRow[];
  applied_offers: AppliedLine[];
  total_discount: number;
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
  /**
   * Eligible `auto_apply` coupons for this customer/cart (user-specific; never cache).
   * Used when no explicit coupon/platform/merchant selection is pinned.
   */
  autoApplyCoupons?: DiscountRow[];
  /** Per-user usage counts keyed by merchantOfferId. Undefined if userId not provided. */
  merchantOfferUsagesByUser?: Map<number, number>;
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
