import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRiderPickupDropPayout,
  calculateWaitingCharge,
} from "./riderPayoutPricing.service.js";
import type { RiderDropSlabRow, RiderPickupSlabRow } from "./types.js";

const pickupSlabs: RiderPickupSlabRow[] = [
  {
    id: 1,
    geoLevel: "state",
    geoRefId: "x",
    minKm: 0,
    maxKm: 2,
    baseFare: 8,
    pickupPerKm: 3,
    minCharge: 12,
    waitingChargePerMin: 1,
    waitingStartAfter: 3,
    priority: 100,
    isActive: true,
  },
  { id: 2, geoLevel: "state", geoRefId: "x", minKm: 2, maxKm: 4, pickupPerKm: 4, minCharge: null, waitingChargePerMin: null, waitingStartAfter: 0, priority: 100, isActive: true },
  { id: 3, geoLevel: "state", geoRefId: "x", minKm: 4, maxKm: 7, pickupPerKm: 5, minCharge: null, waitingChargePerMin: null, waitingStartAfter: 0, priority: 100, isActive: true },
  { id: 4, geoLevel: "state", geoRefId: "x", minKm: 7, maxKm: null, pickupPerKm: 6, minCharge: null, waitingChargePerMin: null, waitingStartAfter: 0, priority: 100, isActive: true },
];

const dropSlabs: RiderDropSlabRow[] = [
  { id: 10, geoLevel: "state", geoRefId: "x", minKm: 0, maxKm: 2, dropPerKm: 8, priority: 100, isActive: true },
  { id: 11, geoLevel: "state", geoRefId: "x", minKm: 2, maxKm: 4, dropPerKm: 9, priority: 100, isActive: true },
  { id: 12, geoLevel: "state", geoRefId: "x", minKm: 4, maxKm: 7, dropPerKm: 9, priority: 100, isActive: true },
  { id: 13, geoLevel: "state", geoRefId: "x", minKm: 7, maxKm: 10, dropPerKm: 10, priority: 100, isActive: true },
  { id: 14, geoLevel: "state", geoRefId: "x", minKm: 10, maxKm: null, dropPerKm: 10, priority: 100, isActive: true },
];

test("waiting charge: free until startAfter minutes", () => {
  assert.equal(calculateWaitingCharge({ waitingMinutes: 2, chargePerMin: 1, startAfterMinutes: 3 }), 0);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 3, chargePerMin: 1, startAfterMinutes: 3 }), 0);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 5, chargePerMin: 1, startAfterMinutes: 3 }), 2);
});

test("Food rider payout via backend wrapper: pickup 3 drop 5 wait 5 = 63", () => {
  const res = calculateRiderPickupDropPayout({
    pickupKm: 3,
    dropKm: 5,
    pickupSlabs,
    dropSlabs,
    waitingMinutes: 5,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.baseFareApplied, 8);
  assert.equal(res.quote.pickupAmount, 10);
  assert.equal(res.quote.dropAmount, 43);
  assert.equal(res.quote.waitingAmount, 2);
  assert.equal(res.quote.finalAmount, 63);
});

test("surge_wait_max_only blocks waiting and surges for non-Max riders", () => {
  const res = calculateRiderPickupDropPayout({
    pickupKm: 1,
    dropKm: 1,
    pickupSlabs,
    dropSlabs,
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

test("surge adds to rider payout total", () => {
  const res = calculateRiderPickupDropPayout({
    pickupKm: 3,
    dropKm: 5,
    pickupSlabs,
    dropSlabs,
    waitingMinutes: 0,
    appliedSurges: [{ surgeId: 1, name: "Peak", kind: "peak_hour", amount: 15 }],
    rawSurgeTotal: 15,
    surgeTotal: 15,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 76);
});
