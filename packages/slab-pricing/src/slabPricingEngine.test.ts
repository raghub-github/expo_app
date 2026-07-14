import test from "node:test";
import assert from "node:assert/strict";
import {
  calcCustomerSlabPrice,
  calcServicePayoutRuleSplit,
  type ServicePayoutRule,
} from "./slabPricingEngine";

const foodCustomerSlabs = [
  { id: 1, minKm: 0, maxKm: 2, baseFare: 19, perKmRate: 6, minCharge: 25, isActive: true, priority: 100 },
  { id: 2, minKm: 2, maxKm: 4, perKmRate: 7, isActive: true, priority: 100 },
  { id: 3, minKm: 4, maxKm: 7, perKmRate: 8, isActive: true, priority: 100 },
  { id: 4, minKm: 7, maxKm: 10, perKmRate: 9, isActive: true, priority: 100 },
  { id: 5, minKm: 10, maxKm: null, perKmRate: 11, isActive: true, priority: 100 },
];

test("Food customer: 5 km cumulative delivery fee = 53", () => {
  const quote = calcCustomerSlabPrice({ distanceKm: 5, slabs: foodCustomerSlabs });
  assert.ok(quote);
  assert.equal(quote.baseFare, 19);
  assert.equal(quote.distanceAmount, 34);
  assert.equal(quote.finalAmount, 53);
});

// ─── Rider Fare Engine v3.0: calcServicePayoutRuleSplit ─────────────────────
// Intentionally simple: rider% of customer fare, split purely by distance
// ratio. No guardrails, no fixed ratios — see the "Dashboard UI + Logic
// Redesign" PRD.

const rule90: ServicePayoutRule = { riderPercentage: 90, platformPercentage: 10 };
const rule80: ServicePayoutRule = { riderPercentage: 80, platformPercentage: 20 };

test("v1 PRD example: 95 fare, 90% rider => 85.50 rider total, 9.50 platform revenue", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 95, pickupKm: 7, dropKm: 2, rule: rule90 });
  assert.equal(split.riderTotal, 85.5);
  assert.equal(split.platformRevenue, 9.5);
});

test("v1 PRD Scenario A: pickup 7km / drop 2km => pickup 66.50, drop 19.00", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 95, pickupKm: 7, dropKm: 2, rule: rule90 });
  assert.equal(split.pickupAmount, 66.5);
  assert.equal(split.dropAmount, 19);
  assert.equal(split.pickupRatio, 77.78);
  assert.equal(split.dropRatio, 22.22);
});

test("v1 PRD Scenario B: pickup 2km / drop 8km => pickup 17.10, drop 68.40", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 95, pickupKm: 2, dropKm: 8, rule: rule90 });
  assert.equal(split.pickupAmount, 17.1);
  assert.equal(split.dropAmount, 68.4);
});

test("v2 PRD example: 500 fare, 80% rider, pickup 5km / drop 15km => pickup 100, drop 300 (distance ratio, not 50/50)", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 500, pickupKm: 5, dropKm: 15, rule: rule80 });
  assert.equal(split.riderTotal, 400);
  assert.equal(split.platformRevenue, 100);
  assert.equal(split.pickupAmount, 100);
  assert.equal(split.dropAmount, 300);
  assert.notEqual(split.pickupAmount, split.dropAmount);
  assert.notEqual(split.pickupAmount, split.riderTotal * 0.5);
});

test("UI redesign PRD Example 1: 100 fare, 90% rider, pickup 2km / drop 8km => pickup 18, drop 72", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 100, pickupKm: 2, dropKm: 8, rule: rule90 });
  assert.equal(split.riderTotal, 90);
  assert.equal(split.pickupRatio, 20);
  assert.equal(split.dropRatio, 80);
  assert.equal(split.pickupAmount, 18);
  assert.equal(split.dropAmount, 72);
});

test("UI redesign PRD Example 2: 100 fare, 90% rider, pickup 8km / drop 2km => pickup 72, drop 18 (ratio flips with distance)", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 100, pickupKm: 8, dropKm: 2, rule: rule90 });
  assert.equal(split.pickupRatio, 80);
  assert.equal(split.dropRatio, 20);
  assert.equal(split.pickupAmount, 72);
  assert.equal(split.dropAmount, 18);
});

test("UI redesign PRD Example 3: 100 fare, 90% rider, pickup 5km / drop 5km => pickup 45, drop 45 (equal ONLY because distances are equal)", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 100, pickupKm: 5, dropKm: 5, rule: rule90 });
  assert.equal(split.pickupRatio, 50);
  assert.equal(split.dropRatio, 50);
  assert.equal(split.pickupAmount, 45);
  assert.equal(split.dropAmount, 45);
});

test("zero distance: full riderTotal goes to pickup, drop is zero", () => {
  const split = calcServicePayoutRuleSplit({ customerFare: 95, pickupKm: 0, dropKm: 0, rule: rule90 });
  assert.equal(split.pickupAmount, 85.5);
  assert.equal(split.dropAmount, 0);
});

test("pickup + drop always sum to exactly riderTotal", () => {
  for (const [pickupKm, dropKm] of [[1, 1], [3, 7], [12, 0.5], [0, 0]] as const) {
    const split = calcServicePayoutRuleSplit({ customerFare: 137.35, pickupKm, dropKm, rule: rule90 });
    assert.equal(Math.round((split.pickupAmount + split.dropAmount) * 100) / 100, split.riderTotal);
  }
});
