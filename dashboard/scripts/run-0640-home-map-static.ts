/**
 * Apply 0640 home map static (dashboard app asset slot + home_map_mode config).
 * I/O-safe: session-mode URL, short lock/statement timeouts, idempotent re-run.
 *
 * Run from dashboard:
 *   npx tsx scripts/run-0640-home-map-static.ts
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
    const migrationPath = path.join(process.cwd(), "drizzle", "0640_home_map_static.sql");
    if (!fs.existsSync(migrationPath)) {
      console.error("Migration file missing:", migrationPath);
      process.exit(1);
    }
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));

    const [asset] = await sql<{ id: string; app: string }[]>`
      SELECT id, app
      FROM public.app_static_assets
      WHERE id = 'dashboard.home.map_static'
      LIMIT 1
    `;
    const [cfg] = await sql<{ config_key: string }[]>`
      SELECT config_key
      FROM public.system_config
      WHERE config_key = 'dashboard.home_map_mode'
      LIMIT 1
    `;
    const [chk] = await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'app_static_assets'
        AND con.contype = 'c'
        AND con.conname = 'app_static_assets_app_check'
      LIMIT 1
    `;

    const ok =
      asset?.id === "dashboard.home.map_static" &&
      asset?.app === "dashboard" &&
      cfg?.config_key === "dashboard.home_map_mode" &&
      String(chk?.def ?? "").toLowerCase().includes("dashboard");

    if (!ok) {
      console.error("❌ 0640 not fully applied", { asset, cfg, chk });
      process.exit(1);
    }
    console.log("✅ 0640 applied (home map static slot + mode config + dashboard app check)");
  } catch (e) {
    console.error("❌ 0640 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
