/**
 * Simulate full PUT update path for menu item 247.
 */
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { normalizeSizeWrite, numericSizeOrNull } from "../src/lib/menu-size-preset";
import {
  mergeBool,
  mergeNum,
  mergeNumNullable,
  mergeOptionalStr,
  mergeStringArray,
  mergeStringArrayOrComma,
} from "../src/lib/db/sql-json-body";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

function toSession(url: string): string {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}

async function main() {
  const raw = process.env.DATABASE_URL!;
  const sql = postgres(toSession(raw), { max: 1 });
  const menuItemId = 247;
  const storeId = 102;
  try {
    const [e] = await sql`
      SELECT item_name, item_description, category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, discount_percentage, tax_percentage,
             preparation_time_minutes, packaging_charges, serves, serves_label,
             short_name, display_order, item_size_value, item_size_unit, size_preset, available_for_delivery,
             in_stock, available_quantity, low_stock_threshold, expiry_date,
             is_active, is_popular, is_recommended, allergens,
             weight_per_serving, weight_per_serving_unit, calories_kcal,
             protein, protein_unit, carbohydrates, carbohydrates_unit,
             fat, fat_unit, fibre, fibre_unit, item_tags,
             has_customizations, has_addons, has_variants
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
      LIMIT 1
    `;
    console.log("existing food_type", e.food_type, typeof e.food_type);
    console.log("existing spice", e.spice_level);
    console.log("existing category", e.category_id);

    const body: Record<string, unknown> = {
      item_name: "Egg Veg. Roll",
      item_description: e.item_description,
      category_id: e.category_id,
      food_type: e.food_type,
      spice_level: e.spice_level,
      cuisine_type: e.cuisine_type,
      base_price: Number(e.base_price),
      selling_price: Number(e.selling_price),
      discount_percentage: 0,
      tax_percentage: 0,
      in_stock: true,
      available_quantity: null,
      low_stock_threshold: null,
      is_active: true,
      is_popular: false,
      is_recommended: false,
      preparation_time_minutes: e.preparation_time_minutes,
      packaging_charges: null,
      serves: null,
      serves_label: null,
      item_size_value: null,
      item_size_unit: null,
      size_preset: null,
      allergens: [],
      expiry_date: null,
      available_for_delivery: true,
      weight_per_serving: null,
      weight_per_serving_unit: "grams",
      calories_kcal: null,
      protein: null,
      protein_unit: "mg",
      carbohydrates: null,
      carbohydrates_unit: "mg",
      fat: null,
      fat_unit: "mg",
      fibre: null,
      fibre_unit: "mg",
      item_tags: ["Chinese", "Rolls", "Fast Food"],
    };

    const item_name = String(body.item_name).trim();
    const item_description = mergeOptionalStr(body.item_description, e.item_description);
    const category_id = mergeNum(body.category_id, e.category_id);
    const food_type = mergeOptionalStr(body.food_type, e.food_type);
    const spice_level = mergeOptionalStr(body.spice_level, e.spice_level);
    const cuisine_type = mergeOptionalStr(body.cuisine_type, e.cuisine_type);
    const base_price = mergeNum(body.base_price, e.base_price);
    const selling_price = mergeNum(body.selling_price, e.selling_price);
    const discount_percentage = mergeNum(body.discount_percentage, e.discount_percentage);
    const tax_percentage = mergeNum(body.tax_percentage, e.tax_percentage);
    const preparation_time_minutes = mergeNumNullable(body.preparation_time_minutes, e.preparation_time_minutes);
    const packaging_charges = mergeNumNullable(body.packaging_charges, e.packaging_charges);
    const serves = mergeNumNullable(body.serves, e.serves);
    const serves_label = mergeOptionalStr(body.serves_label, e.serves_label);
    const short_name = mergeOptionalStr(undefined, e.short_name);
    const display_order = mergeNum(undefined, e.display_order);
    const itemSize = normalizeSizeWrite({
      size_preset: body.size_preset,
      size_value: body.item_size_value,
      size_unit: body.item_size_unit,
    });
    const item_size_value = numericSizeOrNull(itemSize.size_value);
    const item_size_unit = itemSize.size_unit;
    const size_preset = itemSize.size_preset;
    const available_for_delivery = mergeBool(body.available_for_delivery, e.available_for_delivery);
    const in_stock = mergeBool(body.in_stock, e.in_stock);
    const is_active = mergeBool(body.is_active, e.is_active);
    const is_popular = mergeBool(body.is_popular, e.is_popular);
    const is_recommended = mergeBool(body.is_recommended, e.is_recommended);
    const allergens = mergeStringArray(body.allergens, e.allergens);
    const weight_per_serving = mergeNumNullable(body.weight_per_serving, e.weight_per_serving);
    const weight_per_serving_unit = mergeOptionalStr(body.weight_per_serving_unit, e.weight_per_serving_unit);
    const calories_kcal = mergeNumNullable(body.calories_kcal, e.calories_kcal);
    const protein = mergeNumNullable(body.protein, e.protein);
    const protein_unit = mergeOptionalStr(body.protein_unit, e.protein_unit);
    const carbohydrates = mergeNumNullable(body.carbohydrates, e.carbohydrates);
    const carbohydrates_unit = mergeOptionalStr(body.carbohydrates_unit, e.carbohydrates_unit);
    const fat = mergeNumNullable(body.fat, e.fat);
    const fat_unit = mergeOptionalStr(body.fat_unit, e.fat_unit);
    const fibre = mergeNumNullable(body.fibre, e.fibre);
    const fibre_unit = mergeOptionalStr(body.fibre_unit, e.fibre_unit);
    const item_tags_arr = mergeStringArrayOrComma(body.item_tags, e.item_tags);
    const item_tags = item_tags_arr.length ? item_tags_arr : null;
    const has_customizations = mergeBool(undefined, e.has_customizations);
    const has_addons = mergeBool(undefined, e.has_addons);
    const has_variants = mergeBool(undefined, e.has_variants);
    const available_quantity = mergeNumNullable(body.available_quantity, e.available_quantity);
    const low_stock_threshold = mergeNumNullable(body.low_stock_threshold, e.low_stock_threshold);
    const expiry_date = null;

    console.log("values", {
      food_type,
      spice_level,
      size_preset,
      allergens,
      item_tags,
      serves,
      packaging_charges,
    });

    await sql`
      UPDATE merchant_menu_items
      SET item_name = ${item_name},
          item_description = ${item_description},
          category_id = ${category_id},
          food_type = ${food_type},
          spice_level = ${spice_level},
          cuisine_type = ${cuisine_type},
          base_price = ${base_price},
          selling_price = ${selling_price},
          discount_percentage = ${discount_percentage},
          tax_percentage = ${tax_percentage},
          preparation_time_minutes = ${preparation_time_minutes},
          packaging_charges = ${packaging_charges},
          serves = ${serves},
          serves_label = ${serves_label},
          short_name = ${short_name},
          display_order = ${display_order},
          item_size_value = ${item_size_value},
          item_size_unit = ${item_size_unit},
          size_preset = ${size_preset},
          available_for_delivery = ${available_for_delivery},
          in_stock = ${in_stock},
          available_quantity = ${available_quantity},
          low_stock_threshold = ${low_stock_threshold},
          expiry_date = ${expiry_date},
          is_active = ${is_active},
          is_popular = ${is_popular},
          is_recommended = ${is_recommended},
          allergens = ${allergens},
          weight_per_serving = ${weight_per_serving},
          weight_per_serving_unit = ${weight_per_serving_unit},
          calories_kcal = ${calories_kcal},
          protein = ${protein},
          protein_unit = ${protein_unit},
          carbohydrates = ${carbohydrates},
          carbohydrates_unit = ${carbohydrates_unit},
          fat = ${fat},
          fat_unit = ${fat_unit},
          fibre = ${fibre},
          fibre_unit = ${fibre_unit},
          item_tags = ${item_tags},
          has_customizations = ${has_customizations},
          has_addons = ${has_addons},
          has_variants = ${has_variants},
          updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    console.log("FULL UPDATE OK");
  } catch (e) {
    console.error("FULL UPDATE FAILED:", e);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
