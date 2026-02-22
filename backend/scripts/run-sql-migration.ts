/**
 * Run a single SQL migration file using DATABASE_URL from .env.
 * Usage (from backend folder): npx tsx scripts/run-sql-migration.ts drizzle/0092_order_events_add_payload_actor.sql
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
const sql = postgres(env.DATABASE_URL, { max: 1 });

const fileArg = process.argv[2];
const filePath = fileArg
  ? path.isAbsolute(fileArg)
    ? fileArg
    : path.resolve(backendRoot, fileArg)
  : path.resolve(backendRoot, "drizzle/0092_order_events_add_payload_actor.sql");

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf8");

async function run() {
  try {
    await sql.unsafe(content);
    console.log("Migration ran successfully:", path.basename(filePath));
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
