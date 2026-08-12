-- Rollback 0523 — drops only the additive index. Never touches refund rows.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_or_orderid_created_active_refund;
