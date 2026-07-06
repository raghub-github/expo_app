-- =============================================================================
-- PURGE GMMC1025 (merchant_stores.id = 77)
-- =============================================================================
-- ⚠ orders_core Table Editor se row DELETE mat karo —
--   unified_tickets FK SET NULL + check constraint error aata hai.
--   Hamesha ye purge function use karo.
--
-- Step 0: Supabase mein poora file run karo (function update):
--   backend/drizzle/0393_merchant_store_transactional_reset_v1.sql
-- =============================================================================

BEGIN;

-- Preview (optional — comment out if already verified)
-- SELECT public.purge_merchant_store_transactional_data('GMMC1025', 77, FALSE);

SELECT public.purge_merchant_store_transactional_data(
  p_store_public_id := 'GMMC1025',
  p_merchant_store_id := 77,
  p_execute := TRUE
) AS result;

SELECT 'orders_core' AS tbl, COUNT(*)::bigint AS cnt
FROM public.orders_core WHERE merchant_store_id = 77
UNION ALL
SELECT 'orders_food', COUNT(*)::bigint FROM public.orders_food WHERE merchant_store_id = 77
UNION ALL
SELECT 'pending_orders', COUNT(*)::bigint FROM public.pending_orders WHERE merchant_store_id = 77
UNION ALL
SELECT 'unified_tickets (store)', COUNT(*)::bigint
FROM public.unified_tickets WHERE merchant_store_id = 77
UNION ALL
SELECT 'wallet_ledger', COUNT(*)::bigint
FROM public.merchant_wallet_ledger mwl
WHERE mwl.wallet_id IN (SELECT id FROM public.merchant_wallet WHERE merchant_store_id = 77);

COMMIT;
