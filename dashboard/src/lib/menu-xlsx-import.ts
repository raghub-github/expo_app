/**
 * Parse a merchant menu Excel workbook into the same fields the Add Item modal posts.
 * Sheets: Categories, Items, Variants, Customizations, Customization Options.
 */

export const MENU_XLSX_LIMITS = {
  categories: 100,
  items: 250,
  variants: 1000,
  customizations: 500,
  addons: 2000,
} as const;

export type MenuXlsxExistingCategory = {
  id: number;
  category_name: string;
  parent_category_id?: number | null;
};

export type FieldMappingRow = {
  sheet: string;
  excelHeader: string;
  dbField: string;
  dbLabel: string;
  sample: string;
};

export type MappedCategoryRow = {
  row: number;
  category_name: string;
  parent_category_name: string | null;
  cuisine: string | null;
  category_description: string | null;
  display_order: number;
  is_active: boolean;
  existing_id: number | null;
  will_create: boolean;
  errors: string[];
};

export type MappedItemRow = {
  row: number;
  item_name: string;
  category_name: string;
  item_description: string | null;
  food_type: string | null;
  spice_level: string | null;
  cuisine_type: string | null;
  allergens: string[] | null;
  base_price: number;
  selling_price: number;
  in_stock: boolean;
  available_quantity: number | null;
  low_stock_threshold: number | null;
  preparation_time_minutes: number | null;
  packaging_charges: number | null;
  serves: number | null;
  serves_label: string | null;
  item_size_value: number | null;
  item_size_unit: string | null;
  is_popular: boolean;
  is_recommended: boolean;
  is_active: boolean;
  available_for_delivery: boolean;
  weight_per_serving: number | null;
  weight_per_serving_unit: string | null;
  calories_kcal: number | null;
  protein: number | null;
  protein_unit: string | null;
  carbohydrates: number | null;
  carbohydrates_unit: string | null;
  fat: number | null;
  fat_unit: string | null;
  fibre: number | null;
  fibre_unit: string | null;
  item_tags: string[] | null;
  expiry_date: string | null;
  existing_id: number | null;
  will_create: boolean;
  errors: string[];
};

export type MappedVariantRow = {
  row: number;
  item_name: string;
  category_name: string | null;
  variant_name: string;
  variant_type: string | null;
  variant_price: number;
  variant_size_value: string | null;
  variant_size_unit: string | null;
  is_default: boolean;
  display_order: number;
  errors: string[];
};

export type MappedCustomizationRow = {
  row: number;
  item_name: string;
  category_name: string | null;
  customization_title: string;
  customization_type: string | null;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  display_order: number;
  errors: string[];
};

export type MappedAddonRow = {
  row: number;
  item_name: string;
  category_name: string | null;
  customization_title: string;
  addon_name: string;
  addon_price: number;
  addon_size_value: number | null;
  addon_size_unit: string | null;
  in_stock: boolean;
  display_order: number;
  errors: string[];
};

export type ParsedMenuWorkbook = {
  fileName: string;
  fieldMappings: FieldMappingRow[];
  unmatchedHeaders: { sheet: string; excelHeader: string }[];
  categories: MappedCategoryRow[];
  items: MappedItemRow[];
  variants: MappedVariantRow[];
  customizations: MappedCustomizationRow[];
  addons: MappedAddonRow[];
  workbookErrors: string[];
};

export type MenuXlsxExistingItem = {
  id: number;
  item_name: string;
  category_name?: string | null;
};

export type MenuXlsxParseOpts = {
  fileName: string;
  existingCategories: MenuXlsxExistingCategory[];
  existingItems?: MenuXlsxExistingItem[];
  itemFormVariant?: "grocery" | "standard";
  defaultPrepMinutes?: number | null;
};

type SheetKind = "categories" | "items" | "variants" | "customizations" | "addons";

const SHEET_ALIASES: Record<SheetKind, string[]> = {
  categories: ["categories", "category", "cats"],
  items: ["items", "menu items", "menu_items", "item"],
  variants: ["variants", "variant"],
  customizations: ["customizations", "customization", "cust", "customization groups", "groups"],
  addons: [
    "customization options",
    "options",
    "addons",
    "addon",
    "cust options",
    "customization_options",
  ],
};

type AliasSpec = { field: string; label: string; aliases: string[] };

const CATEGORY_FIELDS: AliasSpec[] = [
  { field: "category_name", label: "Category name", aliases: ["category_name", "category", "name", "category name"] },
  { field: "parent_category_name", label: "Parent category", aliases: ["parent_category_name", "parent_category", "parent", "parent category"] },
  { field: "cuisine", label: "Cuisine", aliases: ["cuisine", "cuisine_name", "cuisine name"] },
  { field: "category_description", label: "Description", aliases: ["category_description", "description"] },
  { field: "display_order", label: "Display order", aliases: ["display_order", "order"] },
  { field: "is_active", label: "Active", aliases: ["is_active", "active"] },
];

const ITEM_FIELDS: AliasSpec[] = [
  { field: "item_name", label: "Item name", aliases: ["item_name", "name", "item", "item name", "menu item"] },
  { field: "category_name", label: "Category", aliases: ["category_name", "category", "category name"] },
  { field: "item_description", label: "Description", aliases: ["item_description", "description"] },
  { field: "food_type", label: "Food type", aliases: ["food_type", "food type", "veg", "diet"] },
  { field: "spice_level", label: "Spice", aliases: ["spice_level", "spice", "spice level"] },
  { field: "cuisine_type", label: "Cuisine", aliases: ["cuisine_type", "cuisine", "cuisines"] },
  { field: "allergens", label: "Allergens", aliases: ["allergens"] },
  { field: "base_price", label: "Base price (₹)", aliases: ["base_price", "base price", "mrp", "price"] },
  { field: "selling_price", label: "Selling price (₹)", aliases: ["selling_price", "selling price", "sell price"] },
  { field: "in_stock", label: "In stock", aliases: ["in_stock", "in stock", "stock"] },
  { field: "available_quantity", label: "Avail. qty", aliases: ["available_quantity", "qty", "quantity", "avail qty", "avail. qty"] },
  { field: "low_stock_threshold", label: "Low stock at", aliases: ["low_stock_threshold", "low stock at", "low stock"] },
  { field: "preparation_time_minutes", label: "Prep / ETA (min)", aliases: ["preparation_time_minutes", "prep_time", "eta", "prep", "prep / eta"] },
  { field: "packaging_charges", label: "Packaging (₹)", aliases: ["packaging_charges", "packaging"] },
  { field: "serves", label: "Serves", aliases: ["serves"] },
  { field: "serves_label", label: "Serves (label)", aliases: ["serves_label", "serves label"] },
  { field: "item_size_value", label: "Item size", aliases: ["item_size_value", "item_size", "size"] },
  { field: "item_size_unit", label: "Size unit", aliases: ["item_size_unit", "unit", "size_unit"] },
  { field: "is_popular", label: "Popular", aliases: ["is_popular", "popular"] },
  { field: "is_recommended", label: "Recommended", aliases: ["is_recommended", "recommended"] },
  { field: "is_active", label: "Active", aliases: ["is_active", "active"] },
  { field: "available_for_delivery", label: "Delivery", aliases: ["available_for_delivery", "delivery"] },
  { field: "weight_per_serving", label: "Weight / serving", aliases: ["weight_per_serving", "weight"] },
  { field: "weight_per_serving_unit", label: "Weight unit", aliases: ["weight_per_serving_unit", "weight_unit"] },
  { field: "calories_kcal", label: "Calories", aliases: ["calories_kcal", "calories"] },
  { field: "protein", label: "Protein", aliases: ["protein"] },
  { field: "protein_unit", label: "Protein unit", aliases: ["protein_unit"] },
  { field: "carbohydrates", label: "Carbohydrates", aliases: ["carbohydrates", "carbs"] },
  { field: "carbohydrates_unit", label: "Carb unit", aliases: ["carbohydrates_unit", "carb_unit"] },
  { field: "fat", label: "Fat", aliases: ["fat"] },
  { field: "fat_unit", label: "Fat unit", aliases: ["fat_unit"] },
  { field: "fibre", label: "Fibre", aliases: ["fibre", "fiber"] },
  { field: "fibre_unit", label: "Fibre unit", aliases: ["fibre_unit", "fiber_unit"] },
  { field: "item_tags", label: "Tags", aliases: ["item_tags", "tags"] },
  { field: "expiry_date", label: "Expiry date", aliases: ["expiry_date", "expiry"] },
];

const VARIANT_FIELDS: AliasSpec[] = [
  { field: "item_name", label: "Item name", aliases: ["item_name", "item", "item name", "name"] },
  { field: "category_name", label: "Category", aliases: ["category_name", "category"] },
  { field: "variant_name", label: "Variant name", aliases: ["variant_name", "variant", "variant name"] },
  { field: "variant_type", label: "Variant type", aliases: ["variant_type", "type"] },
  { field: "variant_price", label: "Variant price (₹)", aliases: ["variant_price", "price"] },
  { field: "variant_size_value", label: "Size", aliases: ["variant_size_value", "size"] },
  { field: "variant_size_unit", label: "Size unit", aliases: ["variant_size_unit", "unit"] },
  { field: "is_default", label: "Default", aliases: ["is_default", "default"] },
  { field: "display_order", label: "Display order", aliases: ["display_order", "order"] },
];

const CUST_FIELDS: AliasSpec[] = [
  { field: "item_name", label: "Item name", aliases: ["item_name", "item", "item name", "name"] },
  { field: "category_name", label: "Category", aliases: ["category_name", "category"] },
  { field: "customization_title", label: "Customization group", aliases: ["customization_title", "group", "title", "customization", "cust"] },
  { field: "customization_type", label: "Type", aliases: ["customization_type", "type"] },
  { field: "is_required", label: "Required", aliases: ["is_required", "required"] },
  { field: "min_selection", label: "Min selection", aliases: ["min_selection", "min"] },
  { field: "max_selection", label: "Max selection", aliases: ["max_selection", "max"] },
  { field: "display_order", label: "Display order", aliases: ["display_order", "order"] },
];

const ADDON_FIELDS: AliasSpec[] = [
  { field: "item_name", label: "Item name", aliases: ["item_name", "item", "item name", "name"] },
  { field: "category_name", label: "Category", aliases: ["category_name", "category"] },
  { field: "customization_title", label: "Customization group", aliases: ["customization_title", "group", "customization", "cust"] },
  { field: "addon_name", label: "Option name", aliases: ["addon_name", "option", "option_name", "addon"] },
  { field: "addon_price", label: "Option price (₹)", aliases: ["addon_price", "price"] },
  { field: "addon_size_value", label: "Size", aliases: ["addon_size_value", "size"] },
  { field: "addon_size_unit", label: "Size unit", aliases: ["addon_size_unit", "unit"] },
  { field: "in_stock", label: "In stock", aliases: ["in_stock", "in stock", "stock"] },
  { field: "display_order", label: "Display order", aliases: ["display_order", "order"] },
];

export function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[_./]+/g, " ").replace(/\s+/g, " ");
}

/** Canonical name for duplicate matching: case/space-insensitive, last-word plural stripped (Roll / Rolls). */
export function itemNameMatchKey(s: string): string {
  const k = normKey(s);
  if (!k) return "";
  const parts = k.split(" ");
  const last = parts[parts.length - 1] ?? "";
  if (last.length >= 4 && last.endsWith("s") && !last.endsWith("ss")) {
    return [...parts.slice(0, -1), last.slice(0, -1)].join(" ").trim();
  }
  return k;
}

function cellToString(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

export function parseBool(raw: string, fallback: boolean): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return fallback;
  if (["yes", "y", "true", "1", "in stock"].includes(t)) return true;
  if (["no", "n", "false", "0", "out of stock"].includes(t)) return false;
  return fallback;
}

export function parseFoodType(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = t.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (u === "veg" || u === "vegetarian") return "VEG";
  if (u === "non veg" || u === "non vegetarian" || u === "nv") return "NON_VEG";
  if (u === "egg" || u === "eggitarian") return "EGG";
  if (u === "vegan") return "Vegan";
  return t;
}

export function parseSpiceLevel(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = t.toLowerCase().replace(/[_-]+/g, " ");
  if (u === "mild") return "Mild";
  if (u === "medium") return "Medium";
  if (u === "hot") return "Hot";
  if (u === "very hot" || u === "extra hot") return "Very Hot";
  return t;
}

export function parseCsvList(raw: string): string[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function parseNum(raw: string): number | null {
  const t = raw.replace(/[₹,\s]/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(raw: string, fallback: number): number {
  const n = parseNum(raw);
  return n != null ? Math.trunc(n) : fallback;
}

function detectSheetKind(name: string, headers: string[]): SheetKind | null {
  const n = normKey(name);
  const exactOrder: SheetKind[] = ["addons", "customizations", "variants", "categories", "items"];
  for (const kind of exactOrder) {
    if (SHEET_ALIASES[kind].some((a) => n === a)) return kind;
  }
  for (const kind of exactOrder) {
    if (SHEET_ALIASES[kind].some((a) => a.length >= 10 && (n.includes(a) || a.includes(n)))) return kind;
  }
  const h = new Set(headers.map(normKey));
  if (h.has("addon name") || h.has("addon_name") || h.has("option name")) return "addons";
  if (h.has("variant name") || h.has("variant_name")) return "variants";
  if (h.has("customization title") || h.has("customization_title")) return "customizations";
  if (h.has("item name") || h.has("item_name") || h.has("base price") || h.has("base_price")) return "items";
  if (h.has("category name") || h.has("category_name") || (h.has("category") && !h.has("item name"))) {
    return "categories";
  }
  return null;
}

function buildHeaderIndex(headers: string[], specs: AliasSpec[]): Map<string, string> {
  const idx = new Map<string, string>();
  const used = new Set<number>();
  for (const spec of specs) {
    const aliases = spec.aliases.map(normKey);
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const h = normKey(headers[i] ?? "");
      if (!h) continue;
      if (aliases.includes(h)) {
        idx.set(spec.field, headers[i]!);
        used.add(i);
        break;
      }
    }
  }
  return idx;
}

function getCell(row: Record<string, string>, headerIndex: Map<string, string>, field: string): string {
  const header = headerIndex.get(field);
  if (!header) return "";
  return row[header] ?? "";
}

type AoASheet = { name: string; rows: unknown[][] };

function aoaToObjects(rows: unknown[][]): { headers: string[]; objects: Record<string, string>[] } {
  const headers = (rows[0] ?? []).map((h, i) => {
    const s = cellToString(h);
    return s || `Column ${i + 1}`;
  });
  const objects: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r] ?? [];
    const obj: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const v = cellToString(line[c]);
      obj[headers[c]!] = v;
      if (v) any = true;
    }
    if (any) objects.push(obj);
  }
  return { headers, objects };
}

function mappingRows(
  sheet: string,
  headers: string[],
  objects: Record<string, string>[],
  headerIndex: Map<string, string>,
  specs: AliasSpec[]
): { mapped: FieldMappingRow[]; unmatched: { sheet: string; excelHeader: string }[] } {
  const reverse = new Map<string, { field: string; label: string }>();
  for (const [field, header] of headerIndex) {
    const spec = specs.find((s) => s.field === field);
    if (spec) reverse.set(header, { field, label: spec.label });
  }
  const mapped: FieldMappingRow[] = [];
  const unmatched: { sheet: string; excelHeader: string }[] = [];
  for (const h of headers) {
    const hit = reverse.get(h);
    if (!hit) {
      unmatched.push({ sheet, excelHeader: h });
      continue;
    }
    mapped.push({
      sheet,
      excelHeader: h,
      dbField: hit.field,
      dbLabel: hit.label,
      sample: objects[0]?.[h] ?? "",
    });
  }
  return { mapped, unmatched };
}

function findExistingCategory(
  name: string,
  parentName: string | null,
  existing: MenuXlsxExistingCategory[],
  createdNames: Map<string, { parent: string | null }>
): { existing_id: number | null; will_create: boolean } {
  const n = normKey(name);
  const p = parentName ? normKey(parentName) : "";
  const byId = new Map(existing.map((c) => [c.id, c]));
  const matches = existing.filter((c) => normKey(c.category_name) === n);
  if (p) {
    const withParent = matches.find((c) => {
      const parent = c.parent_category_id != null ? byId.get(c.parent_category_id) : null;
      return parent != null && normKey(parent.category_name) === p;
    });
    if (withParent) return { existing_id: withParent.id, will_create: false };
  } else {
    const root = matches.find((c) => c.parent_category_id == null) ?? matches[0];
    if (root) return { existing_id: root.id, will_create: false };
  }
  const createdKey = `${n}||${p}`;
  if (createdNames.has(createdKey) || createdNames.has(`${n}||`)) {
    return { existing_id: null, will_create: true };
  }
  return { existing_id: null, will_create: true };
}

function findExistingItem(
  item_name: string,
  category_name: string | null | undefined,
  existing: MenuXlsxExistingItem[]
): MenuXlsxExistingItem | undefined {
  const want = itemNameMatchKey(item_name);
  if (!want) return undefined;
  const matches = existing.filter((ex) => itemNameMatchKey(ex.item_name) === want);
  if (matches.length === 0) return undefined;
  const cat = category_name ? normKey(category_name) : "";
  if (cat) {
    const inCat = matches.find((ex) => normKey(ex.category_name ?? "") === cat);
    if (inCat) return inCat;
  }
  return matches[0];
}

function itemKey(name: string, category: string | null | undefined): string {
  return `${normKey(name)}||${normKey(category ?? "")}`;
}

export function parsedWorkbookHasErrors(parsed: ParsedMenuWorkbook): boolean {
  if (parsed.workbookErrors.length > 0) return true;
  const rows = [
    ...parsed.categories,
    ...parsed.items,
    ...parsed.variants,
    ...parsed.customizations,
    ...parsed.addons,
  ];
  return rows.some((r) => r.errors.length > 0);
}

function sameItemRef(
  a: { item_name: string; category_name?: string | null },
  b: { item_name: string; category_name?: string | null }
): boolean {
  if (normKey(a.item_name) !== normKey(b.item_name)) return false;
  const catA = normKey(a.category_name ?? "");
  const catB = normKey(b.category_name ?? "");
  if (!catA || !catB) return true;
  return catA === catB;
}

export type ParsedPreviewKind = "categories" | "items" | "variants" | "customizations" | "addons";

/** Drop a preview row before upload. Removing an item also drops its variants/options. */
export function removeParsedPreviewRow(
  parsed: ParsedMenuWorkbook,
  kind: ParsedPreviewKind,
  index: number
): ParsedMenuWorkbook {
  if (index < 0) return parsed;
  if (kind === "categories") {
    if (index >= parsed.categories.length) return parsed;
    return { ...parsed, categories: parsed.categories.filter((_, i) => i !== index) };
  }
  if (kind === "items") {
    const item = parsed.items[index];
    if (!item) return parsed;
    return {
      ...parsed,
      items: parsed.items.filter((_, i) => i !== index),
      variants: parsed.variants.filter((v) => !sameItemRef(v, item)),
      customizations: parsed.customizations.filter((c) => !sameItemRef(c, item)),
      addons: parsed.addons.filter((a) => !sameItemRef(a, item)),
    };
  }
  if (kind === "variants") {
    if (index >= parsed.variants.length) return parsed;
    return { ...parsed, variants: parsed.variants.filter((_, i) => i !== index) };
  }
  if (kind === "customizations") {
    const group = parsed.customizations[index];
    if (!group) return parsed;
    return {
      ...parsed,
      customizations: parsed.customizations.filter((_, i) => i !== index),
      addons: parsed.addons.filter(
        (a) =>
          !(
            sameItemRef(a, group) &&
            normKey(a.customization_title) === normKey(group.customization_title)
          )
      ),
    };
  }
  if (index >= parsed.addons.length) return parsed;
  return { ...parsed, addons: parsed.addons.filter((_, i) => i !== index) };
}

export function parseMenuSheets(sheets: AoASheet[], opts: MenuXlsxParseOpts): ParsedMenuWorkbook {
  const isGrocery = opts.itemFormVariant === "grocery";
  const defaultPrep = opts.defaultPrepMinutes ?? 15;
  const fieldMappings: FieldMappingRow[] = [];
  const unmatchedHeaders: { sheet: string; excelHeader: string }[] = [];
  const workbookErrors: string[] = [];

  const byKind = new Map<SheetKind, { name: string; headers: string[]; objects: Record<string, string>[] }>();

  for (const sheet of sheets) {
    if (!sheet.rows.length) continue;
    const { headers, objects } = aoaToObjects(sheet.rows);
    if (!objects.length) continue;
    const kind = detectSheetKind(sheet.name, headers);
    if (!kind) {
      workbookErrors.push(`Unrecognized sheet "${sheet.name}". Use Categories, Items, Variants, Customizations, or Customization Options.`);
      continue;
    }
    if (byKind.has(kind)) {
      workbookErrors.push(`Duplicate sheet for ${kind}: "${sheet.name}"`);
      continue;
    }
    byKind.set(kind, { name: sheet.name, headers, objects });
  }

  if (!byKind.has("items")) {
    workbookErrors.push("No Items sheet found. Add a sheet named Items with item_name, category, and base_price.");
  }

  const categories: MappedCategoryRow[] = [];
  const createdCatKeys = new Map<string, { parent: string | null }>();

  const catSheet = byKind.get("categories");
  if (catSheet) {
    const headerIndex = buildHeaderIndex(catSheet.headers, CATEGORY_FIELDS);
    const maps = mappingRows(catSheet.name, catSheet.headers, catSheet.objects, headerIndex, CATEGORY_FIELDS);
    fieldMappings.push(...maps.mapped);
    unmatchedHeaders.push(...maps.unmatched);
    catSheet.objects.forEach((obj, i) => {
      const category_name = getCell(obj, headerIndex, "category_name");
      const parent_category_name = getCell(obj, headerIndex, "parent_category_name") || null;
      const errors: string[] = [];
      if (!category_name) errors.push("Category name is required");
      if (category_name.length > 30) errors.push("Category name must not exceed 30 characters");
      const found = category_name
        ? findExistingCategory(category_name, parent_category_name, opts.existingCategories, createdCatKeys)
        : { existing_id: null, will_create: false };
      if (category_name && found.will_create) {
        createdCatKeys.set(`${normKey(category_name)}||${normKey(parent_category_name ?? "")}`, {
          parent: parent_category_name,
        });
      }
      categories.push({
        row: i + 2,
        category_name,
        parent_category_name,
        cuisine: getCell(obj, headerIndex, "cuisine") || null,
        category_description: getCell(obj, headerIndex, "category_description") || null,
        display_order: parseIntSafe(getCell(obj, headerIndex, "display_order"), 0),
        is_active: parseBool(getCell(obj, headerIndex, "is_active"), true),
        existing_id: found.existing_id,
        will_create: found.will_create,
        errors,
      });
    });
  }

  const items: MappedItemRow[] = [];
  const itemSheet = byKind.get("items");
  const itemKeys = new Set<string>();
  const itemNamesSeen = new Set<string>();

  if (itemSheet) {
    const headerIndex = buildHeaderIndex(itemSheet.headers, ITEM_FIELDS);
    const maps = mappingRows(itemSheet.name, itemSheet.headers, itemSheet.objects, headerIndex, ITEM_FIELDS);
    fieldMappings.push(...maps.mapped);
    unmatchedHeaders.push(...maps.unmatched);
    itemSheet.objects.forEach((obj, i) => {
      const item_name = getCell(obj, headerIndex, "item_name");
      const category_name = getCell(obj, headerIndex, "category_name");
      const errors: string[] = [];
      if (!item_name) errors.push("Item name is required");
      if (!category_name) errors.push("Category is required");
      const baseRaw = getCell(obj, headerIndex, "base_price");
      const sellRaw = getCell(obj, headerIndex, "selling_price");
      const base_price = parseNum(baseRaw);
      const selling_price = parseNum(sellRaw);
      if (base_price == null || base_price <= 0) errors.push("Valid base price required");
      if (sellRaw && (selling_price == null || selling_price < 0)) errors.push("Invalid selling price");
      const key = itemKey(item_name, category_name);
      if (item_name && itemKeys.has(key)) errors.push("Duplicate item name in this category");
      if (item_name) itemKeys.add(key);
      const existingMatch = findExistingItem(item_name, category_name, opts.existingItems ?? []);
      const existing_id = existingMatch?.id ?? null;
      const nameSeen = item_name ? itemNamesSeen.has(itemNameMatchKey(item_name)) : false;
      if (item_name) itemNamesSeen.add(itemNameMatchKey(item_name));
      const will_create = existing_id == null && !nameSeen;
      if (category_name) {
        const found = findExistingCategory(category_name, null, opts.existingCategories, createdCatKeys);
        if (found.will_create && found.existing_id == null) {
          const alreadyListed = categories.some((c) => normKey(c.category_name) === normKey(category_name));
          if (!alreadyListed) {
            createdCatKeys.set(`${normKey(category_name)}||`, { parent: null });
            categories.push({
              row: 0,
              category_name,
              parent_category_name: null,
              cuisine: null,
              category_description: null,
              display_order: categories.length,
              is_active: true,
              existing_id: null,
              will_create: true,
              errors: category_name.length > 30 ? ["Category name must not exceed 30 characters"] : [],
            });
          }
        }
      }
      const prepRaw = getCell(obj, headerIndex, "preparation_time_minutes");
      const prep = parseNum(prepRaw);
      items.push({
        row: i + 2,
        item_name,
        category_name,
        item_description: getCell(obj, headerIndex, "item_description") || null,
        food_type: isGrocery ? null : parseFoodType(getCell(obj, headerIndex, "food_type")),
        spice_level: isGrocery ? null : parseSpiceLevel(getCell(obj, headerIndex, "spice_level")),
        cuisine_type: isGrocery ? null : getCell(obj, headerIndex, "cuisine_type") || null,
        allergens: isGrocery ? null : parseCsvList(getCell(obj, headerIndex, "allergens")),
        base_price: base_price != null && base_price > 0 ? base_price : 0,
        selling_price:
          selling_price != null && selling_price >= 0
            ? selling_price
            : base_price != null && base_price > 0
              ? base_price
              : 0,
        in_stock: parseBool(getCell(obj, headerIndex, "in_stock"), true),
        available_quantity: parseNum(getCell(obj, headerIndex, "available_quantity")),
        low_stock_threshold: parseNum(getCell(obj, headerIndex, "low_stock_threshold")),
        preparation_time_minutes: prep != null ? Math.trunc(prep) : defaultPrep,
        packaging_charges: isGrocery ? null : parseNum(getCell(obj, headerIndex, "packaging_charges")),
        serves: isGrocery ? null : parseNum(getCell(obj, headerIndex, "serves")),
        serves_label: isGrocery ? null : getCell(obj, headerIndex, "serves_label") || null,
        item_size_value: parseNum(getCell(obj, headerIndex, "item_size_value")),
        item_size_unit: getCell(obj, headerIndex, "item_size_unit") || null,
        is_popular: parseBool(getCell(obj, headerIndex, "is_popular"), false),
        is_recommended: parseBool(getCell(obj, headerIndex, "is_recommended"), false),
        is_active: parseBool(getCell(obj, headerIndex, "is_active"), true),
        available_for_delivery: parseBool(getCell(obj, headerIndex, "available_for_delivery"), true),
        weight_per_serving: parseNum(getCell(obj, headerIndex, "weight_per_serving")),
        weight_per_serving_unit: getCell(obj, headerIndex, "weight_per_serving_unit") || "grams",
        calories_kcal: parseNum(getCell(obj, headerIndex, "calories_kcal")),
        protein: parseNum(getCell(obj, headerIndex, "protein")),
        protein_unit: getCell(obj, headerIndex, "protein_unit") || "mg",
        carbohydrates: parseNum(getCell(obj, headerIndex, "carbohydrates")),
        carbohydrates_unit: getCell(obj, headerIndex, "carbohydrates_unit") || "mg",
        fat: parseNum(getCell(obj, headerIndex, "fat")),
        fat_unit: getCell(obj, headerIndex, "fat_unit") || "mg",
        fibre: parseNum(getCell(obj, headerIndex, "fibre")),
        fibre_unit: getCell(obj, headerIndex, "fibre_unit") || "mg",
        item_tags: isGrocery ? null : parseCsvList(getCell(obj, headerIndex, "item_tags")),
        expiry_date: isGrocery ? getCell(obj, headerIndex, "expiry_date") || null : null,
        existing_id,
        will_create,
        errors,
      });
    });
  }

  function resolveItemRef(item_name: string, category_name: string | null, errors: string[]) {
    if (!item_name) {
      errors.push("Item name is required");
      return;
    }
    const exact = itemKey(item_name, category_name ?? "");
    if (itemKeys.has(exact)) return;
    const nameOnly = [...itemKeys].filter((k) => k.startsWith(`${normKey(item_name)}||`));
    if (!category_name && nameOnly.length === 1) return;
    if (nameOnly.length > 0 && category_name) {
      errors.push(`Item "${item_name}" was not found in category "${category_name}"`);
      return;
    }
    if (nameOnly.length > 1) {
      errors.push(`Item "${item_name}" matches more than one category — add a Category column`);
      return;
    }
    if (findExistingItem(item_name, category_name, opts.existingItems ?? [])) return;
    errors.push(`Item "${item_name}" is not in the Items sheet`);
  }

  const variants: MappedVariantRow[] = [];
  const varSheet = byKind.get("variants");
  if (varSheet) {
    const headerIndex = buildHeaderIndex(varSheet.headers, VARIANT_FIELDS);
    const maps = mappingRows(varSheet.name, varSheet.headers, varSheet.objects, headerIndex, VARIANT_FIELDS);
    fieldMappings.push(...maps.mapped);
    unmatchedHeaders.push(...maps.unmatched);
    varSheet.objects.forEach((obj, i) => {
      const item_name = getCell(obj, headerIndex, "item_name");
      const category_name = getCell(obj, headerIndex, "category_name") || null;
      const variant_name = getCell(obj, headerIndex, "variant_name");
      const price = parseNum(getCell(obj, headerIndex, "variant_price"));
      const errors: string[] = [];
      resolveItemRef(item_name, category_name, errors);
      if (!variant_name) errors.push("Variant name is required");
      if (price == null || price < 0) errors.push("Valid variant price required");
      variants.push({
        row: i + 2,
        item_name,
        category_name,
        variant_name,
        variant_type: getCell(obj, headerIndex, "variant_type") || null,
        variant_price: price != null && price >= 0 ? price : 0,
        variant_size_value: getCell(obj, headerIndex, "variant_size_value") || null,
        variant_size_unit: getCell(obj, headerIndex, "variant_size_unit") || null,
        is_default: parseBool(getCell(obj, headerIndex, "is_default"), false),
        display_order: parseIntSafe(getCell(obj, headerIndex, "display_order"), i),
        errors,
      });
    });
  }

  const customizations: MappedCustomizationRow[] = [];
  const custSheet = byKind.get("customizations");
  const custKeys = new Set<string>();
  if (custSheet) {
    const headerIndex = buildHeaderIndex(custSheet.headers, CUST_FIELDS);
    const maps = mappingRows(custSheet.name, custSheet.headers, custSheet.objects, headerIndex, CUST_FIELDS);
    fieldMappings.push(...maps.mapped);
    unmatchedHeaders.push(...maps.unmatched);
    custSheet.objects.forEach((obj, i) => {
      const item_name = getCell(obj, headerIndex, "item_name");
      const category_name = getCell(obj, headerIndex, "category_name") || null;
      const customization_title = getCell(obj, headerIndex, "customization_title");
      const typeRaw = getCell(obj, headerIndex, "customization_type");
      const errors: string[] = [];
      resolveItemRef(item_name, category_name, errors);
      if (!customization_title) errors.push("Customization title is required");
      const allowed = ["Radio", "Checkbox", "Dropdown", "Text"];
      const customization_type = typeRaw
        ? allowed.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) ?? typeRaw
        : "Checkbox";
      if (typeRaw && !allowed.some((t) => t.toLowerCase() === typeRaw.toLowerCase())) {
        errors.push("Type must be Radio, Checkbox, Dropdown, or Text");
      }
      const min_selection = parseIntSafe(getCell(obj, headerIndex, "min_selection"), 0);
      const max_selection = parseIntSafe(getCell(obj, headerIndex, "max_selection"), 1);
      customizations.push({
        row: i + 2,
        item_name,
        category_name,
        customization_title,
        customization_type,
        is_required: parseBool(getCell(obj, headerIndex, "is_required"), false),
        min_selection,
        max_selection: max_selection >= 1 ? max_selection : 1,
        display_order: parseIntSafe(getCell(obj, headerIndex, "display_order"), i),
        errors,
      });
      if (item_name && customization_title) {
        custKeys.add(`${itemKey(item_name, category_name)}||${normKey(customization_title)}`);
        custKeys.add(`${normKey(item_name)}||||${normKey(customization_title)}`);
      }
    });
  }

  const addons: MappedAddonRow[] = [];
  const addonSheet = byKind.get("addons");
  if (addonSheet) {
    const headerIndex = buildHeaderIndex(addonSheet.headers, ADDON_FIELDS);
    const maps = mappingRows(addonSheet.name, addonSheet.headers, addonSheet.objects, headerIndex, ADDON_FIELDS);
    fieldMappings.push(...maps.mapped);
    unmatchedHeaders.push(...maps.unmatched);
    addonSheet.objects.forEach((obj, i) => {
      const item_name = getCell(obj, headerIndex, "item_name");
      const category_name = getCell(obj, headerIndex, "category_name") || null;
      const customization_title = getCell(obj, headerIndex, "customization_title");
      const addon_name = getCell(obj, headerIndex, "addon_name");
      const price = parseNum(getCell(obj, headerIndex, "addon_price"));
      const errors: string[] = [];
      resolveItemRef(item_name, category_name, errors);
      if (!customization_title) errors.push("Customization group is required");
      if (!addon_name) errors.push("Option name is required");
      if (price != null && price < 0) errors.push("Invalid option price");
      if (item_name && customization_title && custKeys.size > 0) {
        const k1 = `${itemKey(item_name, category_name)}||${normKey(customization_title)}`;
        const k2 = `${normKey(item_name)}||||${normKey(customization_title)}`;
        if (!custKeys.has(k1) && !custKeys.has(k2)) {
          errors.push(`Customization "${customization_title}" is not on the Customizations sheet for this item`);
        }
      }
      addons.push({
        row: i + 2,
        item_name,
        category_name,
        customization_title,
        addon_name,
        addon_price: price != null && price >= 0 ? price : 0,
        addon_size_value: parseNum(getCell(obj, headerIndex, "addon_size_value")),
        addon_size_unit: getCell(obj, headerIndex, "addon_size_unit") || null,
        in_stock: parseBool(getCell(obj, headerIndex, "in_stock"), true),
        display_order: parseIntSafe(getCell(obj, headerIndex, "display_order"), i),
        errors,
      });
    });
  }

  if (categories.length > MENU_XLSX_LIMITS.categories) {
    workbookErrors.push(`Too many categories (max ${MENU_XLSX_LIMITS.categories})`);
  }
  if (items.length > MENU_XLSX_LIMITS.items) {
    workbookErrors.push(`Too many items (max ${MENU_XLSX_LIMITS.items})`);
  }
  if (variants.length > MENU_XLSX_LIMITS.variants) {
    workbookErrors.push(`Too many variants (max ${MENU_XLSX_LIMITS.variants})`);
  }
  if (customizations.length > MENU_XLSX_LIMITS.customizations) {
    workbookErrors.push(`Too many customizations (max ${MENU_XLSX_LIMITS.customizations})`);
  }
  if (addons.length > MENU_XLSX_LIMITS.addons) {
    workbookErrors.push(`Too many customization options (max ${MENU_XLSX_LIMITS.addons})`);
  }
  if (items.length === 0 && workbookErrors.length === 0) {
    workbookErrors.push("The file has no menu item rows to import.");
  }

  return {
    fileName: opts.fileName,
    fieldMappings,
    unmatchedHeaders,
    categories,
    items,
    variants,
    customizations,
    addons,
    workbookErrors,
  };
}

export async function parseMenuXlsxFile(file: File, opts: Omit<MenuXlsxParseOpts, "fileName">): Promise<ParsedMenuWorkbook> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheets: AoASheet[] = wb.SheetNames.map((name) => ({
    name,
    rows: (XLSX.utils.sheet_to_json(wb.Sheets[name]!, { header: 1, defval: "", raw: false }) as unknown[][]) ?? [],
  }));
  return parseMenuSheets(sheets, { ...opts, fileName: file.name });
}

export type MenuXlsxTemplateOpts = {
  itemFormVariant?: "grocery" | "standard";
  showCuisineField?: boolean;
};

export function buildMenuXlsxTemplateSheets(opts: MenuXlsxTemplateOpts = {}): {
  fileName: string;
  sheets: { name: string; rows: unknown[][] }[];
} {
  const isGrocery = opts.itemFormVariant === "grocery";
  const showCuisine = Boolean(opts.showCuisineField) && !isGrocery;

  if (isGrocery) {
    const cats: unknown[][] = [
      ["category_name", "parent_category_name", "category_description", "display_order", "is_active"],
      ["Dairy", "", "Milk and dairy", 1, "yes"],
      ["Packaged snacks", "", "Namkeen and chips", 2, "yes"],
    ];
    const items: unknown[][] = [
      [
        "item_name",
        "category_name",
        "item_description",
        "base_price",
        "selling_price",
        "in_stock",
        "available_quantity",
        "low_stock_threshold",
        "preparation_time_minutes",
        "expiry_date",
        "item_size_value",
        "item_size_unit",
        "available_for_delivery",
        "weight_per_serving",
        "weight_per_serving_unit",
        "calories_kcal",
        "is_active",
      ],
      [
        "Toned milk 500ml",
        "Dairy",
        "Fresh toned milk",
        32,
        32,
        "yes",
        40,
        8,
        15,
        "2026-12-31",
        500,
        "ml",
        "yes",
        500,
        "grams",
        320,
        "yes",
      ],
      [
        "Salted chips",
        "Packaged snacks",
        "Crispy potato chips",
        20,
        20,
        "yes",
        80,
        10,
        10,
        "2027-03-15",
        50,
        "grams",
        "yes",
        50,
        "grams",
        260,
        "yes",
      ],
    ];
    const variants: unknown[][] = [
      ["item_name", "category_name", "variant_name", "variant_type", "variant_price", "variant_size_value", "variant_size_unit", "is_default", "display_order"],
      ["Toned milk 500ml", "Dairy", "500 ml", "Size", 28, 500, "ml", "yes", 0],
      ["Toned milk 500ml", "Dairy", "1 L", "Size", 52, 1, "L", "no", 1],
    ];
    const custs: unknown[][] = [
      ["item_name", "category_name", "customization_title", "customization_type", "is_required", "min_selection", "max_selection", "display_order"],
      ["Salted chips", "Packaged snacks", "Pack size note", "Text", "no", 0, 1, 0],
    ];
    const addons: unknown[][] = [
      ["item_name", "category_name", "customization_title", "addon_name", "addon_price", "addon_size_value", "addon_size_unit", "in_stock", "display_order"],
      ["Salted chips", "Packaged snacks", "Pack size note", "Family pack", 10, 100, "grams", "yes", 0],
    ];
    return {
      fileName: "grocery-menu-template.xlsx",
      sheets: [
        { name: "Categories", rows: cats },
        { name: "Items", rows: items },
        { name: "Variants", rows: variants },
        { name: "Customizations", rows: custs },
        { name: "Customization Options", rows: addons },
      ],
    };
  }

  const cats: unknown[][] = showCuisine
    ? [
        ["category_name", "parent_category_name", "cuisine", "category_description", "display_order", "is_active"],
        ["Chowmein Rolls", "", "Chinese", "All chowmein rolls", 1, "yes"],
        ["Veg Rolls", "Chowmein Rolls", "", "Vegetarian rolls", 1, "yes"],
      ]
    : [
        ["category_name", "parent_category_name", "category_description", "display_order", "is_active"],
        ["Chowmein Rolls", "", "All chowmein rolls", 1, "yes"],
        ["Veg Rolls", "Chowmein Rolls", "Vegetarian rolls", 1, "yes"],
      ];
  const itemHeaders = [
    "item_name",
    "category_name",
    "food_type",
    "spice_level",
    ...(showCuisine ? ["cuisine_type"] : []),
    "item_description",
    "allergens",
    "base_price",
    "selling_price",
    "in_stock",
    "available_quantity",
    "low_stock_threshold",
    "preparation_time_minutes",
    "serves_label",
    "item_size_value",
    "item_size_unit",
    "packaging_charges",
    "is_popular",
    "is_recommended",
    "is_active",
  ];
  const vegRow = [
    "Veg Chowmein Roll",
    "Veg Rolls",
    "VEG",
    "Mild",
    ...(showCuisine ? ["Chinese"] : []),
    "Veg noodles wrapped in a roll",
    "Gluten, Soy",
    120,
    120,
    "yes",
    50,
    5,
    20,
    "1 person",
    1,
    "piece",
    "",
    "no",
    "yes",
    "yes",
  ];
  const chickenRow = [
    "Chicken Chowmein Roll",
    "Chowmein Rolls",
    "NON_VEG",
    "Medium",
    ...(showCuisine ? ["Chinese"] : []),
    "Chicken noodles wrapped in a roll",
    "Gluten, Soy",
    160,
    160,
    "yes",
    40,
    5,
    25,
    "1 person",
    1,
    "piece",
    "",
    "yes",
    "no",
    "yes",
  ];
  const variants: unknown[][] = [
    ["item_name", "category_name", "variant_name", "variant_type", "variant_price", "variant_size_value", "variant_size_unit", "is_default", "display_order"],
    ["Veg Chowmein Roll", "Veg Rolls", "Half", "Size", 99, "", "", "yes", 0],
    ["Veg Chowmein Roll", "Veg Rolls", "Full", "Size", 149, "", "", "no", 1],
  ];
  const custs: unknown[][] = [
    ["item_name", "category_name", "customization_title", "customization_type", "is_required", "min_selection", "max_selection", "display_order"],
    ["Veg Chowmein Roll", "Veg Rolls", "Extra toppings", "Checkbox", "no", 0, 3, 0],
  ];
  const addons: unknown[][] = [
    ["item_name", "category_name", "customization_title", "addon_name", "addon_price", "addon_size_value", "addon_size_unit", "in_stock", "display_order"],
    ["Veg Chowmein Roll", "Veg Rolls", "Extra toppings", "Extra cheese", 20, "", "", "yes", 0],
    ["Veg Chowmein Roll", "Veg Rolls", "Extra toppings", "Extra mayo", 10, "", "", "yes", 1],
  ];
  return {
    fileName: "restaurant-menu-template.xlsx",
    sheets: [
      { name: "Categories", rows: cats },
      { name: "Items", rows: [itemHeaders, vegRow, chickenRow] },
      { name: "Variants", rows: variants },
      { name: "Customizations", rows: custs },
      { name: "Customization Options", rows: addons },
    ],
  };
}

export async function downloadMenuXlsxTemplate(opts: MenuXlsxTemplateOpts = {}): Promise<void> {
  const XLSX = await import("xlsx");
  const { fileName, sheets } = buildMenuXlsxTemplateSheets(opts);
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  XLSX.writeFile(wb, fileName);
}

export type MenuBulkImportPayload = {
  categories: MappedCategoryRow[];
  items: MappedItemRow[];
  variants: MappedVariantRow[];
  customizations: MappedCustomizationRow[];
  addons: MappedAddonRow[];
};

export function toBulkImportPayload(parsed: ParsedMenuWorkbook): MenuBulkImportPayload {
  return {
    categories: parsed.categories,
    items: parsed.items,
    variants: parsed.variants,
    customizations: parsed.customizations,
    addons: parsed.addons,
  };
}
