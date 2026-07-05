-- =============================================================================
-- 0395_merchant_store_purge_text_order_id_fix.sql
-- Fix: order_rider_assignments_current.order_id is TEXT (e.g. GMF100028),
--      not orders_core.id bigint — caused "text = bigint" on purge.
--
-- ACTION: Re-run the FULL file in Supabase SQL editor:
--   backend/drizzle/0393_merchant_store_transactional_reset_v1.sql
-- (CREATE OR REPLACE FUNCTION — idempotent, includes this fix)
--
-- Then run purge again:
--   backend/scripts/purge-merchant-store-transactional-data.sql
-- =============================================================================

-- Quick verify the fix is applied (should return 1 row):
SELECT pg_get_functiondef('public.purge_merchant_store_transactional_data(text,bigint,boolean)'::regprocedure)
  LIKE '%order_rider_assignments_current c WHERE c.order_id = ANY(v_order_id_texts)%' AS fix_applied;
