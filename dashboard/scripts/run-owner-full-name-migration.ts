/**
 * Adds owner_full_name to merchant_stores (same as Partner Site).
 * Run: npm run migrate:owner (from dashboard folder; loads .env.local if present)
 */

import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

// Load .env.local so DATABASE_URL is available when running from project
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

const databaseUrl = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
let pgConnectionString: string;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL or NEXT_PUBLIC_DATABASE_URL is required");
  throw new Error("DATABASE_URL or NEXT_PUBLIC_DATABASE_URL is required");
}
pgConnectionString = databaseUrl;

async function run() {
  const sql = postgres(pgConnectionString, { max: 1 });  try {
    const migrationPath = path.join(process.cwd(), "drizzle", "0132_merchant_stores_owner_full_name.sql");
    if (!fs.existsSync(migrationPath)) {
      console.error("❌ Migration file not found:", migrationPath);
      process.exit(1);
    }
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    await sql.unsafe(migrationSQL);
    console.log("✅ owner_full_name column added to merchant_stores");
  } catch (e) {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
