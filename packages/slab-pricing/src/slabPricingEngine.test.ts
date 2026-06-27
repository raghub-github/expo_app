import test from "node:test";
import assert from "node:assert/strict";
import {
  calcCustomerSlabPrice,
  calcDropPayout,
  calcPickupPayout,
  calcRiderPayoutBreakdown,
} from "./slabPricingEngine";

const foodCustomerSlabs = [
  { id: 1, minKm: 0, maxKm: 2, baseFare: 19, perKmRate: 6, minCharge: 25, isActive: true, priority: 100 },
  { id: 2, minKm: 2, maxKm: 4, perKmRate: 7, isActive: true, priority: 100 },
  { id: 3, minKm: 4, maxKm: 7, perKmRate: 8, isActive: true, priority: 100 },
  { id: 4, minKm: 7, maxKm: 10, perKmRate: 9, isActive: true, priority: 100 },
  { id: 5, minKm: 10, maxKm: null, perKmRate: 11, isActive: true, priority: 100 },
];

const pickupSlabs = [
  {
    id: 1,
    minKm: 0,
    maxKm: 2,
    baseFare: 8,
    pickupPerKm: 3,
    minCharge: 12,
    waitingChargePerMin: 1,
    waitingStartAfter: 3,
    isActive: true,
    priority: 100,
  },
  { id: 2, minKm: 2, maxKm: 4, pickupPerKm: 4, isActive: true, priority: 100 },
  { id: 3, minKm: 4, maxKm: 7, pickupPerKm: 5, isActive: true, priority: 100 },
  { id: 4, minKm: 7, maxKm: null, pickupPerKm: 6, isActive: true, priority: 100 },
];

const dropSlabs = [
  { id: 1, minKm: 0, maxKm: 2, dropPerKm: 8, isActive: true, priority: 100 },
  { id: 2, minKm: 2, maxKm: 4, dropPerKm: 9, isActive: true, priority: 100 },
  { id: 3, minKm: 4, maxKm: 7, dropPerKm: 9, isActive: true, priority: 100 },
  { id: 4, minKm: 7, maxKm: 10, dropPerKm: 10, isActive: true, priority: 100 },
  { id: 5, minKm: 10, maxKm: null, dropPerKm: 10, isActive: true, priority: 100 },
];

test("Food customer: 5 km cumulative delivery fee = 53", () => {
  const quote = calcCustomerSlabPrice({ distanceKm: 5, slabs: foodCustomerSlabs });
  assert.ok(quote);
  assert.equal(quote.baseFare, 19);
  assert.equal(quote.distanceAmount, 34);
  assert.equal(quote.finalAmount, 53);
});

test("Food rider: pickup 3, drop 5, wait 5 => payout 63", () => {
  const rider = calcRiderPayoutBreakdown({
    pickupKm: 3,
    dropKm: 5,
    pickupSlabs,
    dropSlabs,
    waitingMinutes: 5,
  });
  assert.ok(rider);
  assert.equal(rider.baseFare, 8);
  assert.equal(rider.pickupAmount, 10);
  assert.equal(rider.dropAmount, 43);
  assert.equal(rider.waitingAmount, 2);
  assert.equal(rider.finalAmount, 63);
});

test("pickup min charge applies on pickup leg only", () => {
  const pickup = calcPickupPayout({ pickupKm: 1, slabs: pickupSlabs, waitingMinutes: 5 });
  assert.ok(pickup);
  assert.equal(pickup.pickupPayout, 12);
  assert.equal(pickup.waitingAmount, 2);
});

test("drop cumulative across bands", () => {
  const drop = calcDropPayout({ dropKm: 5, slabs: dropSlabs });
  assert.ok(drop);
  assert.equal(drop.dropAmount, 43);
});
