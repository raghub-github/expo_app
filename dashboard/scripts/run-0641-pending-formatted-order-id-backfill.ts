/**
 * Apply 0641 — backfill pending_orders.checkout_metadata.formatted_order_id
 * so Transactions shows order ids for GatiCash captures even if orders_core is gone.
 *
 *   npx tsx scripts/run-0641-pending-formatted-order-id-backfill.ts
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
    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0641_pending_formatted_order_id_backfill.sql"
    );
    if (!fs.existsSync(migrationPath)) {
      console.error("Migration file missing:", migrationPath);
      process.exit(1);
    }
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));

    const [stats] = await sql<{
      with_meta: number;
      gati_orphan_missing: number;
    }[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE NULLIF(TRIM(checkout_metadata->>'formatted_order_id'), '') IS NOT NULL
        )::int AS with_meta,
        COUNT(*) FILTER (
          WHERE COALESCE(gati_cash_applied,0) > 0.005
            AND COALESCE(grand_total,0) <= 0.005
            AND payment_state IN ('finalized','paid','refunded')
            AND finalized_order_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM orders_core oc WHERE oc.order_id = pending_orders.finalized_order_id
            )
            AND (
              checkout_metadata->>'formatted_order_id' IS NULL
              OR TRIM(checkout_metadata->>'formatted_order_id') = ''
            )
        )::int AS gati_orphan_missing
      FROM pending_orders
    `;

    const sample = await sql`
      SELECT finalized_order_id, checkout_metadata->>'formatted_order_id' AS fmt, payment_state
      FROM pending_orders
      WHERE COALESCE(gati_cash_applied,0) > 0.005
        AND COALESCE(grand_total,0) <= 0.005
      ORDER BY created_at DESC
      LIMIT 8
    `;

    if ((stats?.gati_orphan_missing ?? 1) > 0) {
      console.error("❌ 0641 incomplete — orphan gaticash still missing formatted metadata", stats);
      process.exit(1);
    }
    console.log("✅ 0641 applied", stats);
    for (const s of sample) console.log(JSON.stringify(s));
  } catch (e) {
    console.error("❌ 0641 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
