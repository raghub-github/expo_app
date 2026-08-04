-- Dispatch Engine — Phase 0: config foundations (additive, behavior-preserving).
--
-- Adds two per-service config tables consumed by later phases. Defaults are chosen so
-- that NOTHING changes at runtime today:
--   * strategy = 'nearest' (the existing distance-only ordering)
--   * pre_pickup_rate_per_km = 0 (no first-mile pay until an admin sets a rate)
--
-- IMPORTANT: "service radius" (below) is the ORDER-PLACEMENT serviceability gate
-- (pickup -> rider max distance within which a customer may place a delivery order).
-- It is intentionally SEPARATE from platform_rider_dispatch_pickup_radius /
-- platform_rider_dispatch_wave_* (which drive the wave SEARCH, not placement).

-- 1) SERVICE RADIUS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_rider_service_radius (
  service_type TEXT PRIMARY KEY,
  radius_meters INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_rider_service_radius_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_rider_service_radius_meters_check
    CHECK (radius_meters > 0 AND radius_meters <= 100000)
);

COMMENT ON TABLE public.platform_rider_service_radius IS
  'Max pickup->rider distance (meters) within which a customer may PLACE a delivery order (serviceability gate). Separate from dispatch/pickup radius which drives the wave search.';

INSERT INTO public.platform_rider_service_radius (service_type, radius_meters)
VALUES
  ('food', 10000),
  ('parcel', 15000),
  ('person_ride', 30000)
ON CONFLICT (service_type) DO NOTHING;

DROP TRIGGER IF EXISTS platform_rider_service_radius_touch
  ON public.platform_rider_service_radius;
CREATE TRIGGER platform_rider_service_radius_touch
BEFORE UPDATE ON public.platform_rider_service_radius
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2) DISPATCH STRATEGY + RATE CONFIG ------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_rider_dispatch_strategy_config (
  service_type TEXT PRIMARY KEY,
  strategy TEXT NOT NULL DEFAULT 'nearest',
  score_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_interval_seconds INTEGER NOT NULL DEFAULT 300,
  max_retry_duration_seconds INTEGER NOT NULL DEFAULT 1200,
  pre_pickup_rate_per_km NUMERIC(10,2) NOT NULL DEFAULT 0,
  pre_pickup_funding TEXT NOT NULL DEFAULT 'company',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_rider_dispatch_strategy_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_rider_dispatch_strategy_strategy_check
    CHECK (strategy IN ('nearest', 'score', 'balanced', 'hybrid')),
  CONSTRAINT platform_rider_dispatch_strategy_retry_interval_check
    CHECK (retry_interval_seconds >= 30 AND retry_interval_seconds <= 3600),
  CONSTRAINT platform_rider_dispatch_strategy_retry_duration_check
    CHECK (max_retry_duration_seconds >= 0 AND max_retry_duration_seconds <= 7200),
  CONSTRAINT platform_rider_dispatch_strategy_prepickup_rate_check
    CHECK (pre_pickup_rate_per_km >= 0 AND pre_pickup_rate_per_km <= 1000),
  CONSTRAINT platform_rider_dispatch_strategy_prepickup_funding_check
    CHECK (pre_pickup_funding IN ('company', 'customer', 'shared'))
);

COMMENT ON TABLE public.platform_rider_dispatch_strategy_config IS
  'Per-service rider ordering strategy, auto-retry loop timing, and pre-pickup (first-mile) rider compensation. Defaults preserve current behavior (nearest ordering, no first-mile pay).';

INSERT INTO public.platform_rider_dispatch_strategy_config
  (service_type, strategy, score_weights, retry_interval_seconds, max_retry_duration_seconds, pre_pickup_rate_per_km, pre_pickup_funding, enabled)
VALUES
  ('food',        'nearest', '{"distance":1.0,"acceptanceRate":0.5,"cancellationRate":-0.5,"idleBonus":0.2,"workloadPenalty":-0.3,"directionAlignment":0.3}'::jsonb, 300, 1200, 0, 'company', TRUE),
  ('parcel',      'nearest', '{"distance":1.0,"acceptanceRate":0.5,"cancellationRate":-0.5,"idleBonus":0.2,"workloadPenalty":-0.3,"directionAlignment":0.3}'::jsonb, 300, 1200, 0, 'company', TRUE),
  ('person_ride', 'nearest', '{"distance":1.0,"acceptanceRate":0.5,"cancellationRate":-0.5,"idleBonus":0.2,"workloadPenalty":-0.3,"directionAlignment":0.3}'::jsonb, 300, 1200, 0, 'company', TRUE)
ON CONFLICT (service_type) DO NOTHING;

DROP TRIGGER IF EXISTS platform_rider_dispatch_strategy_config_touch
  ON public.platform_rider_dispatch_strategy_config;
CREATE TRIGGER platform_rider_dispatch_strategy_config_touch
BEFORE UPDATE ON public.platform_rider_dispatch_strategy_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
