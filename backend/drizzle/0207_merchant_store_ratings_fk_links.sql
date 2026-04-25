-- ============================================================================
-- Add FK links for merchant_store_ratings (store_id, customer_id)
-- Migration: 0207_merchant_store_ratings_fk_links
-- Notes:
-- - Table was introduced earlier (0133_merchant_ratings.sql) without these FKs.
-- - Idempotent: adds constraints only if missing.
-- ============================================================================

DO $$
BEGIN
  -- store_id -> merchant_stores(id)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_ratings'
      AND constraint_name = 'merchant_store_ratings_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_ratings
      ADD CONSTRAINT merchant_store_ratings_store_id_fkey
      FOREIGN KEY (store_id)
      REFERENCES public.merchant_stores (id)
      ON DELETE RESTRICT;
  END IF;

  -- customer_id -> customers(id) (nullable so SET NULL is safe)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_ratings'
      AND constraint_name = 'merchant_store_ratings_customer_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_ratings
      ADD CONSTRAINT merchant_store_ratings_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.customers (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Helpful composite index for common store timeline queries (if missing)
CREATE INDEX IF NOT EXISTS merchant_store_ratings_store_id_created_idx
  ON public.merchant_store_ratings (store_id, created_at DESC)
  TABLESPACE pg_default;

