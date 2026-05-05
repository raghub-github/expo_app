import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPlatformCartOffers,
  applyPlatformFeeBucketOffers,
  platformOfferGeoMatches,
  platformOfferMerchantScopeMatches,
} from "./platformOffersApply.js";
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
  platformOfferGeoBindingEffectiveIds: new Set(),
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
  priority: 0,
  isHidden: false,
  conditions: {},
});

describe("platformOfferGeoMatches", () => {
  it("GLOBAL ignores geo", () => {
    const o = baseOffer();
    assert.equal(platformOfferGeoMatches(baseCtx(), o), true);
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
    const o = baseOffer();
    o.targetScope = "GEO";
    o.conditions = { geo_targets: [{ level: "state", ids: ["state-uuid"] }] };
    assert.equal(platformOfferGeoMatches(ctx, o), false);
  });

  it("GEO fails when buckets empty", () => {
    const o = baseOffer();
    o.targetScope = "GEO";
    o.geoIds = [];
    assert.equal(platformOfferGeoMatches(baseCtx(), o), false);
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
    ctx.orderLines = [{ menuItemId: "a", lineTotal: 100, quantity: 2 }];
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

  it("SUBSCRIPTION_BENEFIT does not apply without subscriptionOptIn", () => {
    const ctx = baseCtx();
    ctx.subscriptionOptIn = false;
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
