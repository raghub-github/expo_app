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
  const rls = await sql`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class WHERE relname IN ('orders_core','orders_core_items','pending_orders')
  `;
  console.log("rls", rls);

  const policies = await sql`
    SELECT tablename, policyname, cmd, qual
    FROM pg_policies
    WHERE tablename = 'orders_core'
  `;
  console.log("policies", policies);

  // Bypass with tableowner? We're already superuser-ish via DATABASE_URL
  const cnt = await sql`SELECT COUNT(*)::int AS n FROM orders_core`;
  console.log("orders_core count", cnt);

  // Gaps in order_id sequence vs existing
  const gaps = await sql`
    WITH nums AS (
      SELECT gs AS n
      FROM generate_series(10000370, 10000399) gs
    )
    SELECT
      'GM' || n AS order_id,
      EXISTS (SELECT 1 FROM orders_core oc WHERE oc.order_id = 'GM' || n) AS in_core,
      EXISTS (SELECT 1 FROM pending_orders po WHERE po.finalized_order_id = 'GM' || n) AS in_pending,
      EXISTS (SELECT 1 FROM orders_core_payments ocp WHERE ocp.order_id = 'GM' || n) AS in_pay,
      EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = 'GM' || n) AS in_events
    FROM nums
    ORDER BY n
  `;
  for (const g of gaps) console.log(JSON.stringify(g));

  await sql.end({ timeout: 5 });
}
main().catch((e) => { console.error(e); process.exit(1); });
