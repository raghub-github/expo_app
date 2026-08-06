/**
 * Offer Engine v2 — eligible subtotal + Flat ₹100 @ min ₹399 regression.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  markOrderLinesDiscountEligibility,
  eligibleSubtotal,
  cartPromoQualifyingSubtotal,
} from "../discountEligibility.js";
import { applyPlatformCartOffers } from "../platformOffersApply.js";
import type {
  BillContext,
  BillingDataset,
  FeeRem,
  MerchantOfferRow,
  MutableBillState,
  PlatformOfferRow,
} from "../types.js";

function baseCtx(overrides: Partial<BillContext> = {}): BillContext {
  return {
    itemSubtotal: 549,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [],
    distanceKm: 1,
    merchantStoreId: 42,
    merchantParentId: null,
    now: new Date("2026-07-11T12:00:00Z"),
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
    dropGeoRefByLevel: {},
    platformOfferGeoBindingEffectiveIds: new Set([99]),
    checkoutCouponGeoBindingEffectiveIds: new Set([99]),
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromGeo: null,
    deliveryDefaultBaseInr: 25,
    deliveryDefaultPerKmInr: 5,
    ...overrides,
  };
}

function boostOffer(id: number, menuItemIds: string[]): MerchantOfferRow {
  return {
    id,
    storeId: 42,
    title: `Boost ${id}`,
    offerType: "PERCENTAGE",
    discountPercentage: 15,
    discountValue: null,
    maxDiscountAmount: null,
    maxDiscountPerOrder: null,
    minOrderAmount: null,
    buyQuantity: null,
    getQuantity: null,
    couponCode: null,
    autoApply: true,
    isStackable: true,
    displayPriority: 1,
    firstOrderOnly: false,
    newUserOnly: false,
    maxUsesPerUser: null,
    applicableOnDays: null,
    applicableTimeStart: null,
    applicableTimeEnd: null,
    metadata: { conditions_mode: "boost", menu_item_ids: menuItemIds },
  } as MerchantOfferRow;
}

describe("offerEngine.eligibleSubtotal", () => {
  it("Flat 100 min 399 does not apply when eligible is 259 (Boost+BOGO excluded)", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "1", lineTotal: 150, quantity: 1 },
        { menuItemId: "2", lineTotal: 140, quantity: 1 },
        { menuItemId: "3", lineTotal: 188, quantity: 1 },
        { menuItemId: "4", lineTotal: 71, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [
          boostOffer(1, ["1"]),
          {
            ...boostOffer(2, ["2"]),
            offerType: "BOGO",
            buyQuantity: 1,
            getQuantity: 1,
          },
        ],
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );

    const ctx = baseCtx({
      itemSubtotal: 549,
      orderLines: lines,
      selectedPlatformOfferId: 99,
    });
    const eligible = eligibleSubtotal(ctx);
    assert.equal(eligible, 259);
    assert.ok(eligible < 399);

    const rem: FeeRem = {
      items: 549,
      delivery: 37,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state: MutableBillState = {
      discountTotal: 0,
      deliveryFee: 37,
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

    const flat100 = {
      id: 99,
      name: "Flat ₹100 Off",
      offerKind: "FLAT_DISCOUNT",
      discountType: "FIXED",
      valueNumeric: 100,
      maxDiscountAmount: null,
      minOrderAmount: 399,
      isHidden: false,
      fundingMode: "PLATFORM",
      platformSharePct: 100,
      merchantSharePct: 0,
      offerAudience: "CUSTOMER",
      customerSegment: "ALL",
      serviceType: "FOOD",
      startsAt: null,
      endsAt: null,
      merchantIds: [],
      conditions: {},
      buyQty: null,
      getQty: null,
      deliveryDiscountType: null,
      deliveryDiscountValue: null,
      priority: 1,
    } as unknown as PlatformOfferRow;

    const dataset = {
      platformOffers: [flat100],
      merchantOffers: [],
      coupons: [],
      rules: [],
      taxConfig: null,
    } as unknown as BillingDataset;

    applyPlatformCartOffers(ctx, dataset, state, 549, rem);
    assert.equal(state.discountTotal, 0, "Flat 100 must not apply below eligible min-order");
    assert.equal(cartPromoQualifyingSubtotal(ctx, 549), 259);
  });

  it("Flat 100 applies when eligible reaches 399", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "3", lineTotal: 250, quantity: 1 },
        { menuItemId: "4", lineTotal: 200, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [],
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );
    const ctx = baseCtx({
      itemSubtotal: 450,
      orderLines: lines,
      selectedPlatformOfferId: 99,
    });
    assert.equal(eligibleSubtotal(ctx), 450);

    const rem: FeeRem = {
      items: 450,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state: MutableBillState = {
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
    const flat100 = {
      id: 99,
      name: "Flat ₹100 Off",
      offerKind: "FLAT_DISCOUNT",
      discountType: "FIXED",
      valueNumeric: 100,
      maxDiscountAmount: null,
      minOrderAmount: 399,
      isHidden: false,
      fundingMode: "PLATFORM",
      platformSharePct: 100,
      merchantSharePct: 0,
      offerAudience: "CUSTOMER",
      customerSegment: "ALL",
      serviceType: "FOOD",
      startsAt: null,
      endsAt: null,
      merchantIds: [],
      conditions: {},
      buyQty: null,
      getQty: null,
      deliveryDiscountType: null,
      deliveryDiscountValue: null,
      priority: 1,
    } as unknown as PlatformOfferRow;

    applyPlatformCartOffers(
      ctx,
      {
        platformOffers: [flat100],
        merchantOffers: [],
        coupons: [],
        rules: [],
        taxConfig: null,
      } as unknown as BillingDataset,
      state,
      450,
      rem
    );
    assert.equal(state.discountTotal, 100);
  });
});
