import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import type { BillContext, BillingDataset } from "./types.js";

const ctx = (): BillContext => ({
  itemSubtotal: 100,
  addonSubtotal: 0,
  addonQtyTotal: 0,
  orderLines: [{ menuItemId: "1", lineTotal: 100, quantity: 1 }],
  distanceKm: 2,
  merchantStoreId: 1,
  merchantParentId: null,
  now: new Date(),
  userType: "customer",
  userSegment: "ALL",
  couponCode: null,
  lineCategories: [],
  itemPackagingTotal: 0,
  packagingChargeAmount: 0,
  deliveryChargePerKm: 5,
  serviceType: "FOOD",
  cityName: null,
  dropPostalCode: null,
  dropGeoRefByLevel: null,
  platformOfferGeoBindingEffectiveIds: new Set(),
  deliveryFeeFromRateCard: 0,
  deliveryFeeFromGeo: null,
  deliveryDefaultBaseInr: 25,
  deliveryDefaultPerKmInr: 5,
  tipAmount: 5,
  donationAmount: 0,
  checkoutAudience: "CUSTOMER",
});

function ruleBase(
  r: Partial<import("./types.js").RuleRow> & Pick<import("./types.js").RuleRow, "id" | "type" | "calculationType">
): import("./types.js").RuleRow {
  const { priority: pr, chargeOrderKey: ck, ...rest } = r;
  const priority = pr ?? 10;
  const chargeOrderKey = ck ?? priority;
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
    serviceType: "FOOD",
    discountAppliesOn: "ITEMS_TOTAL",
    chargeSubtype: null,
    ...rest,
    priority,
    chargeOrderKey,
  };
}

describe("executeBillingPipeline", () => {
  it("empty rules returns item+tip only", () => {
    const dataset: BillingDataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    };
    const c = ctx();
    const r = executeBillingPipeline(
      {
        ...c,
        itemSubtotal: 100,
        addonSubtotal: 0,
        tipAmount: 5,
        donationAmount: 0,
        distanceKm: null,
        deliveryChargePerKm: 0,
        deliveryFeeFromRateCard: 0,
        deliveryFeeFromGeo: null,
      },
      dataset
    );
    assert.equal(r.final_amount, 105);
    assert.equal(r.ruleset_version, 1);
    assert.equal(r.items_net_after_discounts, 100);
    assert.deepEqual(r.taxes_by_group, {});
  });

  it("env default delivery when no rules and zero geo/card/legacy (base + per_km×km)", () => {
    const dataset: BillingDataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    };
    const c = ctx();
    const r = executeBillingPipeline(
      {
        ...c,
        distanceKm: 10,
        deliveryChargePerKm: 0,
        deliveryFeeFromRateCard: 0,
        deliveryFeeFromGeo: null,
        deliveryDefaultBaseInr: 25,
        deliveryDefaultPerKmInr: 5,
        tipAmount: 0,
        donationAmount: 0,
      },
      dataset
    );
    assert.equal(r.delivery_fee, 75);
    assert.equal(r.final_amount, 175);
  });

  it("delivery minimum floor raises legacy per-km fallback when distance > 0", () => {
    const dataset: BillingDataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    };
    const c = ctx();
    const r = executeBillingPipeline(
      {
        ...c,
        distanceKm: 2,
        deliveryChargePerKm: 5,
        deliveryFeeFromRateCard: 0,
        deliveryFeeFromGeo: null,
        deliveryMinimumInr: 25,
        tipAmount: 5,
        donationAmount: 0,
      },
      dataset
    );
    assert.equal(r.delivery_fee, 25);
    assert.equal(r.final_amount, 130);
    assert.ok(r.breakdown_steps.some((s) => s.step === "Delivery minimum"));
  });

  it("GST on items and delivery after discount (Swiggy-style split)", () => {
    const dataset: BillingDataset = {
      rulesetVersion: 2,
      rules: [
        ruleBase({
          id: 1,
          type: "DELIVERY",
          calculationType: "FIXED",
          valueNumeric: 40,
          priority: 10,
        }),
        ruleBase({
          id: 2,
          type: "DISCOUNT",
          calculationType: "FIXED",
          valueNumeric: 10,
          priority: 20,
          discountAppliesOn: "ITEMS_TOTAL",
        }),
      ],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [
        {
          id: 1,
          name: "GST items",
          rate: 0.05,
          applicableBase: "ITEM_AFTER_DISCOUNT",
          taxGroup: "item",
          priority: 100,
          chargeOrderKey: 100,
          isHidden: false,
          serviceType: "FOOD",
        },
        {
          id: 2,
          name: "GST delivery",
          rate: 0.18,
          applicableBase: "DELIVERY_FEE",
          taxGroup: "delivery",
          priority: 110,
          chargeOrderKey: 110,
          isHidden: false,
          serviceType: "FOOD",
        },
      ],
      merchantOverrides: null,
      coupon: null,
    };
    const c = ctx();
    const r = executeBillingPipeline(
      {
        ...c,
        itemSubtotal: 300,
        addonSubtotal: 0,
        tipAmount: 0,
        donationAmount: 0,
      },
      dataset
    );
    assert.equal(r.delivery_fee, 40);
    assert.equal(r.discount_total, 10);
    assert.equal(r.items_net_after_discounts, 290);
    assert.ok(r.tax_total > 0);
    assert.ok((r.taxes_by_group.item ?? 0) > 0);
    assert.ok((r.taxes_by_group.delivery ?? 0) > 0);
    const expectedItemGst = 290 * 0.05;
    const expectedDelGst = 40 * 0.18;
    assert.ok(Math.abs(r.tax_total - (expectedItemGst + expectedDelGst)) < 0.01);
    assert.equal(r.final_amount, 290 + 40 + r.tax_total);
    assert.equal(r.gst_components.items.taxable_value, 290);
    assert.equal(r.gst_components.delivery.taxable_value, 40);
    assert.ok(r.gst_components.items.gst > 0);
    assert.ok(r.gst_components.delivery.gst > 0);
    assert.equal(r.gst_totals.total_tax, r.tax_total);
  });

  it("merchant packaging sums across cart quantities and applies GST on packaging", () => {
    const dataset: BillingDataset = {
      rulesetVersion: 3,
      rules: [
        ruleBase({
          id: 10,
          type: "PACKAGING",
          calculationType: "FORMULA_KEY",
          valueJson: { key: "MERCHANT_PACKAGING" },
          priority: 10,
        }),
      ],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [
        {
          id: 11,
          name: "GST packaging",
          rate: 0.18,
          applicableBase: "PACKAGING_FEE",
          taxGroup: "packaging",
          priority: 20,
          chargeOrderKey: 20,
          isHidden: false,
          serviceType: "FOOD",
        },
      ],
      merchantOverrides: null,
      coupon: null,
    };
    const c = ctx();
    const r = executeBillingPipeline(
      {
        ...c,
        itemSubtotal: 300,
        tipAmount: 0,
        donationAmount: 0,
        distanceKm: null,
        deliveryChargePerKm: 0,
        deliveryFeeFromRateCard: 0,
        deliveryFeeFromGeo: null,
        itemPackagingTotal: 45,
      },
      dataset
    );
    assert.equal(r.packaging_fee, 45);
    assert.equal(r.gst_components.packaging.taxable_value, 45);
    assert.equal(r.gst_components.packaging.gst, 8.1);
    assert.equal(r.tax_total, 8.1);
    assert.equal(r.final_amount, 353.1);
  });

  it("coupon with metadata customer_segment NEW only applies for NEW users", () => {
    const coupon = {
      id: 1,
      code: "WELCOME",
      discountType: "PERCENTAGE",
      valueNumeric: 10,
      maxDiscountCap: null,
      usageLimit: null,
      usedCount: 0,
      validFrom: null,
      validUntil: null,
      isActive: true,
      isHidden: false,
      serviceType: "FOOD",
      offerAudience: "CUSTOMER",
      perUserUsageLimit: null,
      metadata: { customer_segment: "NEW" } as Record<string, unknown>,
    };
    const dataset: BillingDataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [],
      merchantOverrides: null,
      coupon,
    };
    const c = ctx();
    const rExisting = executeBillingPipeline({ ...c, userSegment: "EXISTING" }, dataset);
    assert.equal(rExisting.discount_total, 0);
    const rNew = executeBillingPipeline({ ...c, userSegment: "NEW" }, dataset);
    assert.equal(rNew.discount_total, 10);
  });

  it("coupon with metadata customer_segment EXISTING skips NEW users", () => {
    const coupon = {
      id: 2,
      code: "BACK",
      discountType: "FIXED",
      valueNumeric: 15,
      maxDiscountCap: null,
      usageLimit: null,
      usedCount: 0,
      validFrom: null,
      validUntil: null,
      isActive: true,
      isHidden: false,
      serviceType: "FOOD",
      offerAudience: "CUSTOMER",
      perUserUsageLimit: null,
      metadata: { customer_segment: "EXISTING" } as Record<string, unknown>,
    };
    const dataset: BillingDataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [],
      taxConfigs: [],
      merchantOverrides: null,
      coupon,
    };
    const c = ctx();
    const rNew = executeBillingPipeline({ ...c, userSegment: "NEW" }, dataset);
    assert.equal(rNew.discount_total, 0);
    const rExisting = executeBillingPipeline({ ...c, userSegment: "EXISTING" }, dataset);
    assert.equal(rExisting.discount_total, 15);
  });
});
