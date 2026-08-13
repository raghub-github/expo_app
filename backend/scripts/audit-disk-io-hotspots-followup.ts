/**
 * Read-only follow-up: refund-row explosion + stuck repair candidates.
 * Usage: npx tsx scripts/audit-disk-io-hotspots-followup.ts
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
  connection: {
    statement_timeout: 60_000,
    application_name: "gatimitra-disk-io-followup",
  },
});

async function section(title: string, fn: () => Promise<unknown>) {
  console.log(`\n======== ${title} ========`);
  try {
    const rows = await fn();
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${msg}`);
  }
}

async function main() {
  await section("refunds_per_order_top", async () => sql`
    SELECT order_id,
           COUNT(*)::bigint AS refund_rows,
           MIN(created_at) AS first_at,
           MAX(created_at) AS last_at
    FROM order_refunds
    GROUP BY order_id
    ORDER BY COUNT(*) DESC
    LIMIT 15
  `);

  await section("refund_status_distribution", async () => sql`
    SELECT COALESCE(refund_status, '<null>') AS refund_status,
           COALESCE(execution_status, '<null>') AS execution_status,
           COALESCE(execution_route, '<null>') AS execution_route,
           COUNT(*)::bigint AS n,
           COUNT(*) FILTER (WHERE customer_wallet_ledger_id IS NOT NULL)::bigint AS with_wallet,
           COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NOT NULL)::bigint AS with_rzp
    FROM order_refunds
    GROUP BY 1, 2, 3
    ORDER BY n DESC
    LIMIT 30
  `);

  await section("recent_insert_rate", async () => sql`
    SELECT date_trunc('hour', created_at) AS hour,
           COUNT(*)::bigint AS inserts
    FROM order_refunds
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 24
  `);

  await section("stuck_candidates_detail", async () => sql`
    SELECT c.id AS core_id,
           c.order_id,
           c.grand_total,
           c.payment_status,
           f.order_status,
           f.rejected_reason,
           f.cancelled_by_label,
           f.cancelled_at,
           (
             SELECT COUNT(*) FROM order_refunds r WHERE r.order_id = c.id
           ) AS refund_row_count,
           (
             SELECT r.refund_status FROM order_refunds r
             WHERE r.order_id = c.id ORDER BY r.created_at DESC LIMIT 1
           ) AS latest_refund_status,
           (
             SELECT r.execution_status FROM order_refunds r
             WHERE r.order_id = c.id ORDER BY r.created_at DESC LIMIT 1
           ) AS latest_exec_status,
           (
             SELECT r.execution_route FROM order_refunds r
             WHERE r.order_id = c.id ORDER BY r.created_at DESC LIMIT 1
           ) AS latest_exec_route,
           (
             SELECT left(COALESCE(r.failure_reason, ''), 180) FROM order_refunds r
             WHERE r.order_id = c.id ORDER BY r.created_at DESC LIMIT 1
           ) AS latest_failure
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
        SELECT 1
        FROM order_refunds r
        WHERE r.order_id = c.id
          AND UPPER(COALESCE(r.execution_status, '')) <> 'FAILED'
          AND LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
          AND (
            r.customer_wallet_ledger_id IS NOT NULL
            OR NULLIF(TRIM(COALESCE(r.razorpay_refund_id, '')), '') IS NOT NULL
            OR (
              UPPER(COALESCE(r.execution_status, '')) = 'PROCESSING'
              AND NULLIF(TRIM(COALESCE(r.razorpay_refund_id, '')), '') IS NOT NULL
            )
          )
      )
    ORDER BY c.id DESC
    LIMIT 20
  `);

  await section("pg_stat_target_queryids", async () => sql`
    SELECT queryid::text AS queryid,
           calls,
           round(total_exec_time::numeric, 1) AS total_exec_ms,
           round(mean_exec_time::numeric, 2) AS mean_exec_ms,
           shared_blks_read,
           shared_blks_written,
           (shared_blks_read + shared_blks_written) AS total_shared_io_blks,
           left(query, 500) AS query
    FROM pg_stat_statements
    WHERE queryid IN (
      -5178583257701389277::bigint,
      7922184982722071837::bigint,
      64371871298811481::bigint
    )
    OR (
      query ILIKE '%customer_wallet_ledger_id IS NULL%'
      AND query ILIKE '%ORDER BY created_at DESC%'
    )
    OR (
      query ILIKE '%FROM order_refunds%'
      AND query ILIKE '%execution_status%'
      AND query ILIKE '%LIMIT%'
    )
    ORDER BY shared_blks_read DESC
    LIMIT 10
  `);

  await section("orders_food_cancelled_at_indexes", async () => sql`
    SELECT i.relname AS index_name,
           pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
           pg_get_indexdef(x.indexrelid) AS indexdef,
           s.idx_scan
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid
    WHERE n.nspname = 'public' AND t.relname = 'orders_food'
    ORDER BY i.relname
  `);

  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  try {
    await sql.end({ timeout: 2 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
