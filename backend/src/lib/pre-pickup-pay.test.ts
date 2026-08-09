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

test("prePickupAllowanceAmount: max caps the amount", () => {
  // ₹8/km × 5km = 40, capped at 30
  assert.equal(prePickupAllowanceAmount(8, 5000, null, 30), 30);
  // under the cap → unchanged
  assert.equal(prePickupAllowanceAmount(8, 2000, null, 30), 16);
});

test("prePickupAllowanceAmount: min floors a positive earned amount", () => {
  // ₹6/km × 0.5km = 3, floored to 10
  assert.equal(prePickupAllowanceAmount(6, 500, 10, null), 10);
  // already above the floor → unchanged
  assert.equal(prePickupAllowanceAmount(6, 3000, 10, null), 18);
});

test("prePickupAllowanceAmount: min never manufactures pay when rate is 0", () => {
  // zero rate stays 0 even with a floor configured (a location that pays nothing)
  assert.equal(prePickupAllowanceAmount(0, 5000, 10, null), 0);
});

test("prePickupAllowanceAmount: min and max together (min applied within cap)", () => {
  // 8×5=40 capped to 30, floor 12 → 30
  assert.equal(prePickupAllowanceAmount(8, 5000, 12, 30), 30);
  // 6×0.5=3 → floor 12 → 12 (still ≤ cap 30)
  assert.equal(prePickupAllowanceAmount(6, 500, 12, 30), 12);
});
