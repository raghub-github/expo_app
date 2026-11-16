import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, fetch_types: true });
const migrationPath = path.join(root, "drizzle", "0454_merchant_action_otps.sql");
const query = fs.readFileSync(migrationPath, "utf8");

try {
  await sql.unsafe(query);
  const rows = await sql`SELECT to_regclass('public.merchant_action_otps') AS t`;
  console.log("merchant_action_otps:", rows[0]?.t ?? "missing");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
