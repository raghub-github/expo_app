-- ─────────────────────────────────────────────────────────────────────────────
-- 0523 · P0 Disk I/O: order_refunds (order_id, created_at DESC)
--
-- WHY
--   Production pg_stat_statements showed reclaimHollowRefund walking
--   order_refunds_created_at_idx backwards (~3.3 TB shared reads) because
--   ORDER BY created_at DESC LIMIT 1 was not aligned with order_id.
--   loadLatestRefund now uses:
--     WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1
--
--   The originally proposed partial predicate
--     WHERE customer_wallet_ledger_id IS NULL
--   was omitted: 99.99% of live rows already have NULL wallet, and the
--   non-partial form also covers settled wallet refunds so we do not insert
--   a duplicate after a successful credit.
--
-- SAFETY
--   Additive index only. No table/column/data changes.
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction or through
--   PgBouncer transaction mode (:6543). Apply with session mode (:5432)
--   via scripts/run-pending-migrations.ts.
--
-- ROLLBACK
--   See 0523_order_refunds_orderid_created_idx_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_or_orderid_created_active_refund
  ON public.order_refunds (order_id, created_at DESC);
