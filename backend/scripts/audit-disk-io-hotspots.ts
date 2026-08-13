/**
 * Read-only Disk I/O hotspot audit for order_refunds / orders_food / orders_core.
 * Does not mutate data. Usage: npx tsx scripts/audit-disk-io-hotspots.ts
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
    application_name: "gatimitra-disk-io-audit",
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
  await section("connection", async () => {
    const rows = await sql`
      SELECT current_database() AS db,
             current_user AS usr,
             inet_server_addr()::text AS server_addr,
             current_setting('server_version') AS pg_version
    `;
    return rows;
  });

  await section("table_sizes", async () => sql`
    SELECT c.relname AS table_name,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
           pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
           pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
           c.reltuples::bigint AS est_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('order_refunds', 'orders_food', 'orders_core')
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  await section("dead_tuples_vacuum", async () => sql`
    SELECT relname,
           n_live_tup,
           n_dead_tup,
           n_mod_since_analyze,
           last_vacuum,
           last_autovacuum,
           last_analyze,
           last_autoanalyze,
           vacuum_count,
           autovacuum_count
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND relname IN ('order_refunds', 'orders_food', 'orders_core')
    ORDER BY relname
  `);

  await section("order_refunds_indexes", async () => sql`
    SELECT i.relname AS index_name,
           pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
           pg_get_indexdef(x.indexrelid) AS indexdef,
           x.indisunique,
           x.indisvalid,
           s.idx_scan,
           s.idx_tup_read,
           s.idx_tup_fetch
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid
    WHERE n.nspname = 'public' AND t.relname = 'order_refunds'
    ORDER BY i.relname
  `);

  await section("orders_food_indexes", async () => sql`
    SELECT i.relname AS index_name,
           pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
           pg_get_indexdef(x.indexrelid) AS indexdef,
           x.indisunique,
           x.indisvalid,
           s.idx_scan,
           s.idx_tup_read,
           s.idx_tup_fetch
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid
    WHERE n.nspname = 'public' AND t.relname = 'orders_food'
    ORDER BY i.relname
  `);

  await section("order_refunds_columns", async () => sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_refunds'
      AND column_name IN (
        'id','order_id','created_at','refund_status','execution_status',
        'razorpay_refund_id','customer_wallet_ledger_id','refund_amount',
        'refund_reference','failure_reason'
      )
    ORDER BY ordinal_position
  `);

  await section("pg_stat_statements_top_io", async () => sql`
    SELECT queryid::text AS queryid,
           calls,
           round(total_exec_time::numeric, 1) AS total_exec_ms,
           round(mean_exec_time::numeric, 2) AS mean_exec_ms,
           shared_blks_read,
           shared_blks_written,
           (shared_blks_read + shared_blks_written) AS total_shared_io_blks,
           left(query, 400) AS query
    FROM pg_stat_statements
    WHERE queryid IN (
      -5178583257701389277::bigint,
      7922184982722071837::bigint,
      64371871298811481::bigint
    )
       OR query ILIKE '%order_refunds%'
       OR query ILIKE '%orders_food%'
    ORDER BY (shared_blks_read + shared_blks_written) DESC
    LIMIT 15
  `);

  await section("explain_q1_reclaim_hollow", async () => {
    const sample = await sql<{ order_id: number }[]>`
      SELECT order_id FROM order_refunds ORDER BY id DESC LIMIT 1
    `;
    const oid = sample[0]?.order_id ?? 1;
    return sql.unsafe(
      `EXPLAIN (FORMAT TEXT)
       SELECT id
       FROM order_refunds
       WHERE order_id = ${Number(oid)}
         AND customer_wallet_ledger_id IS NULL
         AND NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NULL
         AND COALESCE(refund_amount, 0) > 0
         AND (
           LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
           OR (
             UPPER(COALESCE(execution_status, '')) = 'FAILED'
             AND COALESCE(failure_reason, '') ~* 'razorpay_payment_id_missing'
           )
         )
         AND (
           UPPER(COALESCE(execution_status, '')) IN ('COMPLETED', 'NOOP', 'INITIATED', 'PROCESSING')
           OR TRIM(COALESCE(refund_reference, '')) ~* '^RFND-\\d+$'
           OR (
             LOWER(COALESCE(refund_status, '')) IN ('completed', 'refunded', 'pending')
             AND (
               NULLIF(TRIM(COALESCE(execution_status, '')), '') IS NULL
               OR UPPER(COALESCE(execution_status, '')) IN ('COMPLETED', 'NOOP', 'INITIATED', 'PROCESSING')
             )
           )
           OR (
             UPPER(COALESCE(execution_status, '')) = 'FAILED'
             AND COALESCE(failure_reason, '') ~* 'razorpay_payment_id_missing'
           )
         )
       ORDER BY created_at DESC
       LIMIT 1`
    );
  });

  await section("explain_q3_has_active_refund", async () => {
    const sample = await sql<{ order_id: number }[]>`
      SELECT order_id FROM order_refunds ORDER BY id DESC LIMIT 1
    `;
    const oid = sample[0]?.order_id ?? 1;
    return sql.unsafe(
      `EXPLAIN (FORMAT TEXT)
       SELECT 1
       FROM order_refunds
       WHERE order_id = ${Number(oid)}
         AND UPPER(COALESCE(execution_status, '')) <> 'FAILED'
         AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
         AND (
           customer_wallet_ledger_id IS NOT NULL
           OR NULLIF(TRIM(COALESCE(razorpay_refund_id, '')), '') IS NOT NULL
           OR UPPER(COALESCE(execution_status, '')) = 'PROCESSING'
         )
       LIMIT 1`
    );
  });

  await section("explain_q2_repair_unrefunded", async () =>
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
      LIMIT 40`)
  );

  await section("explain_q1_with_hypothetical_p0_1", async () => {
    const sample = await sql<{ order_id: number }[]>`
      SELECT order_id FROM order_refunds ORDER BY id DESC LIMIT 1
    `;
    const oid = sample[0]?.order_id ?? 1;
    return sql.unsafe(
      `EXPLAIN (FORMAT TEXT)
       SELECT id
       FROM order_refunds
       WHERE order_id = ${Number(oid)}
         AND customer_wallet_ledger_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    );
  });

  await section("stuck_repair_candidates_count", async () => sql`
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
    ) x
  `);

  await section("duplicate_index_check_p0_p1", async () => sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND (
        indexname ILIKE '%or_orderid%'
        OR indexname ILIKE '%of_cancelled%'
        OR indexdef ILIKE '%order_refunds%created_at%'
        OR indexdef ILIKE '%customer_wallet_ledger_id%'
      )
    ORDER BY indexname
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
