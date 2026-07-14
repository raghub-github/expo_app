import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCondition, ruleConditionsPass } from "./conditions.js";
import type { BillContext, ConditionRow, MutableBillState } from "./types.js";

const baseCtx = (): BillContext => ({
  itemSubtotal: 100,
  addonSubtotal: 0,
  addonQtyTotal: 0,
  orderLines: [{ menuItemId: "1", lineTotal: 100, quantity: 1, discountEligible: true }],
  distanceKm: 3.5,
  merchantStoreId: 42,
  merchantParentId: 7,
  now: new Date("2026-03-28T14:00:00.000Z"),
  userType: "customer",
  userSegment: "ALL",
  couponCode: null,
  lineCategories: [{ categoryName: "Biryani" }],
  itemPackagingTotal: 0,
  packagingChargeAmount: 10,
  deliveryChargePerKm: 8,
  serviceType: "FOOD",
  cityName: null,
  dropPostalCode: null,
  dropGeoRefByLevel: null,
  platformOfferGeoBindingEffectiveIds: new Set(),
  deliveryFeeFromRateCard: 0,
  deliveryFeeFromGeo: null,
  deliveryDefaultBaseInr: 25,
  deliveryDefaultPerKmInr: 5,
  tipAmount: 0,
  donationAmount: 0,
  checkoutAudience: "CUSTOMER",
});

describe("evaluateCondition", () => {
  it("ORDER_VALUE GTE", () => {
    const row: ConditionRow = {
      conditionType: "ORDER_VALUE",
      operator: "GTE",
      valueMin: 100,
      valueMax: null,
      valueText: null,
      valueJson: null,
    };
    assert.equal(evaluateCondition(row, baseCtx(), 100), true);
    assert.equal(evaluateCondition(row, baseCtx(), 99), false);
  });

  it("DISTANCE_KM BETWEEN", () => {
    const row: ConditionRow = {
      conditionType: "DISTANCE_KM",
      operator: "BETWEEN",
      valueMin: 2,
      valueMax: 5,
      valueText: null,
      valueJson: null,
    };
    assert.equal(evaluateCondition(row, baseCtx(), 0), true);
  });

  it("MERCHANT_STORE_ID EQ", () => {
    const row: ConditionRow = {
      conditionType: "MERCHANT_STORE_ID",
      operator: "EQ",
      valueMin: null,
      valueMax: null,
      valueText: "42",
      valueJson: null,
    };
    assert.equal(evaluateCondition(row, baseCtx(), 0), true);
  });

  it("ITEM_CATEGORY matches snapshot", () => {
    const row: ConditionRow = {
      conditionType: "ITEM_CATEGORY",
      operator: "EQ",
      valueMin: null,
      valueMax: null,
      valueText: null,
      valueJson: ["biryani"],
    };
    assert.equal(evaluateCondition(row, baseCtx(), 0), true);
  });
});

describe("ruleConditionsPass", () => {
  it("empty conditions passes", () => {
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
    assert.equal(ruleConditionsPass([], baseCtx(), state, 100), true);
  });
});
