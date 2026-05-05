-- ============================================================================
-- 0209_drop_merchant_store_order_acceptance_settings
-- Cleanup: legacy per-store acceptance settings table (replaced by
-- platform_food_acceptance_settings_by_store_type).
-- Idempotent and safe to run multiple times.
-- ============================================================================

DO $$
BEGIN
  -- Drop trigger first (if table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'merchant_store_order_acceptance_settings'
  ) THEN
    DROP TRIGGER IF EXISTS merchant_store_order_acceptance_settings_touch
      ON public.merchant_store_order_acceptance_settings;
  END IF;
END $$;

DROP INDEX IF EXISTS public.merchant_store_order_acceptance_settings_updated_idx;

DROP TABLE IF EXISTS public.merchant_store_order_acceptance_settings CASCADE;

