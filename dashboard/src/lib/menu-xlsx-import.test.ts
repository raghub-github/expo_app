import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBool,
  parseFoodType,
  parseMenuSheets,
  parseSpiceLevel,
  parsedWorkbookHasErrors,
  buildMenuXlsxTemplateSheets,
  removeParsedPreviewRow,
  itemNameMatchKey,
} from "./menu-xlsx-import";

test("parseFoodType maps common labels to Add Item values", () => {
  assert.equal(parseFoodType("veg"), "VEG");
  assert.equal(parseFoodType("Non-Veg"), "NON_VEG");
  assert.equal(parseFoodType("Egg"), "EGG");
  assert.equal(parseFoodType("Vegan"), "Vegan");
  assert.equal(parseFoodType(""), null);
});

test("parseSpiceLevel maps common labels", () => {
  assert.equal(parseSpiceLevel("mild"), "Mild");
  assert.equal(parseSpiceLevel("VERY_HOT"), "Very Hot");
});

test("parseBool accepts yes/no and stock labels", () => {
  assert.equal(parseBool("yes", false), true);
  assert.equal(parseBool("out of stock", true), false);
  assert.equal(parseBool("", true), true);
});

test("parseMenuSheets maps Excel columns onto add-item fields and flags missing prices", () => {
  const parsed = parseMenuSheets(
    [
      {
        name: "Items",
        rows: [
          ["Item name", "Category", "Food type", "Spice", "Base price", "Selling price", "Allergens"],
          ["Veg Roll", "Veg Rolls", "Veg", "Mild", 99, 89, "Gluten"],
          ["No Price", "Veg Rolls", "Veg", "", "", "", ""],
        ],
      },
      {
        name: "Variants",
        rows: [
          ["item_name", "variant_name", "variant_price"],
          ["Veg Roll", "Half", 89],
        ],
      },
      {
        name: "Customizations",
        rows: [
          ["item_name", "customization_title", "customization_type"],
          ["Veg Roll", "Extra toppings", "Checkbox"],
        ],
      },
      {
        name: "Customization Options",
        rows: [
          ["item_name", "customization_title", "addon_name", "addon_price"],
          ["Veg Roll", "Extra toppings", "Extra cheese", 20],
        ],
      },
    ],
    { fileName: "menu.xlsx", existingCategories: [], itemFormVariant: "standard" }
  );

  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0]?.item_name, "Veg Roll");
  assert.equal(parsed.items[0]?.food_type, "VEG");
  assert.equal(parsed.items[0]?.spice_level, "Mild");
  assert.equal(parsed.items[0]?.base_price, 99);
  assert.equal(parsed.items[0]?.selling_price, 89);
  assert.deepEqual(parsed.items[0]?.allergens, ["Gluten"]);
  assert.equal(parsed.items[0]?.errors.length, 0);
  assert.ok(parsed.items[1]?.errors.some((e) => /base price/i.test(e)));

  assert.equal(parsed.categories.some((c) => c.category_name === "Veg Rolls" && c.will_create), true);
  assert.equal(parsed.variants[0]?.variant_name, "Half");
  assert.equal(parsed.customizations[0]?.customization_title, "Extra toppings");
  assert.equal(parsed.addons[0]?.addon_name, "Extra cheese");
  assert.ok(parsed.fieldMappings.some((m) => m.dbField === "item_name" && m.dbLabel === "Item name"));
  assert.equal(parsedWorkbookHasErrors(parsed), true);
});

test("grocery template omits restaurant-only columns", () => {
  const grocery = buildMenuXlsxTemplateSheets({ itemFormVariant: "grocery" });
  const itemHeaders = grocery.sheets.find((s) => s.name === "Items")?.rows[0] as string[];
  assert.equal(grocery.fileName, "grocery-menu-template.xlsx");
  assert.ok(itemHeaders.includes("expiry_date"));
  assert.equal(itemHeaders.includes("food_type"), false);
  assert.equal(itemHeaders.includes("spice_level"), false);
  const catHeaders = grocery.sheets.find((s) => s.name === "Categories")?.rows[0] as string[];
  assert.equal(catHeaders.includes("cuisine"), false);
});

test("restaurant template includes food type and optional cuisine", () => {
  const food = buildMenuXlsxTemplateSheets({ itemFormVariant: "standard", showCuisineField: true });
  const itemHeaders = food.sheets.find((s) => s.name === "Items")?.rows[0] as string[];
  assert.equal(food.fileName, "restaurant-menu-template.xlsx");
  assert.ok(itemHeaders.includes("food_type"));
  assert.ok(itemHeaders.includes("spice_level"));
  assert.ok(itemHeaders.includes("cuisine_type"));
  assert.equal(itemHeaders.includes("expiry_date"), false);
});

function assertTemplatePricesEqual(sheets: { name: string; rows: unknown[][] }[]) {
  const itemSheet = sheets.find((s) => s.name === "Items");
  assert.ok(itemSheet);
  const headers = itemSheet!.rows[0] as string[];
  const baseIdx = headers.indexOf("base_price");
  const sellIdx = headers.indexOf("selling_price");
  assert.ok(baseIdx >= 0 && sellIdx >= 0);
  for (const row of itemSheet!.rows.slice(1)) {
    const cells = row as unknown[];
    assert.equal(cells[baseIdx], cells[sellIdx]);
  }
}

test("grocery and restaurant templates keep base price equal to selling price", () => {
  assertTemplatePricesEqual(buildMenuXlsxTemplateSheets({ itemFormVariant: "grocery" }).sheets);
  assertTemplatePricesEqual(
    buildMenuXlsxTemplateSheets({ itemFormVariant: "standard", showCuisineField: true }).sheets
  );
});

test("existing store item and category are flagged fill-missing, not create", () => {
  const parsed = parseMenuSheets(
    [
      {
        name: "Items",
        rows: [
          ["Item name", "Category", "Food type", "Spice", "Base price", "Selling price"],
          ["Veg Roll", "Veg Rolls", "Veg", "Mild", 99, 99],
        ],
      },
    ],
    {
      fileName: "menu.xlsx",
      existingCategories: [{ id: 1, category_name: "Veg Rolls", parent_category_id: null }],
      existingItems: [{ id: 99, item_name: "Veg Roll", category_name: "Veg Rolls" }],
      itemFormVariant: "standard",
    }
  );

  assert.equal(parsed.items[0]?.will_create, false);
  assert.equal(parsed.items[0]?.existing_id, 99);
  assert.equal(
    parsed.categories.some((c) => c.category_name === "Veg Rolls" && c.will_create),
    false
  );
  assert.equal(parsedWorkbookHasErrors(parsed), false);
});

test("store-wide unique item name is fill-missing even in a different category", () => {
  const parsed = parseMenuSheets(
    [
      {
        name: "Items",
        rows: [
          ["Item name", "Category", "Food type", "Spice", "Base price", "Selling price"],
          ["Butter Chaap Roll", "Newly Added Rolls", "Veg", "Mild", 90, 90],
        ],
      },
    ],
    {
      fileName: "menu.xlsx",
      existingCategories: [
        { id: 1, category_name: "Rolls", parent_category_id: null },
        { id: 2, category_name: "Newly Added Rolls", parent_category_id: null },
      ],
      existingItems: [{ id: 44, item_name: "Butter Chaap Roll", category_name: "Rolls" }],
      itemFormVariant: "standard",
    }
  );

  assert.equal(parsed.items[0]?.will_create, false);
  assert.equal(parsed.items[0]?.existing_id, 44);
  assert.equal(parsedWorkbookHasErrors(parsed), false);
});

test("itemNameMatchKey treats Roll and Rolls as the same item", () => {
  assert.equal(itemNameMatchKey("Chowmein Rolls"), itemNameMatchKey("Chowmein Roll"));
  assert.equal(itemNameMatchKey("Butter Chaap Roll"), itemNameMatchKey("butter chaap rolls"));
});

test("plural item name matches existing singular item as replace, not create", () => {
  const parsed = parseMenuSheets(
    [
      {
        name: "Items",
        rows: [
          ["Item name", "Category", "Food type", "Spice", "Base price", "Selling price"],
          ["Chowmein Rolls", "Chowmein Rolls", "Veg", "Mild", 70, 70],
        ],
      },
    ],
    {
      fileName: "menu.xlsx",
      existingCategories: [{ id: 1, category_name: "Chowmein Rolls", parent_category_id: null }],
      existingItems: [{ id: 10, item_name: "Chowmein Roll", category_name: "Chowmein Rolls" }],
      itemFormVariant: "standard",
    }
  );

  assert.equal(parsed.items[0]?.will_create, false);
  assert.equal(parsed.items[0]?.existing_id, 10);
  assert.equal(parsedWorkbookHasErrors(parsed), false);
});

test("removeParsedPreviewRow drops an item and its variants/options", () => {
  const parsed = parseMenuSheets(
    [
      {
        name: "Items",
        rows: [
          ["Item name", "Category", "Food type", "Spice", "Base price", "Selling price"],
          ["Veg Roll", "Veg Rolls", "Veg", "Mild", 99, 89],
          ["Garlic Roll", "Veg Rolls", "Veg", "Hot", 110, 110],
        ],
      },
      {
        name: "Variants",
        rows: [
          ["item_name", "variant_name", "variant_price"],
          ["Veg Roll", "Half", 89],
          ["Garlic Roll", "Full", 110],
        ],
      },
      {
        name: "Customizations",
        rows: [
          ["item_name", "customization_title", "customization_type"],
          ["Veg Roll", "Extra toppings", "Checkbox"],
        ],
      },
      {
        name: "Customization Options",
        rows: [
          ["item_name", "customization_title", "addon_name", "addon_price"],
          ["Veg Roll", "Extra toppings", "Extra cheese", 20],
        ],
      },
    ],
    { fileName: "menu.xlsx", existingCategories: [], itemFormVariant: "standard" }
  );

  const afterItem = removeParsedPreviewRow(parsed, "items", 0);
  assert.equal(afterItem.items.length, 1);
  assert.equal(afterItem.items[0]?.item_name, "Garlic Roll");
  assert.equal(afterItem.variants.length, 1);
  assert.equal(afterItem.variants[0]?.item_name, "Garlic Roll");
  assert.equal(afterItem.customizations.length, 0);
  assert.equal(afterItem.addons.length, 0);

  const afterVariant = removeParsedPreviewRow(afterItem, "variants", 0);
  assert.equal(afterVariant.variants.length, 0);
  assert.equal(afterVariant.items.length, 1);
});
