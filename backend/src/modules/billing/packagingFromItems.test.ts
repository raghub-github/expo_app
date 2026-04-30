import test from "node:test";
import assert from "node:assert/strict";
import { computeItemPackagingTotal, sumItemPackagingFromSnapshots } from "./packagingFromItems.js";

test("sumItemPackagingFromSnapshots multiplies per-item packaging by quantity", () => {
  const items = [
    { menuItemId: 1, itemName: "A", quantity: 2, basePrice: 100, variantId: null, variantName: null, addons: [], itemSnapshot: { packaging_enabled: true, packaging_charges: 3 } },
    { menuItemId: 2, itemName: "B", quantity: 1, basePrice: 50, variantId: null, variantName: null, addons: [], itemSnapshot: { packaging_enabled: true, packaging_charges: 5 } },
    { menuItemId: 3, itemName: "C", quantity: 4, basePrice: 10, variantId: null, variantName: null, addons: [], itemSnapshot: { packaging_enabled: false, packaging_charges: 99 } },
  ] as any;
  assert.equal(sumItemPackagingFromSnapshots(items), 11);
});

test("computeItemPackagingTotal uses store default when packaging enabled but per-unit missing", () => {
  const items = [
    { menuItemId: 10, itemName: "X", quantity: 3, basePrice: 10, variantId: null, variantName: null, addons: [], itemSnapshot: { packaging_enabled: true } },
  ] as any;
  const total = computeItemPackagingTotal({
    items,
    storeDefaultPerUnit: 2,
    db: { perUnitByMenuItemId: new Map(), foundMenuItemIds: new Set([10]) },
  });
  assert.equal(total, 6);
});

test("computeItemPackagingTotal prefers snapshot per-unit over DB and store default", () => {
  const items = [
    { menuItemId: 11, itemName: "Y", quantity: 2, basePrice: 10, variantId: null, variantName: null, addons: [], itemSnapshot: { packaging_enabled: true, packaging_charges: 7 } },
  ] as any;
  const total = computeItemPackagingTotal({
    items,
    storeDefaultPerUnit: 2,
    db: { perUnitByMenuItemId: new Map([[11, 5]]), foundMenuItemIds: new Set([11]) },
  });
  assert.equal(total, 14);
});

test("computeItemPackagingTotal uses DB per-unit when snapshot missing", () => {
  const items = [
    { menuItemId: 12, itemName: "Z", quantity: 2, basePrice: 10, variantId: null, variantName: null, addons: [], itemSnapshot: null },
  ] as any;
  const total = computeItemPackagingTotal({
    items,
    storeDefaultPerUnit: 2,
    db: { perUnitByMenuItemId: new Map([[12, 4]]), foundMenuItemIds: new Set([12]) },
  });
  assert.equal(total, 8);
});

