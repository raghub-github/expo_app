import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_MENU_ITEM_VARIANT_ID,
  prependBaseMenuItemVariant,
  variantRepresentsBaseItem,
} from "./menu-item-base-variant.ts";

test("prepend keeps steamed base when fried variant shares size/price", () => {
  const fried = {
    id: "22",
    name: "Paneer Momos - Fried - 10 piece",
    price: 106,
    sizeValue: "10",
    sizeUnit: "piece",
    isDefault: true,
    displayOrder: 0,
  };
  const base = {
    name: "Paneer Momos - Steamed",
    price: 106,
    sizeValue: "10",
    sizeUnit: "piece",
  };

  assert.equal(variantRepresentsBaseItem(fried, base), false);

  const out = prependBaseMenuItemVariant(base, [fried]);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.id, BASE_MENU_ITEM_VARIANT_ID);
  assert.equal(out[0]?.name, "Paneer Momos - Steamed");
  assert.equal(out[1]?.name, "Paneer Momos - Fried - 10 piece");
});
