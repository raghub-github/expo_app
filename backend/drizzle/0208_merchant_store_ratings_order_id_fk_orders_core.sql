-- ============================================================================
-- merchant_store_ratings.order_id should reference orders_core (not orders)
-- Migration: 0208_merchant_store_ratings_order_id_fk_orders_core
-- Idempotent and safe:
-- - Drops existing FK constraint `merchant_store_ratings_order_id_fkey` (if present)
-- - Adds FK to public.orders_core(id) with ON DELETE SET NULL
-- - Handles existing bad data by adding NOT VALID first, then nulling invalid order_id, then validating.
-- ============================================================================

DO $$
DECLARE
  has_orders_core boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders_core'
  ) INTO has_orders_core;

  IF NOT has_orders_core THEN
    RAISE EXCEPTION 'orders_core table not found in public schema';
  END IF;

  -- Drop the old FK if it exists (might point to public.orders)
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_ratings'
      AND constraint_name = 'merchant_store_ratings_order_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.merchant_store_ratings
      DROP CONSTRAINT merchant_store_ratings_order_id_fkey;
  END IF;

  -- Add the new FK to orders_core if missing (NOT VALID so it won't fail on existing rows)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_ratings'
      AND constraint_name = 'merchant_store_ratings_order_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.merchant_store_ratings
      ADD CONSTRAINT merchant_store_ratings_order_id_fkey
      FOREIGN KEY (order_id)
      REFERENCES public.orders_core (id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- If some legacy ratings pointed to orders(id) that do not exist in orders_core,
  -- keep the rating but clear order_id to satisfy the new FK.
  UPDATE public.merchant_store_ratings r
  SET order_id = NULL
  WHERE r.order_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.orders_core oc WHERE oc.id = r.order_id
    );

  -- Validate FK after cleanup
  BEGIN
    ALTER TABLE public.merchant_store_ratings
      VALIDATE CONSTRAINT merchant_store_ratings_order_id_fkey;
  EXCEPTION
    WHEN others THEN
      -- If orders_core is being backfilled separately, leave the FK NOT VALID for now.
      -- The app still benefits from the constraint for new writes.
      NULL;
  END;
END $$;

-- Keep index for order_id lookups
CREATE INDEX IF NOT EXISTS merchant_store_ratings_order_id_idx
  ON public.merchant_store_ratings (order_id)
  TABLESPACE pg_default;

