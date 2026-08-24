/**
 * Apply 0571 merchant_menu_items.expiry_date (ADD COLUMN IF NOT EXISTS only).
 * Run from dashboard: npx tsx scripts/run-0571-menu-item-expiry.ts
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
    const migrationPath = path.join(process.cwd(), "drizzle", "0571_menu_item_expiry_date.sql");
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));
    const col = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'merchant_menu_items'
          AND column_name = 'expiry_date'
      ) AS exists
    `;
    console.log(col[0]?.exists ? "✅ 0571 applied (expiry_date present)" : "❌ column missing");
    if (!col[0]?.exists) process.exit(1);
  } catch (e) {
    console.error("❌ 0571 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
