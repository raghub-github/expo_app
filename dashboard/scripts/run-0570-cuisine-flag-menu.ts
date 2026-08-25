/**
 * Apply 0570 cuisine-flag comment + missing store-type flag rows only.
 * Cheap: COMMENT + INSERT … ON CONFLICT DO NOTHING.
 *
 * Run from dashboard: npx tsx scripts/run-0570-cuisine-flag-menu.ts
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
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 20 });
  try {
    const flags = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'merchant_store_type_onboarding_flags'
      ) AS exists
    `;
    if (!flags[0]?.exists) {
      console.error("merchant_store_type_onboarding_flags missing — run 0568 first");
      process.exit(1);
    }

    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0570_cuisine_flag_gates_menu_category.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    await sql.unsafe(migrationSQL);

    const count = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM merchant_store_type_onboarding_flags
    `;
    console.log("✅ 0570 applied. flag rows:", count[0]?.n ?? "?");
  } catch (e) {
    console.error("❌ 0570 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
