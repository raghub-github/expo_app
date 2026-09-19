/**
 * Apply 0638 merchant_wallet_debit allow MANUAL_DEBIT overdraft (negative available).
 * I/O-safe: session-mode URL, CREATE OR REPLACE, idempotent re-run.
 *
 * Run from dashboard:
 *   npx tsx scripts/run-0638-merchant-wallet-debit-overdraft.ts
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
      "0638_merchant_wallet_debit_allow_manual_overdraft.sql"
    );
    if (!fs.existsSync(migrationPath)) {
      console.error("Migration file missing:", migrationPath);
      process.exit(1);
    }
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));

    const [fn] = await sql<{ src: string }[]>`
      SELECT pg_get_functiondef(p.oid) AS src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'merchant_wallet_debit'
      ORDER BY p.oid DESC
      LIMIT 1
    `;
    const src = String(fn?.src ?? "");
    const ok =
      src.includes("MANUAL_DEBIT") &&
      (src.includes("v_allow_negative") || src.includes("allow_negative") || src.includes("overdraft"));
    if (!ok) {
      console.error("❌ 0638 not applied — function body missing overdraft logic");
      process.exit(1);
    }
    console.log("✅ 0638 applied (merchant_wallet_debit allows MANUAL_DEBIT overdraft)");
  } catch (e) {
    console.error("❌ 0638 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
