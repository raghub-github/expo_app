import assert from "node:assert/strict";
import { test } from "node:test";
import { isStoreVegEligible } from "./veg-store-resolver.js";

test("explicitly declared pure-veg store is always eligible", () => {
  assert.equal(
    isStoreVegEligible({ isPureVeg: true, visibleItemCount: 0, allVisibleVeg: null }),
    true
  );
  // even if the (stale) menu aggregation says not-all-veg, the explicit flag wins
  assert.equal(
    isStoreVegEligible({ isPureVeg: true, visibleItemCount: 5, allVisibleVeg: false }),
    true
  );
});

test("all-veg menu store is eligible even without the flag (the golgappa case)", () => {
  assert.equal(
    isStoreVegEligible({ isPureVeg: false, visibleItemCount: 2, allVisibleVeg: true }),
    true
  );
});

test("store with any non-veg visible item is not eligible", () => {
  assert.equal(
    isStoreVegEligible({ isPureVeg: false, visibleItemCount: 4, allVisibleVeg: false }),
    false
  );
});

test("store with no visible items is not eligible (fail-closed, no over-claim)", () => {
  assert.equal(
    isStoreVegEligible({ isPureVeg: false, visibleItemCount: 0, allVisibleVeg: null }),
    false
  );
});

test("null aggregation with a positive count is treated as not-all-veg", () => {
  // Defensive: bool_and can only be null when zero rows matched, but guard anyway.
  assert.equal(
    isStoreVegEligible({ isPureVeg: false, visibleItemCount: 3, allVisibleVeg: null }),
    false
  );
});

test("boundary: exactly one visible veg item is eligible", () => {
  assert.equal(
    isStoreVegEligible({ isPureVeg: false, visibleItemCount: 1, allVisibleVeg: true }),
    true
  );
});
