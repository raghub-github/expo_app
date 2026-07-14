import test from "node:test";
import assert from "node:assert/strict";
import {
  calcCumulativeDistanceCharge,
  calcCustomerSlabPrice,
  calcRidePreviewBreakdown,
  calcWaitingCharge,
  getActiveSortedSlabs,
} from "../slabPricingEngine";

test("Test 5 — Inactive slab ignored", () => {
  const slabs = [
    { id: 1, minKm: 0, maxKm: 2, perKmRate: 10, baseFare: 0, isActive: true, priority: 100 },
    { id: 2, minKm: 2, maxKm: 5, perKmRate: 99, isActive: false, priority: 100 },
    { id: 3, minKm: 2, maxKm: 5, perKmRate: 4, isActive: true, priority: 100 },
  ];
  const quote = calcCustomerSlabPrice({ distanceKm: 4, slabs });
  assert.ok(quote);
  // 0-2: 20, 2-4: 8 => 28
  assert.equal(quote.finalAmount, 28);
});

test("Test 6 — Missing first slab with minKm=0 does not crash", () => {
  const slabs = [
    { id: 1, minKm: 2, maxKm: 5, perKmRate: 5, baseFare: 20, isActive: true, priority: 100 },
  ];
  const quote = calcCustomerSlabPrice({ distanceKm: 3, slabs });
  assert.ok(quote);
  assert.equal(quote.baseFare, 0);
  assert.equal(quote.distanceAmount, 5); // only 2-3 km band
  assert.equal(quote.finalAmount, 5);
});

test("Test 7 — Customer pricing base + cumulative distance + min charge", () => {
  const slabs = [
    { id: 1, minKm: 0, maxKm: 2, baseFare: 25, perKmRate: 6, minCharge: 30, isActive: true, priority: 100 },
    { id: 2, minKm: 2, maxKm: 5, perKmRate: 8, isActive: true, priority: 100 },
    { id: 3, minKm: 5, maxKm: null, perKmRate: 10, isActive: true, priority: 100 },
  ];

  const short = calcCustomerSlabPrice({ distanceKm: 1, slabs });
  assert.ok(short);
  assert.equal(short.baseFare, 25);
  assert.equal(short.distanceAmount, 6);
  assert.equal(short.subtotalBeforeMin, 31);
  assert.equal(short.finalAmount, 31);

  const floored = calcCustomerSlabPrice({ distanceKm: 0.5, slabs });
  assert.ok(floored);
  assert.equal(floored.distanceAmount, 3);
  assert.equal(floored.subtotalBeforeMin, 28);
  assert.equal(floored.finalAmount, 30);
  assert.equal(floored.minChargeAdjustment, 2);

  const long = calcCustomerSlabPrice({ distanceKm: 6, slabs });
  assert.ok(long);
  // base 25 + 2*6 + 3*8 + 1*10 = 25+12+24+10 = 71
  assert.equal(long.finalAmount, 71);
});

test("Test 8 — Ride customer preview uses shared engine mapping", () => {
  const customerSlabs = [
    { id: 1, minKm: 0, maxKm: 3, baseFare: 40, perKmRate: 5, minCharge: 45, isActive: true, priority: 100 },
    { id: 2, minKm: 3, maxKm: null, perKmRate: 8, isActive: true, priority: 100 },
  ];

  const customer = calcRidePreviewBreakdown({
    mode: "customer",
    tripKm: 5,
    slabs: customerSlabs,
  });
  assert.ok(customer);
  assert.equal(customer.mode, "customer");
  if (customer.mode !== "customer") return;
  // base 40 + 3*5 + 2*8 = 40+15+16 = 71
  assert.equal(customer.finalAmount, 71);
});

test("calcWaitingCharge uses free wait threshold", () => {
  assert.equal(calcWaitingCharge(5, 3, 1), 2);
  assert.equal(calcWaitingCharge(3, 3, 1), 0);
  assert.equal(calcWaitingCharge(2, 3, 1), 0);
  assert.equal(calcWaitingCharge(10, 5, 1.5), 7.5);
});

test("calcCumulativeDistanceCharge sanitizes malformed values", () => {
  const { amount } = calcCumulativeDistanceCharge("bad", [
    { minKm: 0, maxKm: 2, rate: 3, isActive: true },
  ]);
  assert.equal(amount, 0);

  const sorted = getActiveSortedSlabs([
    { minKm: 5, maxKm: 10, isActive: true },
    { minKm: 0, maxKm: 2, isActive: true },
  ]);
  assert.equal(sorted[0]?.minKm, 0);
});
