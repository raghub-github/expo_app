-- 0102_fix_delisted_store_flags.sql
-- Ensure all DELISTED stores are fully closed and not accepting orders.
-- This is a data-fix migration and can be safely re-run.

DO $$
BEGIN
  -- For any store currently marked as DELISTED, force operational flags to CLOSED / FALSE
  UPDATE public.merchant_stores
  SET
    is_active = FALSE,
    is_accepting_orders = FALSE,
    is_available = FALSE,
    operational_status = 'CLOSED'::store_operational_status
  WHERE approval_status = 'DELISTED'::store_approval_status
    AND (
      is_active IS DISTINCT FROM FALSE
      OR is_accepting_orders IS DISTINCT FROM FALSE
      OR is_available IS DISTINCT FROM FALSE
      OR operational_status IS DISTINCT FROM 'CLOSED'::store_operational_status
    );
END $$;

