/**
 * Inspect size_preset columns before/after migration 0603.
 * Usage: npx tsx scripts/inspect-size-preset.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

const TABLES = [
  "merchant_menu_items",
  "merchant_menu_item_variants",
  "merchant_menu_item_addons",
] as const;

async function main() {
  for (const table of TABLES) {
    const cols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
        AND column_name IN ('size_preset', 'item_size_value', 'item_size_unit',
                            'variant_size_value', 'variant_size_unit',
                            'addon_size_value', 'addon_size_unit')
      ORDER BY column_name
    `;
    const [countRow] = await sql.unsafe(
      `SELECT COUNT(*)::bigint AS n FROM public.${table}`
    );
    const hasPreset = cols.some((c) => String(c.column_name) === "size_preset");
    let nullPreset = "n/a";
    let invalidPreset = "n/a";
    if (hasPreset) {
      const [n] = await sql.unsafe(
        `SELECT COUNT(*)::bigint AS n FROM public.${table} WHERE size_preset IS NULL`
      );
      const [inv] = await sql.unsafe(
        `SELECT COUNT(*)::bigint AS n FROM public.${table}
         WHERE size_preset IS NOT NULL
           AND size_preset NOT IN ('REGULAR','STANDARD','PREMIUM')`
      );
      nullPreset = String(n?.n ?? "");
      invalidPreset = String(inv?.n ?? "");
    }
    const checks = await sql`
      SELECT conname, pg_get_constraintdef(oid) AS def, convalidated
      FROM pg_constraint
      WHERE conrelid = ${"public." + table}::regclass
        AND conname LIKE '%size_preset%'
    `;
    console.log(JSON.stringify({
      table,
      rowCount: String(countRow?.n ?? ""),
      sizePresetColumn: hasPreset,
      nullSizePreset: nullPreset,
      invalidSizePreset: invalidPreset,
      columns: cols,
      constraints: checks,
    }));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
