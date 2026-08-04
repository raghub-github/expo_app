-- Dispatch Engine — Phase 1: Geo & Pincode Coverage.
--
-- Per-service, per-location fulfillment control. A location is matched most-specific
-- first: pincode > city > state > country. Radius/strategy columns are NULLABLE and
-- fall back to the Phase 0 global config (platform_rider_service_radius /
-- platform_rider_dispatch_strategy_config) when null. Behavior-preserving: with no
-- rows, resolution returns "enabled everywhere with global defaults" (see resolver).

CREATE TABLE IF NOT EXISTS public.geo_coverage (
  id BIGSERIAL PRIMARY KEY,
  service_type TEXT NOT NULL,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  self_pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  internal_rider_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tpl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  service_radius_meters INTEGER,
  dispatch_radius_meters INTEGER,
  max_retry_duration_seconds INTEGER,
  strategy TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT geo_coverage_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT geo_coverage_match_type_check
    CHECK (match_type IN ('pincode', 'city', 'state', 'country')),
  CONSTRAINT geo_coverage_service_radius_check
    CHECK (service_radius_meters IS NULL OR (service_radius_meters > 0 AND service_radius_meters <= 100000)),
  CONSTRAINT geo_coverage_dispatch_radius_check
    CHECK (dispatch_radius_meters IS NULL OR (dispatch_radius_meters > 0 AND dispatch_radius_meters <= 50000)),
  CONSTRAINT geo_coverage_retry_check
    CHECK (max_retry_duration_seconds IS NULL OR (max_retry_duration_seconds >= 0 AND max_retry_duration_seconds <= 7200)),
  CONSTRAINT geo_coverage_strategy_check
    CHECK (strategy IS NULL OR strategy IN ('nearest', 'score', 'balanced', 'hybrid')),
  CONSTRAINT geo_coverage_unique UNIQUE (service_type, match_type, match_value)
);

-- Match values for city/state/country are stored lowercased+trimmed (resolver normalizes).
CREATE INDEX IF NOT EXISTS geo_coverage_lookup_idx
  ON public.geo_coverage (service_type, match_type, match_value);

COMMENT ON TABLE public.geo_coverage IS
  'Per-service, per-location fulfillment coverage. Matched most-specific first (pincode>city>state>country). NULL radius/strategy fall back to Phase 0 global config.';

DROP TRIGGER IF EXISTS geo_coverage_touch ON public.geo_coverage;
CREATE TRIGGER geo_coverage_touch
BEFORE UPDATE ON public.geo_coverage
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
