/**
 * Post-index EXPLAIN + validity check. Read-only.
 * Usage: npx tsx scripts/audit-disk-io-after-p0.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 30,
  prepare: false,
  connection: { statement_timeout: 60_000, application_name: "gatimitra-disk-io-after-p0" },
});

async function section(title: string, fn: () => Promise<unknown>) {
  console.log(`\n======== ${title} ========`);
  try {
    console.log(JSON.stringify(await fn(), null, 2));
  } catch (err) {
    console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  await sql.unsafe("ANALYZE order_refunds");

  await section("index_valid", async () => sql`
    SELECT i.relname AS index_name,
           x.indisvalid,
           x.indisready,
           pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
           pg_get_indexdef(x.indexrelid) AS indexdef
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'order_refunds'
      AND i.relname = 'idx_or_orderid_created_active_refund'
  `);

  await section("explain_latest_row", async () =>
    sql.unsafe(`EXPLAIN (FORMAT TEXT)
      SELECT id, execution_status, refund_status, customer_wallet_ledger_id,
             razorpay_refund_id, refund_amount, failure_reason, refund_reference
      FROM order_refunds
      WHERE order_id = 73
      ORDER BY created_at DESC
      LIMIT 1`)
  );

  await section("explain_q1_old_reclaim", async () =>
    sql.unsafe(`EXPLAIN (FORMAT TEXT)
       SELECT id
       FROM order_refunds
       WHERE order_id = 73
         AND customer_wallet_ledger_id IS NULL
         AND NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NULL
         AND COALESCE(refund_amount, 0) > 0
       ORDER BY created_at DESC
       LIMIT 1`)
  );

  await section("explain_q2_new_repair", async () =>
    sql.unsafe(`EXPLAIN (FORMAT TEXT)
      SELECT DISTINCT c.id AS core_id
      FROM orders_food f
      JOIN orders_core c ON c.id = f.order_id
      WHERE upper(COALESCE(f.order_status, '')) = 'CANCELLED'
        AND f.cancelled_at IS NOT NULL
        AND f.cancelled_at > NOW() - INTERVAL '30 days'
        AND (
          upper(COALESCE(f.rejected_reason, '')) = 'MERCHANT_ACCEPT_TIMEOUT'
          OR upper(COALESCE(f.cancelled_by_label, '')) = 'AUTO CANCELLED'
          OR upper(COALESCE(f.cancellation_details->>'reason_code', '')) = 'MERCHANT_ACCEPT_TIMEOUT'
        )
        AND NOT EXISTS (
          SELECT 1 FROM order_refunds r WHERE r.order_id = c.id
        )
      ORDER BY c.id DESC
      LIMIT 40`)
  );

  await section("explain_q3_old_active", async () =>
    sql.unsafe(`EXPLAIN (FORMAT TEXT)
       SELECT 1
       FROM order_refunds
       WHERE order_id = 73
         AND UPPER(COALESCE(execution_status, '')) <> 'FAILED'
         AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
         AND (
           customer_wallet_ledger_id IS NOT NULL
           OR NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NOT NULL
           OR UPPER(COALESCE(execution_status, '')) = 'PROCESSING'
         )
       LIMIT 1`)
  );

  await section("new_repair_candidate_count", async () => sql`
    SELECT COUNT(*)::bigint AS candidate_count
    FROM (
      SELECT DISTINCT c.id
      FROM orders_food f
      JOIN orders_core c ON c.id = f.order_id
      WHERE upper(COALESCE(f.order_status, '')) = 'CANCELLED'
        AND f.cancelled_at IS NOT NULL
        AND f.cancelled_at > NOW() - INTERVAL '30 days'
        AND (
          upper(COALESCE(f.rejected_reason, '')) = 'MERCHANT_ACCEPT_TIMEOUT'
          OR upper(COALESCE(f.cancelled_by_label, '')) = 'AUTO CANCELLED'
          OR upper(COALESCE(f.cancellation_details->>'reason_code', '')) = 'MERCHANT_ACCEPT_TIMEOUT'
        )
        AND NOT EXISTS (
          SELECT 1 FROM order_refunds r WHERE r.order_id = c.id
        )
    ) x
  `);

  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  try { await sql.end({ timeout: 2 }); } catch { /* ignore */ }
  process.exit(1);
});
