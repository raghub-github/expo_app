import { getSql } from "../../db/client.js";

export type AttributeDataType = "string" | "number" | "boolean" | "enum" | "date";

export type AttributeScope = "ITEM" | "VARIANT";

export type AttributeDefinition = {
  id: number;
  store_type: string;
  attribute_name: string;
  data_type: AttributeDataType;
  required: boolean;
  validation_rules: any;
  applies_to?: "ITEM" | "VARIANT" | "BOTH";
};

export type UnifiedAttributes = Record<string, unknown>;

export async function resolveStoreType(storeIdNum: number): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql`
    SELECT store_type
    FROM merchant_stores
    WHERE id = ${storeIdNum}
    LIMIT 1
  `;
  return row ? (row as any).store_type : null;
}

export async function getAttributeDefinitionsByStoreType(
  storeType: string,
  scope: AttributeScope
): Promise<AttributeDefinition[]> {
  const sql = getSql();
  const appliesToPrimary = scope === "ITEM" ? "ITEM" : "VARIANT";
  const rows = await sql`
    SELECT id, store_type, attribute_name, data_type, required, validation_rules, applies_to
    FROM attribute_definitions
    WHERE store_type = ${storeType}
      AND applies_to IN (${appliesToPrimary}, 'BOTH')
  `;
  return rows as any;
}

export async function getStoreTypeConfig(storeType: string): Promise<any | null> {
  const sql = getSql();
  const [row] = await sql`
    SELECT *
    FROM store_type_config
    WHERE store_type = ${storeType}
    LIMIT 1
  `;
  return row ? (row as any) : null;
}

function isValidEnumValue(def: AttributeDefinition, value: unknown): boolean {
  // validation_rules may include: { allowed_values: string[] }
  const allowedValues = def.validation_rules?.allowed_values;
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toUpperCase();
  return allowedValues.some((v: any) => typeof v === "string" && v.trim().toUpperCase() === normalized);
}

function isValidDateValue(_def: AttributeDefinition, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function validateAttributeValue(def: AttributeDefinition, value: unknown): boolean {
  if (value === null || value === undefined) {
    return !def.required;
  }

  const t = def.data_type;
  if (t === "string") {
    const isArray = !!def.validation_rules?.is_array;
    if (isArray) {
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    }
    return typeof value === "string";
  }

  if (t === "number") {
    const isArray = !!def.validation_rules?.is_array;
    if (isArray) {
      return Array.isArray(value) && value.every((v) => typeof v === "number" && !Number.isNaN(v));
    }
    return typeof value === "number" && !Number.isNaN(value);
  }

  if (t === "boolean") return typeof value === "boolean";
  if (t === "enum") return isValidEnumValue(def, value);
  if (t === "date") return isValidDateValue(def, value);

  return false;
}

export function validateAttributesAgainstDefinitions(defs: AttributeDefinition[], attributes: UnifiedAttributes): void {
  const defMap = new Map<string, AttributeDefinition>();
  for (const d of defs) defMap.set(d.attribute_name, d);

  // Enforce no uncontrolled keys.
  for (const key of Object.keys(attributes ?? {})) {
    if (!defMap.has(key)) {
      throw new Error(`UNKNOWN_ATTRIBUTE:${key}`);
    }
  }

  // Enforce required
  for (const def of defs) {
    if (!def.required) continue;
    if (!(def.attribute_name in (attributes ?? {}))) {
      throw new Error(`MISSING_REQUIRED_ATTRIBUTE:${def.attribute_name}`);
    }
    const val = (attributes as any)[def.attribute_name];
    if (!validateAttributeValue(def, val)) {
      throw new Error(`INVALID_REQUIRED_ATTRIBUTE:${def.attribute_name}`);
    }
  }

  // Validate provided
  for (const [key, value] of Object.entries(attributes ?? {})) {
    const def = defMap.get(key);
    if (!def) continue;
    if (!validateAttributeValue(def, value)) {
      throw new Error(`INVALID_ATTRIBUTE_VALUE:${key}`);
    }
  }
}

export async function loadItemAttributes(itemId: number, storeType: string): Promise<UnifiedAttributes> {
  const sql = getSql();

  // If attribute_definitions doesn't exist yet (seed migration not run), return empty.
  const defs = await getAttributeDefinitionsByStoreType(storeType, "ITEM").catch(() => []);
  if (!defs || defs.length === 0) return {};

  const rows = await sql`
    SELECT ad.attribute_name, ia.value
    FROM item_attributes ia
    INNER JOIN attribute_definitions ad ON ad.id = ia.attribute_id
    WHERE ia.item_id = ${itemId}
      AND ad.store_type = ${storeType}
      AND ad.applies_to IN ('ITEM', 'BOTH')
  `;

  const out: UnifiedAttributes = {};
  for (const r of rows as any[]) {
    out[r.attribute_name] = r.value;
  }
  return out;
}

export async function upsertItemAttributes(
  itemId: number,
  storeType: string,
  attributes: UnifiedAttributes
): Promise<void> {
  const sql = getSql();
  const defs = await getAttributeDefinitionsByStoreType(storeType, "ITEM").catch(() => []);
  if (!defs || defs.length === 0) {
    // Seed/backfill not done yet; do not block FOOD system.
    return;
  }

  validateAttributesAgainstDefinitions(defs, attributes ?? {});

  const defMap = new Map<string, AttributeDefinition>();
  for (const d of defs) defMap.set(d.attribute_name, d);

  for (const [key, value] of Object.entries(attributes ?? {})) {
    const def = defMap.get(key);
    if (!def) continue;

    // Skip nullish values: avoids storing explicit JSON null for optional attributes.
    if (value === null || value === undefined) continue;

    await sql`
      INSERT INTO item_attributes (item_id, attribute_id, value)
      VALUES (${itemId}, ${def.id}, ${JSON.stringify(value)}::jsonb)
      ON CONFLICT (item_id, attribute_id)
      DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = NOW()
    `;
  }
}

export async function loadVariantAttributes(
  variantId: number,
  storeType: string
): Promise<UnifiedAttributes> {
  const sql = getSql();

  const defs = await getAttributeDefinitionsByStoreType(storeType, "VARIANT").catch(() => []);
  if (!defs || defs.length === 0) return {};

  const rows = await sql`
    SELECT ad.attribute_name, iva.value
    FROM item_variant_attributes iva
    INNER JOIN attribute_definitions ad ON ad.id = iva.attribute_id
    WHERE iva.variant_id = ${variantId}
      AND ad.store_type = ${storeType}
      AND ad.applies_to IN ('VARIANT', 'BOTH')
  `;

  const out: UnifiedAttributes = {};
  for (const r of rows as any[]) {
    out[r.attribute_name] = r.value;
  }
  return out;
}

export async function upsertVariantAttributes(
  variantId: number,
  storeType: string,
  attributes: UnifiedAttributes
): Promise<void> {
  const sql = getSql();
  const defs = await getAttributeDefinitionsByStoreType(storeType, "VARIANT").catch(() => []);
  if (!defs || defs.length === 0) {
    // No variant-scope definitions seeded yet.
    return;
  }

  validateAttributesAgainstDefinitions(defs, attributes ?? {});

  const defMap = new Map<string, AttributeDefinition>();
  for (const d of defs) defMap.set(d.attribute_name, d);

  for (const [key, value] of Object.entries(attributes ?? {})) {
    const def = defMap.get(key);
    if (!def) continue;
    if (value === null || value === undefined) continue;

    await sql`
      INSERT INTO item_variant_attributes (variant_id, attribute_id, value)
      VALUES (${variantId}, ${def.id}, ${JSON.stringify(value)}::jsonb)
      ON CONFLICT (variant_id, attribute_id)
      DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = NOW()
    `;
  }
}

export function buildFoodLegacyAttributesFromItemRow(itemRow: any): UnifiedAttributes {
  // This keeps legacy FOOD system behavior stable.
  // Later, once backfill exists, item_attributes will override these when present.
  const out: UnifiedAttributes = {};

  const keys: Array<[string, any]> = [
    ["food_type", itemRow.food_type],
    ["spice_level", itemRow.spice_level],
    ["cuisine_type", itemRow.cuisine_type],
    ["serves", itemRow.serves],
    ["serves_label", itemRow.serves_label],
    ["item_size_value", itemRow.item_size_value],
    ["item_size_unit", itemRow.item_size_unit],
    ["available_for_delivery", itemRow.available_for_delivery],
    ["weight_per_serving", itemRow.weight_per_serving],
    ["weight_per_serving_unit", itemRow.weight_per_serving_unit],
    ["calories_kcal", itemRow.calories_kcal],
    ["protein", itemRow.protein],
    ["protein_unit", itemRow.protein_unit],
    ["carbohydrates", itemRow.carbohydrates],
    ["carbohydrates_unit", itemRow.carbohydrates_unit],
    ["fat", itemRow.fat],
    ["fat_unit", itemRow.fat_unit],
    ["fibre", itemRow.fibre],
    ["fibre_unit", itemRow.fibre_unit],
    ["allergens", itemRow.allergens],
    ["item_tags", itemRow.item_tags],
  ];

  for (const [k, v] of keys) {
    if (v !== undefined) out[k] = v;
  }

  return out;
}

