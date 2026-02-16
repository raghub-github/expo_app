-- ============================================================================
-- Ensure merchant_store_status_history.store_id has FK to merchant_stores
-- Migration: 0036_merchant_store_status_history_fk
-- Some introspections omit this FK; 0011 already creates it. This migration
-- adds it only if missing so schema is fully consistent.
-- ============================================================================

-- 1. Remove orphaned rows (store_id not present in merchant_stores) so the FK can be added
DELETE FROM public.merchant_store_status_history
WHERE store_id IS NOT NULL
  AND store_id NOT IN (SELECT id FROM public.merchant_stores);

-- 2. Add FK only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'merchant_store_status_history'
      AND c.contype = 'f'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attname = 'store_id' AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
      )
  ) THEN
    ALTER TABLE public.merchant_store_status_history
      ADD CONSTRAINT merchant_store_status_history_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.merchant_store_status_history IS 'Audit of store status/approval/operational changes. Populated by trigger on merchant_stores.';
