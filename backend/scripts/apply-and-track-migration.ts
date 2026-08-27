/**
 * Apply one SQL file and record it in schema_migrations (I/O-safe tracker write).
 * Usage: npx tsx scripts/apply-and-track-migration.ts drizzle/0571_menu_item_expiry_date.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1, idle_timeout: 30, connect_timeout: 30 });

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: npx tsx scripts/apply-and-track-migration.ts drizzle/XXXX.sql");
  process.exit(1);
}
const filePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(backendRoot, fileArg);
const fileName = path.basename(filePath);
const version = fileName.replace(/\.sql$/i, "");

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf8");
const trackOnly = process.argv.includes("--track-only");

async function run() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER
    );
  `);

  const existing = await sql`
    SELECT 1 FROM public.schema_migrations WHERE version = ${version} LIMIT 1
  `;
  if (existing.length > 0) {
    console.log(`already tracked: ${fileName}`);
    await sql.end();
    return;
  }

  const started = Date.now();
  if (!trackOnly) {
    console.log(`Applying ${fileName} …`);
    await sql.unsafe(content);
  } else {
    console.log(`Tracking only (SQL already applied): ${fileName}`);
  }
  const ms = Date.now() - started;
  await sql`
    INSERT INTO public.schema_migrations (version, name, execution_time_ms)
    VALUES (${version}, ${fileName}, ${ms})
    ON CONFLICT (version) DO NOTHING
  `;
  console.log(`✓ ${fileName} (${ms}ms)`);
  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
