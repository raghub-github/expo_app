import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function toSessionModeUrl(url: string): string {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}

async function main() {
  const raw = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!raw) throw new Error("no DATABASE_URL");
  const sql = postgres(toSessionModeUrl(raw), { max: 1 });
  try {
    const rows = await sql`
      SELECT
        CASE
          WHEN COALESCE(po.gati_cash_applied,0) > 0.005 AND COALESCE(po.grand_total,0) <= 0.005 THEN 'gaticash'
          WHEN COALESCE(po.gati_cash_applied,0) > 0.005 THEN 'mixed'
          ELSE po.payment_method
        END AS payment_mode,
        ROUND((COALESCE(po.grand_total,0) + COALESCE(po.gati_cash_applied,0)) * 100)::bigint AS gross_paise,
        COALESCE(
          NULLIF(TRIM(oc.formatted_order_id), ''),
          NULLIF(TRIM(po.checkout_metadata->>'formatted_order_id'), ''),
          NULLIF(TRIM(po.billing_snapshot->>'formatted_order_id'), '')
        ) AS business_order_id,
        po.checkout_metadata->>'formatted_order_id' AS meta_fmt
      FROM pending_orders po
      LEFT JOIN LATERAL (
        SELECT oc.formatted_order_id
        FROM orders_core oc
        WHERE po.finalized_order_id IS NOT NULL
          AND TRIM(po.finalized_order_id) <> ''
          AND (
            oc.order_id = po.finalized_order_id
            OR oc.formatted_order_id = po.finalized_order_id
            OR oc.id::text = po.finalized_order_id
          )
        ORDER BY oc.id DESC
        LIMIT 1
      ) oc ON true
      WHERE po.payment_state IN ('finalized','paid','refunded')
      ORDER BY po.created_at DESC
      LIMIT 10
    `;
    for (const r of rows) console.log(JSON.stringify(r));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
