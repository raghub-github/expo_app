/**
 * Cheap catalog/map sync. Only touches merchant_onboarding_document_types
 * and merchant_store_type_document_map (small tables). Skips if already normalized.
 *
 * Run from dashboard: npx tsx scripts/run-0569-onboarding-docs.ts
 */
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const databaseUrlRaw = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
if (!databaseUrlRaw) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const databaseUrl: string = databaseUrlRaw;

async function main() {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'merchant_onboarding_document_types',
          'merchant_store_type_document_map'
        )
    `;
    const have = new Set(tables.map((t) => t.table_name));
    if (!have.has("merchant_onboarding_document_types") || !have.has("merchant_store_type_document_map")) {
      console.log("Catalog tables missing — run 0567 then 0568 first.");
      process.exit(1);
    }

    const mixed = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n
      FROM merchant_store_type_document_map
      WHERE store_type IS DISTINCT FROM UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_'))
         OR document_code IS DISTINCT FROM UPPER(REPLACE(REPLACE(BTRIM(document_code), ' ', '_'), '-', '_'))
    `;
    const inactiveMapped = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n
      FROM merchant_onboarding_document_types c
      WHERE c.is_active IS DISTINCT FROM TRUE
        AND EXISTS (
          SELECT 1
          FROM merchant_store_type_document_map m
          WHERE m.is_active = TRUE
            AND UPPER(BTRIM(m.document_code)) = UPPER(BTRIM(c.code))
        )
    `;
    const mixedN = Number(mixed[0]?.n ?? 0);
    const inactiveN = Number(inactiveMapped[0]?.n ?? 0);
    if (mixedN === 0 && inactiveN === 0) {
      console.log("0569 not needed: store types already normalized, mapped catalog rows already active.");
      return;
    }
    console.log(`Running 0569 (mixed_case_rows=${mixedN}, inactive_mapped_catalog=${inactiveN})`);
    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0569_sync_merchant_onboarding_docs_from_map.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    await sql.unsafe(migrationSQL);
    console.log("0569 applied.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
