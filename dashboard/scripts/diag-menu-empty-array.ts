import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

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
  const sql = postgres(toSession(process.env.DATABASE_URL!), { max: 1 });
  const empty: string[] = [];
  try {
    // Mimic many params + empty array like the full UPDATE
    await sql`
      UPDATE merchant_menu_items
      SET item_name = ${"Egg Veg. Roll"},
          item_description = ${"test"},
          category_id = ${95},
          food_type = ${"EGG"},
          spice_level = ${"Medium"},
          cuisine_type = ${"Chinese"},
          base_price = ${100},
          selling_price = ${100},
          discount_percentage = ${0},
          tax_percentage = ${0},
          preparation_time_minutes = ${15},
          packaging_charges = ${null},
          serves = ${null},
          serves_label = ${null},
          short_name = ${null},
          display_order = ${0},
          item_size_value = ${null},
          item_size_unit = ${null},
          size_preset = ${null},
          available_for_delivery = ${true},
          in_stock = ${true},
          available_quantity = ${null},
          low_stock_threshold = ${null},
          expiry_date = ${null},
          is_active = ${true},
          is_popular = ${false},
          is_recommended = ${false},
          allergens = ${empty},
          weight_per_serving = ${null},
          weight_per_serving_unit = ${"grams"},
          calories_kcal = ${null},
          protein = ${null},
          protein_unit = ${"mg"},
          carbohydrates = ${null},
          carbohydrates_unit = ${"mg"},
          fat = ${null},
          fat_unit = ${"mg"},
          fibre = ${null},
          fibre_unit = ${"mg"},
          item_tags = ${["Chinese", "Rolls"]},
          has_customizations = ${false},
          has_addons = ${false},
          has_variants = ${false},
          updated_at = NOW()
      WHERE id = 247 AND store_id = 102
    `;
    console.log("many-params empty allergens OK");
  } catch (e) {
    console.error("FAILED", e);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
