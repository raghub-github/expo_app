import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseGeocodeKey, sameReverseGeocodeCell } from "./reverseGeocodeCacheKey";

test("reverseGeocodeKey rounds to 4 decimals (lat,lon order)", () => {
  assert.equal(reverseGeocodeKey(76.99051, 29.68574), "29.6857,76.9905");
});

test("points within ~11 m share a cell", () => {
  // 0.00005° ≈ 5.5 m — rounds to the same 4-decimal cell.
  const a = { latitude: 29.68570, longitude: 76.99050 };
  const b = { latitude: 29.68573, longitude: 76.99052 };
  assert.equal(sameReverseGeocodeCell(a, b), true);
});

test("points ~20+ m apart fall in different cells", () => {
  const a = { latitude: 29.6857, longitude: 76.9905 };
  const b = { latitude: 29.6860, longitude: 76.9905 }; // ~33 m north
  assert.equal(sameReverseGeocodeCell(a, b), false);
});

test("null / undefined never share a cell", () => {
  assert.equal(sameReverseGeocodeCell(null, { latitude: 1, longitude: 1 }), false);
  assert.equal(sameReverseGeocodeCell({ latitude: 1, longitude: 1 }, undefined), false);
  assert.equal(sameReverseGeocodeCell(null, null), false);
});

test("identical coordinates share a cell", () => {
  const p = { latitude: 12.9716, longitude: 77.5946 };
  assert.equal(sameReverseGeocodeCell(p, { ...p }), true);
});
