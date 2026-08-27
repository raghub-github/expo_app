import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMerchantDistanceKm } from "./merchantDistance";

test("null / non-finite → null", () => {
  assert.equal(formatMerchantDistanceKm(null), null);
  assert.equal(formatMerchantDistanceKm(undefined), null);
  assert.equal(formatMerchantDistanceKm(NaN), null);
  assert.equal(formatMerchantDistanceKm(Infinity), null);
});

test("< 1 km → whole metres", () => {
  assert.equal(formatMerchantDistanceKm(0), null);
  assert.equal(formatMerchantDistanceKm(0.85), "850 m");
  assert.equal(formatMerchantDistanceKm(0.999), "999 m");
});

test(">= 1 km → one-decimal km", () => {
  assert.equal(formatMerchantDistanceKm(1), "1.0 km");
  assert.equal(formatMerchantDistanceKm(1.2), "1.2 km");
  assert.equal(formatMerchantDistanceKm(8), "8.0 km");
  assert.equal(formatMerchantDistanceKm(3.74), "3.7 km");
});

// Regression for the reported bug: the store-detail card previously used a bare
// `toFixed(1) km` (no metres branch), so a sub-km merchant read "0.8 km" on the
// store page but "800 m" on the list card. Both now route through this formatter,
// so the SAME value renders identically everywhere.
test("consistency: sub-km renders as metres everywhere (was '0.8 km' on store page)", () => {
  const km = 0.8;
  assert.equal(formatMerchantDistanceKm(km), "800 m");
});
