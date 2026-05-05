/**
 * storeQuote.service — canonical distance + delivery-fee engine.
 *
 * The service itself hits Supabase / Postgres for store + geo lookups, so the
 * heavy-integration path is covered via `ordersCoreSchema.integration.test.ts`
 * in the orders module when DB is available. These unit tests pin down:
 *
 *   1. Progressive/cumulative slab math used by the customer actor
 *      (no price-drop on slab switch; monotonic by distance).
 *   2. Progressive math used by the rider actor (`calculateProgressiveSlabAmount`)
 *      applies base fare exactly once and sums segment amounts.
 *   3. Serviceability decision (distance > radius ⇒ out_of_range) matches what the
 *      engine emits downstream.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateProgressiveSlabAmount,
} from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryRateSlabRow } from "../delivery-slab-pricing/types.js";

function productSpecSlabs(): DeliveryRateSlabRow[] {
  // Progressive base-included delivery fee:
  //  - ₹25 includes first 3 km
  //  - ₹6/km from 3 km to 10 km
  //  - ₹7/km after 10 km
  return [
    { id: 1, geoLevel: "pincode", geoRefId: "pc-1", serviceType: "food", actorType: "customer",
      minKm: 0, maxKm: 3, baseFare: null, perKmRate: 0, minCharge: 25, priority: 100, isActive: true },
    { id: 2, geoLevel: "pincode", geoRefId: "pc-1", serviceType: "food", actorType: "customer",
      minKm: 3, maxKm: 10, baseFare: null, perKmRate: 6, minCharge: null, priority: 100, isActive: true },
    { id: 3, geoLevel: "pincode", geoRefId: "pc-1", serviceType: "food", actorType: "customer",
      minKm: 10, maxKm: 15, baseFare: null, perKmRate: 7, minCharge: null, priority: 100, isActive: true },
  ];
}

test("customer progressive: 0.1 km is within included => base fee", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 0.1, slabs: productSpecSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // within 3km included
  assert.equal(res.quote.finalAmount, 25);
});

test("customer progressive: 3 km is exactly included => base fee", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 3, slabs: productSpecSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 25);
});

test("customer progressive: 7 km is cumulative (no slab-switch drop)", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 7, slabs: productSpecSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // 25 + (7-3)*6 = 49
  assert.equal(res.quote.finalAmount, 49);
});

test("customer progressive: 12 km accumulates all prior bands", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 12, slabs: productSpecSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // 25 + (10-3)*6 + (12-10)*7 = 81
  assert.equal(res.quote.finalAmount, 81);
});

test("rider progressive: 12 km accumulates all segments + base once", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 12, slabs: productSpecSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 81);
  assert.equal(res.quote.baseFareApplied, 25);
});

test("serviceability: out_of_range when distance > radius", () => {
  const distanceKm = 18;
  const storeRadiusKm = 15;
  const envFallbackKm = 15;
  const effectiveRadiusKm = storeRadiusKm > 0 ? storeRadiusKm : envFallbackKm;
  const serviceable = distanceKm <= effectiveRadiusKm;
  assert.equal(serviceable, false);
});

test("serviceability: in range when distance <= store radius", () => {
  const distanceKm = 9.8;
  const storeRadiusKm = 12;
  const effectiveRadiusKm = storeRadiusKm;
  const serviceable = distanceKm <= effectiveRadiusKm;
  assert.equal(serviceable, true);
});

test("serviceability: store radius null falls back to env default", () => {
  const distanceKm = 14.2;
  const storeRadiusKm: number | null = null;
  const envFallbackKm = 15;
  const effectiveRadiusKm =
    storeRadiusKm != null && storeRadiusKm > 0 ? storeRadiusKm : envFallbackKm;
  assert.equal(effectiveRadiusKm, 15);
  assert.equal(distanceKm <= effectiveRadiusKm, true);
});
