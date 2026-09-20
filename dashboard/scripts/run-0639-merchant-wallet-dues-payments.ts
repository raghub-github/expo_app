/**
 * Apply 0639 merchant_wallet_dues_payments (UPI clear-dues audit).
 * I/O-safe: session-mode URL, CREATE IF NOT EXISTS, idempotent re-run.
 *
 * Run from dashboard:
 *   npx tsx scripts/run-0639-merchant-wallet-dues-payments.ts
 */
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

for (const name of [".env.local", ".env"]) {
  const envPath = path.join(process.cwd(), name);
  if (!fs.existsSync(envPath)) continue;
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

function toSessionModeUrl(url: string): string {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}

async function main() {
  const sql = postgres(toSessionModeUrl(databaseUrl), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });
  try {
    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0639_merchant_wallet_dues_payments.sql"
    );
    if (!fs.existsSync(migrationPath)) {
      console.error("Migration file missing:", migrationPath);
      process.exit(1);
    }
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));

    const rows = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public.merchant_wallet_dues_payments') IS NOT NULL AS exists
    `;
    if (!rows[0]?.exists) {
      console.error("❌ 0639 not applied — table missing");
      process.exit(1);
    }
    console.log("✅ 0639 applied (merchant_wallet_dues_payments)");
  } catch (e) {
    console.error("❌ 0639 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
