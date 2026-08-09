import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import type { BillContext, BillingDataset, RuleRow } from "./types.js";

/** Parcel-shaped billing context: slab fare is the item subtotal, no delivery leg. */
function parcelCtx(fare: number, tip = 0): BillContext {
  return {
    itemSubtotal: fare,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [{ menuItemId: "parcel", lineTotal: fare, quantity: 1, discountEligible: true }],
    distanceKm: 5,
    merchantStoreId: 0,
    merchantParentId: null,
    now: new Date(),
    userType: "customer",
    userSegment: "ALL",
    couponCode: null,
    lineCategories: [{ categoryName: "parcel" }],
    itemPackagingTotal: 0,
    packagingChargeAmount: 0,
    deliveryChargePerKm: 0,
    serviceType: "PARCEL",
    cityName: null,
    dropPostalCode: null,
    dropGeoRefByLevel: null,
    platformOfferGeoBindingEffectiveIds: new Set(),
    checkoutCouponGeoBindingEffectiveIds: new Set(),
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromGeo: null,
    deliveryDefaultBaseInr: 0,
    deliveryDefaultPerKmInr: 0,
    tipAmount: tip,
    donationAmount: 0,
    checkoutAudience: "CUSTOMER",
  };
}

function rule(r: Partial<RuleRow> & Pick<RuleRow, "id" | "type" | "calculationType">): RuleRow {
  const { priority: pr, chargeOrderKey: ck, ...rest } = r;
  const priority = pr ?? 10;
  return {
    name: null,
    valueNumeric: null,
    valueJson: null,
    stackable: true,
    appliesTo: "ORDER",
    offerOwner: "GATIMITRA",
    isHidden: false,
    metadata: null,
    conditions: [],
    serviceType: "PARCEL",
    discountAppliesOn: "ITEMS_TOTAL",
    chargeSubtype: null,
    ...rest,
    priority,
    chargeOrderKey: ck ?? priority,
  };
}

function dataset(rules: RuleRow[]): BillingDataset {
  return {
    rulesetVersion: 1,
    rules,
    deliverySlabs: [],
    packagingSlabs: [],
    deliveryRateCards: [],
    platformOffers: [],
    merchantOffers: [],
    taxConfigs: [],
    merchantOverrides: null,
    coupon: null,
  };
}

describe("computeBillForParcel pipeline shape", () => {
  it("no active charges → final = fare + tip (fare passes through)", () => {
    const r = executeBillingPipeline(parcelCtx(120, 5), dataset([]));
    assert.equal(r.item_total, 120);
    assert.equal(r.final_amount, 125);
    assert.equal(r.tax_total, 0);
    assert.deepEqual(r.taxes_by_group, {});
  });

  it("zero-value booking fee (seeded default) adds nothing", () => {
    const r = executeBillingPipeline(
      parcelCtx(120),
      dataset([rule({ id: 1, type: "PLATFORM_FEE", calculationType: "FIXED", valueNumeric: 0, chargeOrderKey: 700000 })])
    );
    assert.equal(r.platform_fee, 0);
    assert.equal(r.final_amount, 120);
  });

  it("an activated booking fee adds on top of the fare", () => {
    const r = executeBillingPipeline(
      parcelCtx(120),
      dataset([rule({ id: 1, type: "PLATFORM_FEE", calculationType: "FIXED", valueNumeric: 10, chargeOrderKey: 700000 })])
    );
    assert.equal(r.platform_fee, 10);
    assert.equal(r.final_amount, 130);
  });

  it("inactive GST is absent from the dataset → no tax applied", () => {
    // The repository only loads active rules, so an inactive GST row never reaches the
    // pipeline. With no tax config, tax stays 0 (parcel fare untaxed until admin activates).
    const r = executeBillingPipeline(parcelCtx(200, 0), dataset([]));
    assert.equal(r.tax_total, 0);
    assert.equal(r.final_amount, 200);
  });
});
