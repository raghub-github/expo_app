import assert from "node:assert/strict";
import { test } from "node:test";
import { prePickupAllowanceAmount, roundMoney } from "./pre-pickup-pay.js";

test("prePickupAllowanceAmount: rate x pickup distance", () => {
  assert.equal(prePickupAllowanceAmount(6, 3000), 18); // ₹6/km × 3km
  assert.equal(prePickupAllowanceAmount(6, 3500), 21); // 3.5km
  assert.equal(prePickupAllowanceAmount(10, 1200), 12); // ₹10/km × 1.2km
});

test("prePickupAllowanceAmount: zero rate is a no-op (behavior-preserving default)", () => {
  assert.equal(prePickupAllowanceAmount(0, 5000), 0);
});

test("prePickupAllowanceAmount: guards non-finite / negative inputs", () => {
  assert.equal(prePickupAllowanceAmount(Number.NaN, 3000), 0);
  assert.equal(prePickupAllowanceAmount(6, -100), 0);
  assert.equal(prePickupAllowanceAmount(6, Number.NaN), 0);
  assert.equal(prePickupAllowanceAmount(-6, 3000), 0);
});

test("prePickupAllowanceAmount: rounds to paise", () => {
  // 6.5 × 3.333 km = 21.6645 -> 21.66
  assert.equal(prePickupAllowanceAmount(6.5, 3333), 21.66);
  assert.equal(prePickupAllowanceAmount(6.5, 3333), roundMoney(6.5 * (3333 / 1000)));
});
