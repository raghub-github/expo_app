-- 0616: Geo-scoped rider hiring (State → Region → District).
-- Idempotent, production-safe: CREATE IF NOT EXISTS only.
-- No backfills, no table rewrites. Empty = inherit / default hiring ON for known nodes.
-- Most-specific explicit row wins via geo_pricing_chain_steps; no child rows required for inheritance.

CREATE TABLE IF NOT EXISTS public.rider_geo_hiring (
  id BIGSERIAL PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id UUID NOT NULL,
  hiring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS rider_geo_hiring_active_uq
  ON public.rider_geo_hiring (geo_level, geo_ref_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS rider_geo_hiring_lookup_idx
  ON public.rider_geo_hiring (geo_level, geo_ref_id)
  WHERE deleted_at IS NULL AND is_active;

COMMENT ON TABLE public.rider_geo_hiring IS
  'Explicit rider hiring on/off per geo node. Most-specific ancestor wins; missing row = inherit (default ON for known hierarchy).';
