import test from "node:test";
import assert from "node:assert/strict";
import {
  calcCumulativeDistanceCharge,
  calcCustomerSlabPrice,
  calcDropPayout,
  calcPickupPayout,
  calcRidePreviewBreakdown,
  calcRiderPreviewBreakdown,
  calcWaitingCharge,
  getActiveSortedSlabs,
} from "../slabPricingEngine";

const pickupSlabsExample = [
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

const dropSlabsExample = [
  { id: 1, minKm: 0, maxKm: 2, dropPerKm: 8, isActive: true, priority: 100 },
  { id: 2, minKm: 2, maxKm: 4, dropPerKm: 9, isActive: true, priority: 100 },
  { id: 3, minKm: 4, maxKm: 7, dropPerKm: 9, isActive: true, priority: 100 },
  { id: 4, minKm: 7, maxKm: 10, dropPerKm: 10, isActive: true, priority: 100 },
  { id: 5, minKm: 10, maxKm: null, dropPerKm: 10, isActive: true, priority: 100 },
];

test("Test 1 — Food rider cumulative example", () => {
  const pickup = calcPickupPayout({
    pickupKm: 3,
    slabs: pickupSlabsExample,
    waitingMinutes: 0,
  });
  assert.ok(pickup);
  assert.equal(pickup.baseFare, 8);
  assert.equal(pickup.distanceAmount, 10);
  assert.equal(pickup.pickupPayout, 18);

  const drop = calcDropPayout({ dropKm: 5, slabs: dropSlabsExample });
  assert.ok(drop);
  assert.equal(drop.dropAmount, 43);

  const rider = calcRiderPreviewBreakdown({
    pickupKm: 3,
    dropKm: 5,
    pickupSlabs: pickupSlabsExample,
    dropSlabs: dropSlabsExample,
    waitingMinutes: 0,
    service: "food",
  });
  assert.ok(rider);
  assert.equal(rider.baseFare, 8);
  assert.equal(rider.pickupAmount, 10);
  assert.equal(rider.dropAmount, 43);
  assert.equal(rider.waitingAmount, 0);
  assert.equal(rider.finalAmount, 61);
});

test("Test 2 — Min charge applies on pickup leg", () => {
  const pickup = calcPickupPayout({
    pickupKm: 1,
    slabs: pickupSlabsExample,
    waitingMinutes: 5,
  });
  assert.ok(pickup);
  assert.equal(pickup.pickupPayout, 12);
  assert.equal(pickup.waitingAmount, 2);

  const drop = calcDropPayout({ dropKm: 1, slabs: dropSlabsExample });
  assert.ok(drop);
  assert.equal(drop.dropAmount, 8);

  const rider = calcRiderPreviewBreakdown({
    pickupKm: 1,
    dropKm: 1,
    pickupSlabs: pickupSlabsExample,
    dropSlabs: dropSlabsExample,
    waitingMinutes: 5,
    service: "food",
  });
  assert.ok(rider);
  assert.equal(rider.finalAmount, 22);
});

test("Test 3 — Long distance across all slabs", () => {
  const pickup = calcPickupPayout({ pickupKm: 10, slabs: pickupSlabsExample });
  assert.ok(pickup);
  // 0-2: 6, 2-4: 8, 4-7: 15, 7+: 18
  assert.equal(pickup.distanceAmount, 47);

  const drop = calcDropPayout({ dropKm: 15, slabs: dropSlabsExample });
  assert.ok(drop);
  // 0-2:16, 2-4:18, 4-7:27, 7-10:30, 10+:50
  assert.equal(drop.dropAmount, 141);
});

test("Test 4 — Open-ended slab", () => {
  const slabs = [
    { id: 1, minKm: 0, maxKm: 2, dropPerKm: 5, isActive: true, priority: 100 },
    { id: 2, minKm: 2, maxKm: null, dropPerKm: 7, isActive: true, priority: 100 },
  ];
  const at5 = calcDropPayout({ dropKm: 5, slabs });
  assert.ok(at5);
  assert.equal(at5.dropAmount, 31); // 2*5 + 3*7

  const at20 = calcDropPayout({ dropKm: 20, slabs });
  assert.ok(at20);
  assert.equal(at20.dropAmount, 136); // 10 + 18*7
});

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

test("Test 8 — Ride preview uses shared engine mapping", () => {
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

  const rider = calcRidePreviewBreakdown({
    mode: "rider",
    pickupKm: 3,
    dropKm: 5,
    pickupSlabs: pickupSlabsExample,
    dropSlabs: dropSlabsExample,
    waitingMinutes: 0,
  });
  assert.ok(rider);
  assert.equal(rider.mode, "rider");
  if (rider.mode !== "rider") return;
  assert.equal(rider.finalAmount, 61);
});

test("calcWaitingCharge uses free wait threshold", () => {
  assert.equal(calcWaitingCharge(5, 3, 1), 2);
  assert.equal(calcWaitingCharge(3, 3, 1), 0);
  assert.equal(calcWaitingCharge(2, 3, 1), 0);
  assert.equal(calcWaitingCharge(10, 5, 1.5), 7.5);
});

test("rider preview applies fixed surge after subtotal", () => {
  const rider = calcRiderPreviewBreakdown({
    pickupKm: 0,
    dropKm: 12,
    pickupSlabs: [
      {
        id: 1,
        minKm: 0,
        maxKm: null,
        baseFare: 9,
        pickupPerKm: 7,
        minCharge: 12,
        waitingChargePerMin: 1.5,
        waitingStartAfter: 5,
        isActive: true,
        priority: 100,
      },
    ],
    dropSlabs: [{ id: 1, minKm: 0, maxKm: null, dropPerKm: 3, isActive: true, priority: 100 }],
    waitingMinutes: 5,
    service: "ride",
    vehicleType: "2_wheeler",
    surgeDefinitions: [
      {
        id: 1,
        name: "Peak Hour Surge",
        surgeType: "fixed",
        amount: 10,
        priority: 100,
        isEnabled: true,
        gmitraMaxOnly: false,
        appliesFood: true,
        appliesParcel: true,
        appliesRide: true,
        vehicleType: "all",
        manualActive: false,
      },
    ],
    surgeTimeSlots: [],
    forceActiveSurgeIds: [1],
  });
  assert.ok(rider);
  assert.equal(rider!.subtotalBeforeSurge, 48);
  assert.equal(rider!.surgeTotal, 10);
  assert.equal(rider!.finalAmount, 58);
});

test("rider preview applies percentage surge on subtotal", () => {
  const rider = calcRiderPreviewBreakdown({
    pickupKm: 0,
    dropKm: 12,
    pickupSlabs: [
      {
        id: 1,
        minKm: 0,
        maxKm: null,
        baseFare: 9,
        pickupPerKm: 7,
        minCharge: 12,
        waitingChargePerMin: 1.5,
        waitingStartAfter: 5,
        isActive: true,
        priority: 100,
      },
    ],
    dropSlabs: [{ id: 1, minKm: 0, maxKm: null, dropPerKm: 3, isActive: true, priority: 100 }],
    waitingMinutes: 0,
    service: "ride",
    vehicleType: "2_wheeler",
    surgeDefinitions: [
      {
        id: 2,
        name: "Night Surge",
        surgeType: "percentage",
        amount: 10,
        priority: 100,
        isEnabled: true,
        gmitraMaxOnly: false,
        appliesFood: true,
        appliesParcel: true,
        appliesRide: true,
        vehicleType: "all",
        manualActive: false,
      },
    ],
    surgeTimeSlots: [],
    forceActiveSurgeIds: [2],
  });
  assert.ok(rider);
  assert.equal(rider!.subtotalBeforeSurge, 48);
  assert.equal(rider!.surgeTotal, 4.8);
  assert.equal(rider!.finalAmount, 52.8);
});

test("calcCumulativeDistanceCharge sanitizes malformed values", () => {
  const { amount } = calcCumulativeDistanceCharge("bad", [
    { minKm: 0, maxKm: 2, rate: "3", isActive: true },
  ]);
  assert.equal(amount, 0);

  const sorted = getActiveSortedSlabs([
    { minKm: 5, maxKm: 10, isActive: true },
    { minKm: 0, maxKm: 2, isActive: true },
  ]);
  assert.equal(sorted[0]?.minKm, 0);
});
