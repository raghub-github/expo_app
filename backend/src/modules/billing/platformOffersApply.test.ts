import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPlatformCartOffers,
  applyPlatformDeliveryOffers,
  applyPlatformFeeBucketOffers,
  computePlatformDeliveryCut,
  estimateOfferDiscountValue,
  platformOfferEligible,
  platformOfferGeoMatches,
  platformOfferMerchantScopeMatches,
  isPlatformOfferHardVisibilityRejection,
  platformOfferLocationVisible,
  platformOfferWantsAutoApply,
  platformOfferCheckoutAutoApply,
  qualifyingCartFromRem,
  listEligiblePlatformOffersForCheckout,
  platformOfferServiceMatches,
} from "./platformOffersApply.js";
import {
  platformOfferFirstRideOnlyPasses,
  platformOfferRequiresFirstRideOnly,
} from "./platformOfferFirstRide.js";
import type {
  BillContext,
  BillingDataset,
  FeeRem,
  MutableBillState,
  PlatformOfferRow,
} from "./types.js";

const baseCtx = (): BillContext => ({
  itemSubtotal: 100,
  addonSubtotal: 0,
  addonQtyTotal: 0,
  orderLines: [],
  distanceKm: 1,
  merchantStoreId: 42,
  merchantParentId: null,
  now: new Date(),
  userType: "customer",
  userSegment: "ALL",
  couponCode: null,
  lineCategories: [],
  itemPackagingTotal: 0,
  packagingChargeAmount: 0,
  deliveryChargePerKm: 0,
  serviceType: "FOOD",
  cityName: null,
  dropPostalCode: "560001",
  dropGeoRefByLevel: {
    state: "state-uuid",
    region: "region-uuid",
    district: "district-uuid",
    division: "div-uuid",
    post_office: "po-uuid",
    pincode: "pin-uuid",
  },
  platformOfferGeoBindingEffectiveIds: new Set([1]),
    checkoutCouponGeoBindingEffectiveIds: new Set([1]),
  deliveryFeeFromRateCard: 0,
  deliveryFeeFromGeo: null,
  deliveryDefaultBaseInr: 25,
  deliveryDefaultPerKmInr: 5,
  tipAmount: 0,
  donationAmount: 0,
  checkoutAudience: "CUSTOMER",
  subscriptionOptIn: false,
});

function emptyState(): MutableBillState {
  return {
    discountTotal: 0,
    deliveryFee: 0,
    platformFee: 0,
    packagingFee: 0,
    surgeFee: 0,
    smallOrderFee: 0,
    convenienceFee: 0,
    miscFee: 0,
    taxTotal: 0,
    appliedNonStackableDiscount: false,
    charges: [],
    discounts: [],
    taxes: [],
    breakdown_steps: [],
  };
}

function datasetWithOffers(platformOffers: PlatformOfferRow[]): BillingDataset {
  return {
    rulesetVersion: 1,
    rules: [],
    deliverySlabs: [],
    packagingSlabs: [],
    deliveryRateCards: [],
    platformOffers,
    merchantOffers: [],
    taxConfigs: [],
    merchantOverrides: null,
    coupon: null,
  };
}

const baseOffer = (): PlatformOfferRow => ({
  id: 1,
  name: "Test",
  couponCode: "TEST10",
  promoConfig: {},
  serviceType: "FOOD",
  discountType: "PERCENTAGE",
  valueNumeric: 10,
  deliveryDiscountType: null,
  deliveryDiscountValue: null,
  offerKind: "DISCOUNT",
  offerAudience: "CUSTOMER",
  fundingMode: "PLATFORM_ONLY",
  platformSharePct: 100,
  merchantSharePct: 0,
  maxPlatformContribution: null,
  maxMerchantContribution: null,
  targetScope: "GLOBAL",
  geoLevel: null,
  geoIds: [],
  merchantIds: [],
  customerSegment: "ALL",
  minOrderAmount: null,
  maxDiscountAmount: null,
  buyQty: null,
  getQty: null,
  isStackable: false,
  exclusionGroup: null,
  startsAt: null,
  endsAt: null,
  budgetTotal: null,
  budgetUsed: null,
  maxUsesTotal: null,
  maxUsesPerUser: null,
  maxUsesPerDay: null,
  maxUsesPerMonth: null,
  consumeMode: "ON_PLACED",
  restoreOnCancel: true,
  restoreOnRefund: true,
  priority: 0,
  isHidden: false,
  conditions: {},
});

describe("qualifyingCartFromRem", () => {
  const heavyFees: FeeRem = {
    items: 250,
    delivery: 50,
    platform: 10,
    packaging: 20,
    surge: 15,
    smallOrder: 5,
    convenience: 3,
    misc: 2,
  };

  it("returns item + add-on subtotal only, ignoring fees", () => {
    assert.equal(qualifyingCartFromRem(299, heavyFees), 299);
    assert.equal(qualifyingCartFromRem(250, heavyFees), 250);
  });

  it("min order uses item subtotal — fees do not help qualify", () => {
    const ctx = baseCtx();
    ctx.itemSubtotal = 250;
    const o = baseOffer();
    o.minOrderAmount = 299;
    o.discountType = "FIXED";
    o.valueNumeric = 35;
    const rem: FeeRem = { ...heavyFees, items: 250 };
    const state = emptyState();
    applyPlatformCartOffers(ctx, datasetWithOffers([o]), state, 250, rem);
    assert.equal(state.discountTotal, 0);
    assert.equal(rem.items, 250);
  });

  it("min order passes when item subtotal meets threshold despite low fees-only total elsewhere", () => {
    const ctx = baseCtx();
    ctx.itemSubtotal = 299;
    const o = baseOffer();
    o.minOrderAmount = 299;
    o.discountType = "FIXED";
    o.valueNumeric = 35;
    const rem: FeeRem = {
      items: 299,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformCartOffers(ctx, datasetWithOffers([o]), state, 299, rem);
    assert.equal(state.discountTotal, 35);
    assert.equal(rem.items, 264);
  });

  it("listEligiblePlatformOffersForCheckout mirrors apply-time min-order basis", () => {
    const ctx = baseCtx();
    const o = baseOffer();
    o.minOrderAmount = 299;
    const ds = datasetWithOffers([o]);
    assert.equal(listEligiblePlatformOffersForCheckout(ctx, ds, 250).length, 0);
    assert.equal(listEligiblePlatformOffersForCheckout(ctx, ds, 299).length, 1);
  });

  it("FREE_DELIVERY min-order uses full cart even when order lines are ITEM_PROMO ineligible", () => {
    const ctx = baseCtx();
    ctx.orderLines = [
      {
        menuItemId: "x",
        quantity: 1,
        lineTotal: 768,
        discountEligible: false,
        ineligibilityReason: "ITEM_PROMO",
      },
    ];
    ctx.platformOfferGeoBindingEffectiveIds = new Set([77]);
    const o = {
      ...baseOffer(),
      id: 77,
      offerKind: "FREE_DELIVERY",
      deliveryDiscountType: "FULL_WAIVE",
      minOrderAmount: 298,
    };
    const ds = datasetWithOffers([o]);
    // Promo-eligible subtotal is 0, but FREE_DELIVERY still unlocks on full ₹768.
    assert.equal(listEligiblePlatformOffersForCheckout(ctx, ds, 768).length, 1);
  });
});

describe("platformOfferGeoMatches", () => {
  it("GLOBAL without binding is not location-eligible", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set();
    const o = baseOffer();
    assert.equal(platformOfferGeoMatches(ctx, o), false);
  });

  it("GLOBAL matches when present in effective geo bindings", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set([1]);
    const o = baseOffer();
    o.id = 1;
    assert.equal(platformOfferGeoMatches(ctx, o), true);
  });

  it("MERCHANT without binding is not location-eligible", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set();
    const o = baseOffer();
    o.targetScope = "MERCHANT";
    o.merchantIds = [42];
    assert.equal(platformOfferGeoMatches(ctx, o), false);
  });

  it("MERCHANT matches when present in effective geo bindings", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set([9]);
    const o = baseOffer();
    o.id = 9;
    o.targetScope = "MERCHANT";
    o.merchantIds = [42];
    assert.equal(platformOfferGeoMatches(ctx, o), true);
  });

  it("GEO matches when district id in geo_targets", () => {
    const o = baseOffer();
    o.targetScope = "GEO";
    o.conditions = {
      geo_targets: [{ level: "district", ids: ["district-uuid", "other"] }],
    };
    assert.equal(platformOfferGeoMatches(baseCtx(), o), true);
  });

  it("GEO fails when no drop geo", () => {
    const ctx = baseCtx();
    ctx.dropGeoRefByLevel = null;
    ctx.platformOfferGeoBindingEffectiveIds = new Set();
    const o = baseOffer();
    o.targetScope = "GEO";
    o.conditions = { geo_targets: [{ level: "state", ids: ["state-uuid"] }] };
    assert.equal(platformOfferGeoMatches(ctx, o), false);
  });

  it("GEO fails when buckets empty", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set();
    const o = baseOffer();
    o.targetScope = "GEO";
    o.geoIds = [];
    assert.equal(platformOfferGeoMatches(ctx, o), false);
  });

  it("GEO matches via geo_platform_offer_bindings effective ids when legacy geo_targets empty", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set([7]);
    const o = baseOffer();
    o.id = 7;
    o.targetScope = "GEO";
    o.conditions = {};
    o.geoIds = [];
    assert.equal(platformOfferGeoMatches(ctx, o), true);
  });

  it("GEO_MERCHANT matches via binding ids same as GEO", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set([3]);
    const o = baseOffer();
    o.id = 3;
    o.targetScope = "GEO_MERCHANT";
    o.merchantIds = [42];
    o.conditions = {};
    assert.equal(platformOfferGeoMatches(ctx, o), true);
  });
});

describe("platformOfferServiceMatches", () => {
  it("matches exact service and ALL", () => {
    assert.equal(platformOfferServiceMatches("GROCERY", "GROCERY"), true);
    assert.equal(platformOfferServiceMatches("GROCERY", "ALL"), true);
    assert.equal(platformOfferServiceMatches("FOOD", "GROCERY"), false);
    assert.equal(platformOfferServiceMatches("RIDE", "FOOD"), false);
  });
});

describe("platformOfferEligible service type", () => {
  it("rejects FOOD offer on GROCERY checkout", () => {
    const ctx = baseCtx();
    ctx.serviceType = "GROCERY";
    const o = baseOffer();
    o.serviceType = "FOOD";
    assert.equal(platformOfferEligible(ctx, o, 500), false);
  });

  it("accepts GROCERY offer on GROCERY checkout when geo-bound", () => {
    const ctx = baseCtx();
    ctx.serviceType = "GROCERY";
    const o = baseOffer();
    o.serviceType = "GROCERY";
    assert.equal(platformOfferEligible(ctx, o, 500), true);
  });
});

describe("isPlatformOfferHardVisibilityRejection", () => {
  it("treats geo failures as hard hide", () => {
    assert.equal(
      isPlatformOfferHardVisibilityRejection("geo=NOT_ELIGIBLE (scope=GLOBAL, effectiveIds.size=0)|minCart=500"),
      true
    );
  });

  it("allows soft min-cart unlock reasons", () => {
    assert.equal(isPlatformOfferHardVisibilityRejection("minCart=500 cart=100"), false);
  });
});

describe("platformOfferLocationVisible", () => {
  it("requires geo binding even for MERCHANT allow-listed stores", () => {
    const ctx = baseCtx();
    ctx.platformOfferGeoBindingEffectiveIds = new Set();
    const o = baseOffer();
    o.targetScope = "MERCHANT";
    o.merchantIds = [42];
    assert.equal(platformOfferLocationVisible(ctx, o), false);
  });
});

describe("platformOfferMerchantScopeMatches", () => {
  it("MERCHANT requires allow-list", () => {
    const o = baseOffer();
    o.targetScope = "MERCHANT";
    o.merchantIds = [];
    assert.equal(platformOfferMerchantScopeMatches(baseCtx(), o), false);
    o.merchantIds = [42];
    assert.equal(platformOfferMerchantScopeMatches(baseCtx(), o), true);
  });

  it("GLOBAL allows any merchant when ids empty", () => {
    const o = baseOffer();
    assert.equal(platformOfferMerchantScopeMatches(baseCtx(), o), true);
  });
});

describe("applyPlatformCartOffers", () => {
  it("BUY_X_GET_Y discounts cheapest getQty units by percentage", () => {
    const ctx = baseCtx();
    ctx.itemSubtotal = 100;
    ctx.orderLines = [{ menuItemId: "a", lineTotal: 100, quantity: 2, discountEligible: true }];
    const o = baseOffer();
    o.offerKind = "BUY_X_GET_Y";
    o.buyQty = 2;
    o.getQty = 1;
    o.discountType = "PERCENTAGE";
    o.valueNumeric = 10;
    const rem: FeeRem = {
      items: 100,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformCartOffers(ctx, datasetWithOffers([o]), state, 100, rem);
    assert.equal(rem.items, 95);
    assert.ok(state.discountTotal > 0);
  });

  it("SUBSCRIPTION_BENEFIT does not apply without subscription access", () => {
    const ctx = baseCtx();
    ctx.subscriptionOptIn = false;
    ctx.customerSubscriptionActive = false;
    ctx.itemSubtotal = 100;
    const o = baseOffer();
    o.offerKind = "SUBSCRIPTION_BENEFIT";
    o.discountType = "PERCENTAGE";
    o.valueNumeric = 50;
    const rem: FeeRem = {
      items: 100,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformCartOffers(ctx, datasetWithOffers([o]), state, 100, rem);
    assert.equal(rem.items, 100);
    assert.equal(state.discountTotal, 0);
  });

  it("SUBSCRIPTION_BENEFIT applies when customerSubscriptionActive is true", () => {
    const ctx = baseCtx();
    ctx.subscriptionOptIn = false;
    ctx.customerSubscriptionActive = true;
    ctx.itemSubtotal = 100;
    const o = baseOffer();
    o.offerKind = "SUBSCRIPTION_BENEFIT";
    o.discountType = "PERCENTAGE";
    o.valueNumeric = 10;
    const rem: FeeRem = {
      items: 100,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformCartOffers(ctx, datasetWithOffers([o]), state, 100, rem);
    assert.ok(state.discountTotal > 0);
  });

  it("SUBSCRIPTION_BENEFIT applies when subscriptionOptIn is true", () => {
    const ctx = baseCtx();
    ctx.subscriptionOptIn = true;
    ctx.itemSubtotal = 100;
    const o = baseOffer();
    o.offerKind = "SUBSCRIPTION_BENEFIT";
    o.discountType = "PERCENTAGE";
    o.valueNumeric = 10;
    const rem: FeeRem = {
      items: 100,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformCartOffers(ctx, datasetWithOffers([o]), state, 100, rem);
    assert.equal(rem.items, 90);
  });
});

describe("applyPlatformFeeBucketOffers", () => {
  it("PACKAGING_DISCOUNT reduces rem.packaging", () => {
    const ctx = baseCtx();
    ctx.itemSubtotal = 200;
    const o = baseOffer();
    o.offerKind = "PACKAGING_DISCOUNT";
    o.discountType = "PERCENTAGE";
    o.valueNumeric = 50;
    const rem: FeeRem = {
      items: 200,
      delivery: 0,
      platform: 0,
      packaging: 40,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformFeeBucketOffers(ctx, datasetWithOffers([o]), state, 200, rem);
    assert.equal(rem.packaging, 20);
    assert.equal(state.discountTotal, 20);
  });
});

describe("First Ride Only eligibility", () => {
  it("detects conditions.first_ride_only", () => {
    const o = baseOffer();
    assert.equal(platformOfferRequiresFirstRideOnly(o), false);
    o.conditions = { first_ride_only: true };
    assert.equal(platformOfferRequiresFirstRideOnly(o), true);
  });

  it("passes on RIDE with zero completed person rides", () => {
    const ctx = baseCtx();
    ctx.serviceType = "RIDE";
    ctx.completedPersonRideCount = 0;
    const o = baseOffer();
    o.serviceType = "RIDE";
    o.conditions = { first_ride_only: true };
    assert.equal(platformOfferFirstRideOnlyPasses(ctx, o), true);
    assert.equal(platformOfferEligible(ctx, o, 100), true);
  });

  it("fails when customer already completed a person ride", () => {
    const ctx = baseCtx();
    ctx.serviceType = "RIDE";
    ctx.completedPersonRideCount = 1;
    const o = baseOffer();
    o.serviceType = "RIDE";
    o.conditions = { first_ride_only: true };
    assert.equal(platformOfferFirstRideOnlyPasses(ctx, o), false);
    assert.equal(platformOfferEligible(ctx, o, 100), false);
  });

  it("fails closed when completedPersonRideCount is unknown", () => {
    const ctx = baseCtx();
    ctx.serviceType = "RIDE";
    ctx.completedPersonRideCount = null;
    const o = baseOffer();
    o.serviceType = "RIDE";
    o.conditions = { first_ride_only: true };
    assert.equal(platformOfferFirstRideOnlyPasses(ctx, o), false);
  });

  it("does not apply first-ride gate on FOOD billing", () => {
    const ctx = baseCtx();
    ctx.serviceType = "FOOD";
    ctx.completedPersonRideCount = 0;
    const o = baseOffer();
    o.serviceType = "ALL";
    o.conditions = { first_ride_only: true };
    assert.equal(platformOfferFirstRideOnlyPasses(ctx, o), false);
  });

  it("is independent of per-user usage limits", () => {
    const ctx = baseCtx();
    ctx.serviceType = "RIDE";
    ctx.completedPersonRideCount = 0;
    ctx.platformOfferUsagesByUser = new Map();
    const o = baseOffer();
    o.serviceType = "RIDE";
    o.conditions = { first_ride_only: true };
    o.maxUsesPerUser = 1;
    assert.equal(platformOfferEligible(ctx, o, 100), true);
    // Usage already consumed once — usage limit blocks, but first-ride still would pass alone.
    ctx.platformOfferUsagesByUser = new Map([[1, { lifetime: 1, day: 1, month: 1 }]]);
    assert.equal(platformOfferFirstRideOnlyPasses(ctx, o), true);
    assert.equal(platformOfferEligible(ctx, o, 100), false);
  });
});

describe("FREE_DELIVERY / platform delivery discount", () => {
  function freeDeliveryOffer(overrides: Partial<PlatformOfferRow> = {}): PlatformOfferRow {
    return {
      ...baseOffer(),
      id: 77,
      name: "Free Delivery",
      couponCode: "FREEDELIVERY299",
      offerKind: "FREE_DELIVERY",
      discountType: "PERCENTAGE",
      valueNumeric: null,
      deliveryDiscountType: "FULL_WAIVE",
      deliveryDiscountValue: null,
      ...overrides,
    };
  }

  it("PERCENTAGE alias waives delivery like PERCENT (admin save mismatch)", () => {
    const o = freeDeliveryOffer({
      deliveryDiscountType: "PERCENTAGE",
      deliveryDiscountValue: 100,
    });
    assert.equal(computePlatformDeliveryCut(o, 74.21), 74.21);
    const rem: FeeRem = {
      items: 915,
      delivery: 74.21,
      platform: 2,
      packaging: 10,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    assert.equal(estimateOfferDiscountValue(o, baseCtx(), rem), 74.21);
  });

  it("FULL_WAIVE zeroes delivery and never goes negative", () => {
    const ctx = baseCtx();
    ctx.selectedPlatformOfferId = 77;
    ctx.platformOfferGeoBindingEffectiveIds = new Set([77]);
    const rem: FeeRem = {
      items: 915,
      delivery: 74.21,
      platform: 2,
      packaging: 10,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformDeliveryOffers(ctx, datasetWithOffers([freeDeliveryOffer()]), state, 915, rem);
    assert.equal(rem.delivery, 0);
    assert.equal(state.discountTotal, 74.21);
    assert.equal(state.discounts[0]?.meta?.offerKind, "FREE_DELIVERY");
    assert.equal(state.discounts[0]?.label, "Free Delivery");
  });

  it("FIXED never exceeds delivery fee; max_discount_amount caps PERCENT", () => {
    const fixed = freeDeliveryOffer({
      deliveryDiscountType: "FIXED",
      deliveryDiscountValue: 100,
    });
    assert.equal(computePlatformDeliveryCut(fixed, 74.21), 74.21);

    const pct = freeDeliveryOffer({
      deliveryDiscountType: "PERCENT",
      deliveryDiscountValue: 100,
      maxDiscountAmount: 50,
    });
    assert.equal(computePlatformDeliveryCut(pct, 74.21), 50);
  });

  it("empty delivery_discount_type on FREE_DELIVERY defaults to FULL_WAIVE", () => {
    const o = freeDeliveryOffer({ deliveryDiscountType: null });
    assert.equal(computePlatformDeliveryCut(o, 40), 40);
  });

  it("FREE_DELIVERY PERCENT with empty value falls back to FULL_WAIVE", () => {
    const o = freeDeliveryOffer({
      deliveryDiscountType: "PERCENTAGE",
      deliveryDiscountValue: null,
    });
    assert.equal(computePlatformDeliveryCut(o, 74.21), 74.21);
  });

  it("Food checkout auto_apply requires promo_config.auto_apply === true", () => {
    assert.equal(platformOfferWantsAutoApply(freeDeliveryOffer({ promoConfig: {} })), true);
    assert.equal(
      platformOfferCheckoutAutoApply(freeDeliveryOffer({ promoConfig: {} })),
      false
    );
    assert.equal(
      platformOfferCheckoutAutoApply(freeDeliveryOffer({ promoConfig: { auto_apply: true } })),
      true
    );
    assert.equal(
      platformOfferCheckoutAutoApply(freeDeliveryOffer({ promoConfig: { auto_apply: false } })),
      false
    );
    assert.equal(
      platformOfferWantsAutoApply(freeDeliveryOffer({ promoConfig: { auto_apply: false } })),
      false
    );
  });
});
