import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("NO_DATABASE_URL");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function probe(label, fn) {
  try {
    await fn();
    console.log(`${label}: OK`);
  } catch (e) {
    console.log(`${label}:`, e.message);
  }
}

await probe("state_surge_settings", () => sql`SELECT 1 FROM state_surge_settings LIMIT 1`);
await probe("state_surge_configs", () => sql`SELECT 1 FROM state_surge_configs LIMIT 1`);
await probe("state_surge_time_slots", () => sql`SELECT 1 FROM state_surge_time_slots LIMIT 1`);

try {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'state_surge_configs' AND column_name LIKE 'applies_%'
  `;
  console.log("applies columns:", cols.map((c) => c.column_name).join(", ") || "NONE");
} catch (e) {
  console.log("cols check:", e.message);
}

await sql.end();
