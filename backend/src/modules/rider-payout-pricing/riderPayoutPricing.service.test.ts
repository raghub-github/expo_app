import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRiderPickupDropPayout,
  calculateWaitingCharge,
} from "./riderPayoutPricing.service.js";
import type { RiderDropSlabRow, RiderPickupSlabRow } from "./types.js";

function pickupSlabs(): RiderPickupSlabRow[] {
  return [
    {
      id: 1,
      geoLevel: "state",
      geoRefId: "x",
      minKm: 0,
      maxKm: 2,
      baseFare: 20,
      pickupPerKm: 5,
      minCharge: null,
      waitingChargePerMin: 1,
      waitingStartAfter: 3,
      priority: 100,
      isActive: true,
    },
    {
      id: 2,
      geoLevel: "state",
      geoRefId: "x",
      minKm: 2,
      maxKm: null,
      baseFare: null,
      pickupPerKm: 3,
      minCharge: null,
      waitingChargePerMin: null,
      waitingStartAfter: 0,
      priority: 100,
      isActive: true,
    },
  ];
}

function dropSlabs(): RiderDropSlabRow[] {
  return [
    {
      id: 10,
      geoLevel: "state",
      geoRefId: "x",
      minKm: 0,
      maxKm: 2,
      dropPerKm: 4,
      priority: 100,
      isActive: true,
    },
    {
      id: 11,
      geoLevel: "state",
      geoRefId: "x",
      minKm: 2,
      maxKm: null,
      dropPerKm: 2,
      priority: 100,
      isActive: true,
    },
  ];
}

test("waiting charge: free until startAfter minutes", () => {
  assert.equal(calculateWaitingCharge({ waitingMinutes: 2, chargePerMin: 1, startAfterMinutes: 3 }), 0);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 3, chargePerMin: 1, startAfterMinutes: 3 }), 0);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 5, chargePerMin: 1, startAfterMinutes: 3 }), 2);
  assert.equal(calculateWaitingCharge({ waitingMinutes: 8, chargePerMin: 1, startAfterMinutes: 3 }), 5);
});

test("rider payout: base + pickup + drop + waiting + fixed surges", () => {
  const res = calculateRiderPickupDropPayout({
    pickupKm: 3,
    dropKm: 4,
    pickupSlabs: pickupSlabs(),
    dropSlabs: dropSlabs(),
    waitingMinutes: 5,
    riderHasGmitraMax: false,
    appliedSurges: [
      { surgeId: 1, name: "Peak Hour Surge", kind: "peak_hour", amount: 15 },
    ],
    rawSurgeTotal: 15,
    surgeTotal: 15,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.pickupAmount, 3);
  assert.equal(res.quote.dropAmount, 4);
  assert.equal(res.quote.waitingAmount, 2);
  assert.equal(res.quote.subtotalBeforeSurge, 29);
  assert.equal(res.quote.surgeTotal, 15);
  assert.equal(res.quote.finalAmount, 44);
});

test("surge_wait_max_only blocks waiting and surges for non-Max riders", () => {
  const res = calculateRiderPickupDropPayout({
    pickupKm: 1,
    dropKm: 1,
    pickupSlabs: pickupSlabs(),
    dropSlabs: dropSlabs(),
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

test("surge cap limits total surge amount", () => {
  const res = calculateRiderPickupDropPayout({
    pickupKm: 1,
    dropKm: 1,
    pickupSlabs: pickupSlabs(),
    dropSlabs: dropSlabs(),
    waitingMinutes: 0,
    appliedSurges: [
      { surgeId: 1, name: "A", kind: "custom", amount: 30 },
      { surgeId: 2, name: "B", kind: "custom", amount: 30 },
    ],
    rawSurgeTotal: 60,
    surgeTotal: 50,
    surgeCapped: true,
    maxTotalSurgeAmount: 50,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.surgeCapped, true);
  assert.equal(res.quote.surgeTotal, 50);
});
