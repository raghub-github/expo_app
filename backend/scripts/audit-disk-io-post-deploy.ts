/**
 * Post-deploy Disk I/O verification. Read-only. Does not mutate refunds.
 * Usage: npx tsx scripts/audit-disk-io-post-deploy.ts
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
  connection: { statement_timeout: 60_000, application_name: "gatimitra-disk-io-post-deploy" },
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
  await section("inserts_by_minute_last_2h", async () => sql`
    SELECT date_trunc('minute', created_at) AS minute,
           COUNT(*)::bigint AS inserts
    FROM order_refunds
    WHERE created_at > NOW() - INTERVAL '2 hours'
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 30
  `);

  await section("inserts_by_10min_last_6h", async () => sql`
    SELECT date_trunc('hour', created_at)
             + make_interval(mins => (EXTRACT(MINUTE FROM created_at)::int / 10) * 10) AS bucket,
           COUNT(*)::bigint AS inserts
    FROM order_refunds
    WHERE created_at > NOW() - INTERVAL '6 hours'
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 40
  `);

  await section("inserts_by_hour_last_48h", async () => sql`
    SELECT date_trunc('hour', created_at) AS hour,
           COUNT(*)::bigint AS inserts
    FROM order_refunds
    WHERE created_at > NOW() - INTERVAL '48 hours'
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 48
  `);

  await section("stuck_five_counts", async () => sql`
    SELECT c.order_id,
           c.id AS core_id,
           COUNT(r.id)::bigint AS refund_rows,
           MIN(r.created_at) AS first_at,
           MAX(r.created_at) AS last_at,
           MAX(r.created_at) > NOW() - INTERVAL '15 minutes' AS inserted_last_15m,
           MAX(r.created_at) > NOW() - INTERVAL '1 hour' AS inserted_last_1h
    FROM orders_core c
    LEFT JOIN order_refunds r ON r.order_id = c.id
    WHERE c.order_id IN (
      'GM10000209','GM10000210','GM10000215','GM10000216','GM10000218'
    )
    GROUP BY c.order_id, c.id
    ORDER BY c.order_id
  `);

  await section("stuck_five_latest", async () => sql`
    SELECT DISTINCT ON (c.order_id)
      c.order_id,
      c.id AS core_id,
      r.id AS refund_id,
      r.refund_status,
      r.execution_status,
      r.execution_route,
      r.razorpay_refund_id,
      r.customer_wallet_ledger_id,
      r.refund_amount,
      left(COALESCE(r.failure_reason, ''), 400) AS failure_reason,
      r.created_at,
      r.failed_at
    FROM orders_core c
    JOIN order_refunds r ON r.order_id = c.id
    WHERE c.order_id IN (
      'GM10000209','GM10000210','GM10000215','GM10000216','GM10000218'
    )
    ORDER BY c.order_id, r.created_at DESC
  `);

  await section("new_inserts_on_stuck_five_last_2h", async () => sql`
    SELECT c.order_id,
           date_trunc('hour', r.created_at) AS hour,
           COUNT(*)::bigint AS inserts
    FROM order_refunds r
    JOIN orders_core c ON c.id = r.order_id
    WHERE c.order_id IN (
      'GM10000209','GM10000210','GM10000215','GM10000216','GM10000218'
    )
      AND r.created_at > NOW() - INTERVAL '2 hours'
    GROUP BY 1, 2
    ORDER BY 2 DESC, 1
  `);

  await section("pg_stat_target_queryids", async () => sql`
    SELECT queryid::text AS queryid,
           calls,
           round(total_exec_time::numeric, 1) AS total_exec_ms,
           round(mean_exec_time::numeric, 2) AS mean_exec_ms,
           shared_blks_read,
           shared_blks_written,
           (shared_blks_read + shared_blks_written) AS total_shared_io_blks,
           left(query, 280) AS query
    FROM pg_stat_statements
    WHERE queryid IN (
      -5178583257701389277::bigint,
      7922184982722071837::bigint,
      64371871298811481::bigint
    )
    ORDER BY shared_blks_read DESC
  `);

  await section("pg_stat_top10_io", async () => sql`
    SELECT queryid::text AS queryid,
           calls,
           round(mean_exec_time::numeric, 2) AS mean_exec_ms,
           shared_blks_read,
           shared_blks_written,
           (shared_blks_read + shared_blks_written) AS total_shared_io_blks,
           left(query, 220) AS query
    FROM pg_stat_statements
    ORDER BY (shared_blks_read + shared_blks_written) DESC
    LIMIT 10
  `);

  await section("index_health", async () => sql`
    SELECT i.relname AS index_name,
           x.indisvalid,
           x.indisready,
           pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
           s.idx_scan,
           s.idx_tup_read,
           s.idx_tup_fetch
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'order_refunds'
      AND i.relname IN (
        'idx_or_orderid_created_active_refund',
        'order_refunds_order_id_idx',
        'order_refunds_created_at_idx'
      )
    ORDER BY i.relname
  `);

  await section("table_health", async () => sql`
    SELECT c.relname,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
           pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
           pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
           s.n_live_tup,
           s.n_dead_tup,
           s.last_autovacuum,
           s.last_autoanalyze,
           s.autovacuum_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relname = 'order_refunds'
  `);

  await section("schema_migration_0523", async () => sql`
    SELECT version, name, applied_at, execution_time_ms
    FROM schema_migrations
    WHERE version ILIKE '%0523%' OR name ILIKE '%0523%'
  `);

  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  try { await sql.end({ timeout: 2 }); } catch { /* ignore */ }
  process.exit(1);
});
