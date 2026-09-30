import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
function toSession(url: string) {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}
const sql = postgres(toSession(process.env.DATABASE_URL!), { max: 1, prepare: false });

async function main() {
  const fn = await sql`
    SELECT pg_get_functiondef(oid) AS def
    FROM pg_proc WHERE proname = 'generate_formatted_order_id' LIMIT 1
  `;
  console.log(fn[0]?.def);

  // Who deletes? Check pg_stat or event trigger? Look at cancel that might soft-delete via moving to backup
  const trigDel = await sql`
    SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE tgrelid = 'orders_core'::regclass AND NOT tgisinternal
      AND (tgname ILIKE '%del%' OR pg_get_triggerdef(oid) ILIKE '%DELETE%' OR pg_get_triggerdef(oid) ILIKE '%backup%')
  `;
  console.log("delete-related triggers", trigDel);

  await sql.end({ timeout: 5 });
}
main().catch((e) => { console.error(e); process.exit(1); });
