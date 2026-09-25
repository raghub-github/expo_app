import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

function toSession(url: string): string {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}

async function main() {
  const sql = postgres(toSession(process.env.DATABASE_URL!), { max: 1 });
  try {
    const checks = await sql`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.merchant_menu_items'::regclass
    `;
    console.log("constraints", JSON.stringify(checks, null, 2));

    const triggers = await sql`
      SELECT tgname, pg_get_triggerdef(oid) AS def
      FROM pg_trigger
      WHERE tgrelid = 'public.merchant_menu_items'::regclass
        AND NOT tgisinternal
    `;
    console.log("triggers", JSON.stringify(triggers, null, 2));

    const foodTypes = await sql`
      SELECT DISTINCT food_type FROM merchant_menu_items WHERE store_id = 102 LIMIT 20
    `;
    console.log("food_types", foodTypes);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
