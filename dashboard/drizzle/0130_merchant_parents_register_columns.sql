-- Migration: 0130_merchant_parents_register_columns
-- Purpose: Ensure merchant_parents has columns needed for area-manager parent registration.
-- Safe to run: only adds columns/index/constraint if missing. Does not alter or drop anything.
-- Does not affect other websites or existing data.

-- Columns used when an area manager registers a parent (dashboard Register Parent flow)
ALTER TABLE public.merchant_parents ADD COLUMN IF NOT EXISTS created_by_name TEXT NULL;
ALTER TABLE public.merchant_parents ADD COLUMN IF NOT EXISTS area_manager_id BIGINT NULL;

-- FK to area_managers (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_merchant_parents_area_manager') THEN
    ALTER TABLE public.merchant_parents
      ADD CONSTRAINT fk_merchant_parents_area_manager
      FOREIGN KEY (area_manager_id) REFERENCES public.area_managers(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Index for filtering by area manager (only if not already present)
CREATE INDEX IF NOT EXISTS merchant_parents_area_manager_id_idx
  ON public.merchant_parents USING btree (area_manager_id) TABLESPACE pg_default
  WHERE area_manager_id IS NOT NULL;

COMMENT ON COLUMN public.merchant_parents.created_by_name IS 'Name of the area manager (or agent) who registered this parent.';
COMMENT ON COLUMN public.merchant_parents.area_manager_id IS 'Area manager who registered this parent (FK to area_managers).';
