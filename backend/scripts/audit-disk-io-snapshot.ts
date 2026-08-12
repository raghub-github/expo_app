/**
 * Point-in-time Disk I/O snapshot. Read-only. Prints JSON to stdout.
 * Usage: npx tsx scripts/audit-disk-io-snapshot.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 20,
  prepare: false,
  connection: { statement_timeout: 45_000, application_name: "gatimitra-io-snapshot" },
});

async function q<T extends Record<string, unknown>>(fn: () => Promise<T[]>) {
  try {
    return { ok: true as const, rows: await fn() };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err), rows: [] as T[] };
  }
}

const STMT_SELECT = `
  queryid::text AS queryid,
  calls,
  round(total_exec_time::numeric, 1) AS total_exec_ms,
  round(mean_exec_time::numeric, 2) AS mean_exec_ms,
  shared_blks_read,
  shared_blks_written,
  shared_blks_hit,
  shared_blks_dirtied,
  temp_blks_read,
  temp_blks_written,
  (shared_blks_read + shared_blks_written) AS total_shared_io_blks,
  left(query, 280) AS query
`;

async function main() {
  await sql`SET work_mem = '64MB'`;
  const capturedAt = new Date().toISOString();

  const db = await q(() => sql`
    SELECT
      numbackends,
      xact_commit,
      xact_rollback,
      blks_read,
      blks_hit,
      tup_returned,
      tup_fetched,
      tup_inserted,
      tup_updated,
      tup_deleted,
      temp_files,
      temp_bytes,
      deadlocks,
      checksum_failures,
      blk_read_time,
      blk_write_time,
      stats_reset
    FROM pg_stat_database
    WHERE datname = current_database()
  `);

  const io = await q(() => sql`
    SELECT backend_type, object, context,
           reads, writes, writebacks, extends, hits, evictions, fsyncs,
           op_bytes,
           (reads * op_bytes)::bigint AS read_bytes_est,
           (writes * op_bytes)::bigint AS write_bytes_est
    FROM pg_stat_io
    WHERE reads > 0 OR writes > 0 OR fsyncs > 0 OR hits > 0
    ORDER BY (reads + writes) DESC
    LIMIT 40
  `);

  const bgwriter = await q(() => sql`
    SELECT buffers_clean, maxwritten_clean, buffers_alloc, stats_reset
    FROM pg_stat_bgwriter
  `);

  const checkpointer = await q(() => sql`
    SELECT num_timed, num_requested, write_time, sync_time, buffers_written, stats_reset
    FROM pg_stat_checkpointer
  `);

  const wal = await q(() => sql`
    SELECT pg_current_wal_lsn()::text AS wal_lsn,
           pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')::bigint AS wal_bytes_from_zero
  `);

  const stmtTotals = await q(() => sql`
    SELECT
      COUNT(*)::bigint AS stmt_count,
      SUM(calls)::bigint AS calls,
      round(SUM(total_exec_time)::numeric, 1) AS total_exec_ms,
      SUM(shared_blks_read)::bigint AS shared_blks_read,
      SUM(shared_blks_written)::bigint AS shared_blks_written,
      SUM(shared_blks_hit)::bigint AS shared_blks_hit,
      SUM(temp_blks_read)::bigint AS temp_blks_read,
      SUM(temp_blks_written)::bigint AS temp_blks_written
    FROM pg_stat_statements
  `);

  const stmtsByShared = await q(() => sql.unsafe(`
    SELECT ${STMT_SELECT}
    FROM pg_stat_statements
    ORDER BY (shared_blks_read + shared_blks_written) DESC
    LIMIT 25
  `));

  const stmtsByRead = await q(() => sql.unsafe(`
    SELECT ${STMT_SELECT}
    FROM pg_stat_statements
    ORDER BY shared_blks_read DESC
    LIMIT 20
  `));

  const stmtsByWrite = await q(() => sql.unsafe(`
    SELECT ${STMT_SELECT}
    FROM pg_stat_statements
    ORDER BY shared_blks_written DESC
    LIMIT 20
  `));

  const stmtsByCalls = await q(() => sql.unsafe(`
    SELECT ${STMT_SELECT}
    FROM pg_stat_statements
    ORDER BY calls DESC
    LIMIT 20
  `));

  const stmtsByTemp = await q(() => sql.unsafe(`
    SELECT ${STMT_SELECT}
    FROM pg_stat_statements
    ORDER BY (temp_blks_read + temp_blks_written) DESC
    LIMIT 15
  `));

  const stmtReset = await q(() => sql`
    SELECT stats_reset FROM pg_stat_statements_info
  `);

  const tables = await q(() => sql`
    SELECT s.relname,
           s.seq_scan, s.seq_tup_read, s.idx_scan, s.idx_tup_fetch,
           s.n_tup_ins, s.n_tup_upd, s.n_tup_del, s.n_tup_hot_upd,
           s.n_live_tup, s.n_dead_tup,
           io.heap_blks_read, io.heap_blks_hit,
           io.idx_blks_read, io.idx_blks_hit,
           io.toast_blks_read, io.toast_blks_hit,
           s.last_autovacuum, s.last_autoanalyze, s.autovacuum_count, s.autoanalyze_count,
           s.last_vacuum, s.last_analyze, s.vacuum_count
    FROM pg_stat_user_tables s
    LEFT JOIN pg_statio_user_tables io ON io.relid = s.relid
    WHERE s.schemaname = 'public'
    ORDER BY (COALESCE(io.heap_blks_read,0) + COALESCE(io.idx_blks_read,0)) DESC
    LIMIT 25
  `);

  const sizes = await q(() => sql`
    SELECT c.relname,
           pg_total_relation_size(c.oid) AS total_bytes,
           pg_relation_size(c.oid) AS heap_bytes,
           pg_indexes_size(c.oid) AS index_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 15
  `);

  // Do NOT COUNT(*) the whole 442k-row table — that seq-scan is what produced
  // the T0→T5 disk reads. Estimate live rows from planner stats; time-window
  // counts use created_at (index-friendly, currently 0 rows).
  const refundInserts = await q(() => sql`
    SELECT
      (SELECT COUNT(*)::bigint FROM order_refunds WHERE created_at > NOW() - INTERVAL '5 minutes') AS last_5m,
      (SELECT COUNT(*)::bigint FROM order_refunds WHERE created_at > NOW() - INTERVAL '15 minutes') AS last_15m,
      (SELECT COUNT(*)::bigint FROM order_refunds WHERE created_at > NOW() - INTERVAL '1 hour') AS last_1h,
      (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.order_refunds'::regclass) AS total_rows,
      (SELECT created_at FROM order_refunds ORDER BY created_at DESC LIMIT 1) AS latest_created_at
  `);

  // Index-only latest-row probe. Frozen last_at + zero recent inserts proves
  // counts are not rising; do not COUNT 88k rows per order (heap seq-scan).
  const stuck = await q(() => sql`
    SELECT c.order_id,
           (
             SELECT created_at
             FROM order_refunds r
             WHERE r.order_id = c.id
             ORDER BY r.created_at DESC
             LIMIT 1
           ) AS last_at
    FROM orders_core c
    WHERE c.order_id IN (
      'GM10000209','GM10000210','GM10000215','GM10000216','GM10000218'
    )
    ORDER BY c.order_id
  `);

  const idx = await q(() => sql`
    SELECT i.relname AS index_name, x.indisvalid, s.idx_scan,
           pg_relation_size(i.oid) AS index_bytes
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid
    WHERE n.nspname = 'public' AND t.relname = 'order_refunds'
      AND i.relname = 'idx_or_orderid_created_active_refund'
  `);

  const q123 = await q(() => sql`
    SELECT queryid::text AS queryid, calls, shared_blks_read, shared_blks_written,
           temp_blks_read, temp_blks_written,
           round(mean_exec_time::numeric, 2) AS mean_exec_ms
    FROM pg_stat_statements
    WHERE queryid IN (
      -5178583257701389277::bigint,
      7922184982722071837::bigint,
      64371871298811481::bigint
    )
  `);

  console.log(JSON.stringify({
    capturedAt,
    db,
    io,
    bgwriter,
    checkpointer,
    wal,
    stmtReset,
    stmtTotals,
    stmtsByShared,
    stmtsByRead,
    stmtsByWrite,
    stmtsByCalls,
    stmtsByTemp,
    tables,
    sizes,
    refundInserts,
    stuck,
    idx,
    q123,
  }));

  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  try { await sql.end({ timeout: 2 }); } catch { /* ignore */ }
  process.exit(1);
});
