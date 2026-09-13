-- 0615: Rider onboarding work location enrichment + geo-scoped Aadhaar/identity methods.
-- Idempotent, production-safe: CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only.
-- No backfills, no table rewrites, no full-table scans.

-- A) Geo-scoped identity verification method flags (most-specific wins via geo_pricing_chain_steps).
CREATE TABLE IF NOT EXISTS public.rider_geo_identity_methods (
  id BIGSERIAL PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id UUID NOT NULL,
  digilocker_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  aadhaar_masking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manual_upload_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS rider_geo_identity_methods_active_uq
  ON public.rider_geo_identity_methods (geo_level, geo_ref_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS rider_geo_identity_methods_lookup_idx
  ON public.rider_geo_identity_methods (geo_level, geo_ref_id, priority DESC)
  WHERE deleted_at IS NULL AND is_active;

COMMENT ON TABLE public.rider_geo_identity_methods IS
  'Per geo-node allowed Aadhaar/identity verification methods for rider onboarding. Most-specific ancestor wins; empty = global Policy Center only.';

-- B) Rider work-location enrichment (nullable ADD COLUMN — metadata-only, no rewrite).
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS state_id uuid,
  ADD COLUMN IF NOT EXISTS region_id uuid,
  ADD COLUMN IF NOT EXISTS district_id uuid,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_other_state text,
  ADD COLUMN IF NOT EXISTS location_other_district text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'riders_location_source_check'
      AND conrelid = 'public.riders'::regclass
  ) THEN
    ALTER TABLE public.riders
      ADD CONSTRAINT riders_location_source_check
      CHECK (
        location_source IS NULL
        OR location_source IN ('gps_auto', 'manual_select', 'manual_other')
      );
  END IF;
END $$;
