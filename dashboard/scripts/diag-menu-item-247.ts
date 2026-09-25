/**
 * Probe merchant_menu_items columns + simulate update for item 247 / store 102.
 */
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
  const raw = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!raw) throw new Error("no db");
  const sql = postgres(toSession(raw), { max: 1 });
  try {
    const cols = await sql`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'merchant_menu_items'
        AND column_name IN (
          'size_preset','allergens','item_tags','available_for_delivery',
          'weight_per_serving','calories_kcal','protein','item_name',
          'packaging_charges','serves','serves_label'
        )
      ORDER BY column_name
    `;
    console.log("columns:", JSON.stringify(cols, null, 2));

    const [item] = await sql`
      SELECT id, store_id, item_name, size_preset, allergens, item_tags,
             available_for_delivery, packaging_charges
      FROM merchant_menu_items
      WHERE id = 247
      LIMIT 1
    `;
    console.log("item 247:", JSON.stringify(item));

    if (!item) {
      console.log("item not found locally");
      return;
    }

    // Try the fields most likely to fail
    try {
      await sql`
        UPDATE merchant_menu_items
        SET item_name = ${String(item.item_name)},
            size_preset = ${null},
            allergens = ${[] as string[]},
            item_tags = ${["Chinese", "Rolls", "Fast Food"]},
            available_for_delivery = ${true},
            packaging_charges = ${null},
            updated_at = NOW()
        WHERE id = 247
      `;
      console.log("UPDATE with empty allergens [] OK");
    } catch (e) {
      console.error("UPDATE empty allergens FAILED:", e instanceof Error ? e.message : e);
    }

    try {
      await sql`
        UPDATE merchant_menu_items
        SET allergens = ${null},
            item_tags = ${null},
            size_preset = ${"REGULAR"},
            updated_at = NOW()
        WHERE id = 247
      `;
      console.log("UPDATE size_preset REGULAR OK");
    } catch (e) {
      console.error("UPDATE size_preset FAILED:", e instanceof Error ? e.message : e);
    }

    // restore tags
    await sql`
      UPDATE merchant_menu_items
      SET item_tags = ${["Chinese", "Rolls", "Fast Food"]},
          size_preset = ${item.size_preset as string | null},
          allergens = ${item.allergens as string[] | null},
          packaging_charges = ${item.packaging_charges as number | null},
          updated_at = NOW()
      WHERE id = 247
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
