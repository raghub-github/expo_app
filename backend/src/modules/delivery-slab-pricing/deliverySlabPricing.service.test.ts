import test from "node:test";
import assert from "node:assert/strict";
import { calculateProgressiveSlabAmount } from "./deliverySlabPricing.service.js";
import type { DeliveryRateSlabRow } from "./types.js";

function slabsExample(): DeliveryRateSlabRow[] {
  return [
    // base fee (minCharge) includes first 1 km, then tiered per-km.
    { id: 1, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 0, maxKm: 1, baseFare: null, perKmRate: 10, minCharge: 30, priority: 100, isActive: true },
    { id: 2, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 1, maxKm: 3, baseFare: null, perKmRate: 8, minCharge: null, priority: 100, isActive: true },
    { id: 3, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 3, maxKm: 5, baseFare: null, perKmRate: 7, minCharge: null, priority: 100, isActive: true },
    { id: 4, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 5, maxKm: 7, baseFare: null, perKmRate: 6, minCharge: null, priority: 100, isActive: true },
    { id: 5, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 7, maxKm: 10, baseFare: null, perKmRate: 5, minCharge: null, priority: 100, isActive: true },
    { id: 6, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 10, maxKm: 15, baseFare: null, perKmRate: 4, minCharge: null, priority: 100, isActive: true },
  ];
}

test("0.5 km is within included distance => base fee", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 0.5, slabs: slabsExample() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // base fee (minCharge) includes first 1 km
  assert.equal(res.quote.baseFareApplied, 30);
  assert.equal(res.quote.finalAmount, 30);
});

test("2 km splits across 0-1 and 1-3; base only once", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 2, slabs: slabsExample() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // base 30 includes first 1km, then (2-1)*8 = 8 => 38
  assert.equal(res.quote.finalAmount, 38);
  assert.equal(res.quote.baseFareApplied, 30);
  // Segment charging starts after included_km (1km), so only one billed segment here.
  assert.equal(res.quote.segments.length, 1);
});

test("4.5 km splits across 0-1,1-3,3-5", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 4.5, slabs: slabsExample() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // base 30 includes first 1km, then 2*8 + 1.5*7 = 26.5 => 56.5
  assert.equal(res.quote.finalAmount, 56.5);
});

test("8 km uses slabs up to 7-10", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 8, slabs: slabsExample() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // base 30 includes first 1km, then 2*8 + 2*7 + 2*6 + 1*5 = 47 => 77
  assert.equal(res.quote.finalAmount, 77);
});

test("12 km uses 10-15 slab partially", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 12, slabs: slabsExample() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // base 30 includes first 1km, then 2*8 + 2*7 + 2*6 + 3*5 + 2*4 = 65 => 95
  assert.equal(res.quote.finalAmount, 95);
});

test("rejects overlap", () => {
  const bad: DeliveryRateSlabRow[] = [
    { id: 1, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 0, maxKm: 2, baseFare: 10, perKmRate: 1, minCharge: null, priority: 100, isActive: true },
    { id: 2, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 1, maxKm: 3, baseFare: null, perKmRate: 1, minCharge: null, priority: 100, isActive: true },
  ];
  const res = calculateProgressiveSlabAmount({ distanceKm: 2, slabs: bad });
  assert.equal(res.ok, false);
});

test("rejects gap", () => {
  const bad: DeliveryRateSlabRow[] = [
    { id: 1, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 0, maxKm: 1, baseFare: 10, perKmRate: 1, minCharge: null, priority: 100, isActive: true },
    { id: 2, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 2, maxKm: 3, baseFare: null, perKmRate: 1, minCharge: null, priority: 100, isActive: true },
  ];
  const res = calculateProgressiveSlabAmount({ distanceKm: 2.5, slabs: bad });
  assert.equal(res.ok, false);
});

test("customer progressive pricing: no price drop after slab switch (5km -> 6km)", () => {
  const slabs: DeliveryRateSlabRow[] = [
    // base fee 25 includes first 5km, then per-km beyond.
    { id: 10, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 0, maxKm: 5, baseFare: 23, perKmRate: 6, minCharge: 25, priority: 100, isActive: true },
    { id: 11, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 5, maxKm: 10, baseFare: null, perKmRate: 6, minCharge: 26, priority: 100, isActive: true },
    { id: 12, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 10, maxKm: 15, baseFare: null, perKmRate: 7, minCharge: 30, priority: 100, isActive: true },
  ];

  const at5 = calculateProgressiveSlabAmount({ distanceKm: 5, slabs });
  const at6 = calculateProgressiveSlabAmount({ distanceKm: 6, slabs });
  assert.equal(at5.ok, true);
  assert.equal(at6.ok, true);
  if (!at5.ok || !at6.ok) return;
  // 5km is within included distance => base fee
  assert.equal(at5.quote.finalAmount, 25);
  // 6km => base 25 + 1*6 = 31
  assert.equal(at6.quote.finalAmount, 31);
  assert.ok(at6.quote.finalAmount >= at5.quote.finalAmount);
});

test("base-included progressive example set: 25 includes first 3km, then 6/km to 10km, then 7/km", () => {
  const slabs: DeliveryRateSlabRow[] = [
    { id: 21, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 0, maxKm: 3, baseFare: null, perKmRate: 0, minCharge: 25, priority: 100, isActive: true },
    { id: 22, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 3, maxKm: 10, baseFare: null, perKmRate: 6, minCharge: null, priority: 100, isActive: true },
    { id: 23, geoLevel: "pincode", geoRefId: "x", serviceType: "food", actorType: "customer", minKm: 10, maxKm: 15, baseFare: null, perKmRate: 7, minCharge: null, priority: 100, isActive: true },
  ];

  const quote = (km: number) => {
    const res = calculateProgressiveSlabAmount({ distanceKm: km, slabs });
    assert.equal(res.ok, true);
    return res.ok ? res.quote.finalAmount : 0;
  };

  assert.equal(quote(2), 25);
  assert.equal(quote(3), 25);
  assert.equal(quote(3.2), 26.2);
  assert.equal(quote(5), 37);
  assert.equal(quote(7), 49);
  assert.equal(quote(10), 67);
  assert.equal(quote(12), 81);
  assert.equal(quote(15), 102);
});

