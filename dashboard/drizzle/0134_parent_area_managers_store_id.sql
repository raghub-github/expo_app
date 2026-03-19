-- Add store-level association to parent_area_managers
-- This lets us know for which parent's which store an Area Manager is assigned.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_area_managers'
      AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.parent_area_managers
      ADD COLUMN store_id BIGINT NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_parent_area_manager_store'
  ) THEN
    ALTER TABLE public.parent_area_managers
      ADD CONSTRAINT fk_parent_area_manager_store
        FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE;
  END IF;
END$$;

-- Ensure uniqueness per (parent, store, area manager).
-- For legacy rows where store_id is NULL this still behaves like parent+AM unique.
DO $$
BEGIN
  -- Drop old unique constraint if present
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_parent_am'
  ) THEN
    ALTER TABLE public.parent_area_managers
      DROP CONSTRAINT unique_parent_am;
  END IF;

  -- Add new unique constraint only if it does not already exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_parent_store_am'
  ) THEN
    ALTER TABLE public.parent_area_managers
      ADD CONSTRAINT unique_parent_store_am
        UNIQUE (parent_id, store_id, area_manager_id);
  END IF;
END$$;

