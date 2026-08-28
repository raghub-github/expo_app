import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_MENU_ITEM_VARIANT_ID,
  prependBaseMenuItemVariant,
  variantRepresentsBaseItem,
} from "./menu-item-base-variant.js";

test("prependBaseMenuItemVariant adds parent item as first size option", () => {
  const out = prependBaseMenuItemVariant(
    {
      name: "Cham Cham",
      price: 169,
      sizeValue: "250",
      sizeUnit: "grams",
    },
    [
      {
        id: "11",
        name: "Half Kg Pack",
        price: 325,
        sizeValue: "500",
        sizeUnit: "grams",
        isDefault: false,
        displayOrder: 1,
      },
    ]
  );

  assert.equal(out.length, 2);
  assert.equal(out[0]?.id, BASE_MENU_ITEM_VARIANT_ID);
  assert.equal(out[0]?.name, "Cham Cham");
  assert.equal(out[0]?.sizeValue, "250");
  assert.equal(out[0]?.isDefault, true);
});

test("prependBaseMenuItemVariant skips duplicate base row", () => {
  const variants = [
    {
      id: "9",
      name: "Cham Cham",
      price: 169,
      sizeValue: "250",
      sizeUnit: "grams",
      isDefault: true,
      displayOrder: 0,
    },
  ];
  const out = prependBaseMenuItemVariant(
    { name: "Cham Cham", price: 169, sizeValue: "250", sizeUnit: "grams" },
    variants
  );
  assert.equal(out.length, 1);
  assert.ok(variantRepresentsBaseItem(variants[0]!, { name: "Cham Cham", price: 169, sizeValue: "250", sizeUnit: "grams" }));
});
