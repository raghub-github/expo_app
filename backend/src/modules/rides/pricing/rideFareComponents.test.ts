import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRideComponentBreakdown,
  extractRideChargeComponents,
  extractRideDiscountAmount,
  RIDE_FARE_CHARGE_SUBTYPES,
  RIDE_FARE_DISCOUNT_SUBTYPES,
} from "./rideFareComponents.js";

test("component extractor: buckets ride charges into typed component fields", () => {
  const bag = extractRideChargeComponents([
    { label: "Night", amount: 25, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT } },
    { label: "Airport", amount: 40, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.AIRPORT } },
    { label: "Toll", amount: 15, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.TOLL } },
  ]);
  assert.equal(bag.nightCharge, 25);
  assert.equal(bag.airportCharge, 40);
  assert.equal(bag.tollCharge, 15);
  assert.equal(bag.waitingCharge, 0);
});

test("component extractor: stacks multiple rows of the same subtype", () => {
  const bag = extractRideChargeComponents([
    { label: "Base night", amount: 10, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT } },
    { label: "Extended night", amount: 5.5, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT } },
  ]);
  assert.equal(bag.nightCharge, 15.5);
});

test("component extractor: ignores charges without a recognised subtype", () => {
  const bag = extractRideChargeComponents([
    { label: "Platform fee", amount: 100, meta: { chargeSubtype: "PLATFORM_FLAT" } },
    { label: "Untagged", amount: 20, meta: {} },
    { label: "No meta", amount: 5 },
  ]);
  assert.deepEqual(bag, {
    waitingCharge: 0,
    nightCharge: 0,
    peakHourCharge: 0,
    festivalCharge: 0,
    airportCharge: 0,
    tollCharge: 0,
    extraStopsCharge: 0,
  });
});

test("component extractor: tolerates string amounts (numeric FROM DB)", () => {
  const bag = extractRideChargeComponents([
    {
      label: "Peak",
      amount: "12.34" as unknown as number,
      meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.PEAK },
    },
  ]);
  assert.equal(bag.peakHourCharge, 12.34);
});

test("discount extractor: returns the Bike Lite discount total", () => {
  const total = extractRideDiscountAmount(
    [
      {
        label: "Bike Lite discount",
        amount: 12,
        meta: { chargeSubtype: RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE },
      },
      { label: "First ride", amount: 50, meta: { chargeSubtype: "PROMO_FIRST" } },
    ],
    RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE
  );
  assert.equal(total, 12);
});

test("discount extractor: returns 0 when the subtype is not present", () => {
  const total = extractRideDiscountAmount(
    [{ label: "Coupon", amount: 30, meta: { chargeSubtype: "PROMO_FIRST" } }],
    RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE
  );
  assert.equal(total, 0);
});

test("component breakdown: returns charge + discount lines with default labels", () => {
  const lines = buildRideComponentBreakdown(
    [
      { label: "", amount: 20, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT } },
      { label: "Custom peak", amount: 30, meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.PEAK } },
      { label: "unknown", amount: 5, meta: { chargeSubtype: "OTHER_X" } },
    ],
    [
      {
        label: "",
        amount: 12,
        meta: { chargeSubtype: RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE },
      },
      { label: "Random promo", amount: 15, meta: { chargeSubtype: "PROMO_X" } },
    ]
  );
  assert.deepEqual(lines, [
    {
      subtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT,
      label: "Night surcharge",
      amount: 20,
      kind: "charge",
    },
    {
      subtype: RIDE_FARE_CHARGE_SUBTYPES.PEAK,
      label: "Custom peak",
      amount: 30,
      kind: "charge",
    },
    {
      subtype: RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE,
      label: "Bike Lite discount",
      amount: 12,
      kind: "discount",
    },
  ]);
});

test("component breakdown: drops zero-amount lines", () => {
  const lines = buildRideComponentBreakdown(
    [
      {
        label: "Zero night",
        amount: 0,
        meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT },
      },
    ],
    []
  );
  assert.equal(lines.length, 0);
});
