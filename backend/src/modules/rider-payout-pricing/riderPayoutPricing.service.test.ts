import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePercentageRiderPayout,
  calculateWaitingCharge,
} from "./riderPayoutPricing.service.js";
import type { ServicePayoutRuleRow } from "./types.js";

const baseRule: ServicePayoutRuleRow = {
  id: 1,
  serviceType: "food",
  vehicleType: null,
  geoLevel: "state",
  geoRefId: "x",
  riderPercentage: 90,
  platformPercentage: 10,
  waitingChargePerMin: 1,
  waitingFreeMinutes: 3,
  waitingMaxCharge: null,
  waitingFundingMode: "CUSTOMER_100",
  waitingCustomerSharePct: 100,
  waitingCompanySharePct: 0,
  priority: 100,
  isActive: true,
  effectiveFrom: null,
  effectiveTo: null,
};

test("waiting charge: free until startAfter minutes", () => {
  assert.equal(calculateWaitingCharge({ waitingMinutes: 2, chargePerMin: 1, startAfterMinutes: 3 }), 0);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 3, chargePerMin: 1, startAfterMinutes: 3 }), 0);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 5, chargePerMin: 1, startAfterMinutes: 3 }), 2);
});

test("PRD example: 95 fare, 90% rider, 7km/2km => pickup 66.50+wait, drop 19.00, platform 9.50", () => {
  const res = calculatePercentageRiderPayout({
    customerFare: 95,
    pickupKm: 7,
    dropKm: 2,
    rule: baseRule,
    waitingMinutes: 5,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // wait 5min, free 3min, 1/min => 2 charged, added to pickup leg
  assert.equal(res.quote.pickupAmount, 68.5);
  assert.equal(res.quote.dropAmount, 19);
  assert.equal(res.quote.platformRevenue, 9.5);
  assert.equal(res.quote.finalAmount, 87.5);
});

test("waiting charge is not counted toward the rider percentage split", () => {
  const withoutWait = calculatePercentageRiderPayout({
    customerFare: 95,
    pickupKm: 7,
    dropKm: 2,
    rule: baseRule,
    waitingMinutes: 0,
  });
  const withWait = calculatePercentageRiderPayout({
    customerFare: 95,
    pickupKm: 7,
    dropKm: 2,
    rule: baseRule,
    waitingMinutes: 10,
  });
  assert.equal(withoutWait.ok, true);
  assert.equal(withWait.ok, true);
  if (!withoutWait.ok || !withWait.ok) return;
  assert.equal(withWait.quote.platformRevenue, withoutWait.quote.platformRevenue);
  assert.equal(withWait.quote.dropAmount, withoutWait.quote.dropAmount);
  assert.ok(withWait.quote.pickupAmount > withoutWait.quote.pickupAmount);
});

test("surge_wait_max_only blocks waiting and surges for non-Max riders", () => {
  const res = calculatePercentageRiderPayout({
    customerFare: 95,
    pickupKm: 1,
    dropKm: 1,
    rule: baseRule,
    waitingMinutes: 10,
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: true,
    appliedSurges: [{ surgeId: 1, name: "Rain", kind: "rain", amount: 10 }],
    rawSurgeTotal: 10,
    surgeTotal: 10,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.waitingAmount, 0);
  assert.equal(res.quote.surgeTotal, 0);
});

test("surge adds to rider payout total on top of the percentage split", () => {
  const res = calculatePercentageRiderPayout({
    customerFare: 95,
    pickupKm: 7,
    dropKm: 2,
    rule: baseRule,
    waitingMinutes: 0,
    appliedSurges: [{ surgeId: 1, name: "Peak", kind: "peak_hour", amount: 15 }],
    rawSurgeTotal: 15,
    surgeTotal: 15,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 100.5); // 85.50 rider total + 15 surge
});

test("v2 PRD admin-calculator example: 520 fare, 80% rider, 5km/15km, wait 6, surge 20 => final 442, platform 104", () => {
  const rule: ServicePayoutRuleRow = {
    ...baseRule,
    riderPercentage: 80,
    platformPercentage: 20,
    waitingChargePerMin: 2,
    waitingFreeMinutes: 2,
  };
  const res = calculatePercentageRiderPayout({
    customerFare: 520,
    pickupKm: 5,
    dropKm: 15,
    rule,
    waitingMinutes: 5, // 5 - 2 free = 3 chargeable * 2/min = 6
    appliedSurges: [{ surgeId: 1, name: "Peak", kind: "peak_hour", amount: 20 }],
    rawSurgeTotal: 20,
    surgeTotal: 20,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.platformRevenue, 104);
  // pickup/drop split by distance ratio (25%/75% of riderTotal=416), waiting added to pickup leg
  assert.equal(res.quote.dropAmount, 312);
  assert.equal(res.quote.pickupAmount, 104 + 6); // 104 distance share + 6 waiting
  assert.equal(res.quote.waitingAmount, 6);
  assert.equal(res.quote.surgeTotal, 20);
  assert.equal(res.quote.finalAmount, 442);
});

test("zero customer fare is rejected", () => {
  const res = calculatePercentageRiderPayout({
    customerFare: 0,
    pickupKm: 5,
    dropKm: 5,
    rule: baseRule,
  });
  assert.equal(res.ok, false);
});
