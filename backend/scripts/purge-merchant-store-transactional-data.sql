-- =============================================================================
-- PURGE GMMC1025 (merchant_stores.id = 77) — thin wrapper
-- =============================================================================
-- Prefer the unified script (full validation + verification summary):
--   backend/scripts/unified-store-77-gmmc1025-operational-reset.sql
--
-- First apply once:
--   backend/drizzle/0483_merchant_store_transactional_reset_v2.sql
-- =============================================================================

BEGIN;

SELECT public.purge_merchant_store_transactional_data(
  p_store_public_id := 'GMMC1025',
  p_merchant_store_id := 77,
  p_execute := TRUE
) AS result;

COMMIT;
