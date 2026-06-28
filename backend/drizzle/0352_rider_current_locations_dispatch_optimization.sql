-- ============================================================================
-- 0352: rider_current_locations + dispatch optimization
-- Run AFTER 0351_rider_withdrawal_payout_system.sql
--
-- Live dispatch reads rider_current_locations (one UPSERT row per rider).
-- rider_location_events remains the sampled fraud/audit trail (single table).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Realtime location table (one row per rider, UPSERT only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_current_locations (
  user_id TEXT PRIMARY KEY,
  rider_id INTEGER NOT NULL UNIQUE REFERENCES public.riders(id) ON DELETE CASCADE,
  device_id TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_current_locations_rider_id_idx
  ON public.rider_current_locations (rider_id);

CREATE INDEX IF NOT EXISTS rider_current_locations_updated_at_idx
  ON public.rider_current_locations (updated_at DESC);

CREATE INDEX IF NOT EXISTS rider_current_locations_last_seen_at_idx
  ON public.rider_current_locations (last_seen_at DESC);

COMMENT ON TABLE public.rider_current_locations IS
  'Latest rider GPS per user_id. UPSERT on every ping. Dispatch / nearby search / ETA source of truth.';

-- Migrate legacy live rows when the old table still exists as a base table.
-- Skip (and drop) orphaned rows whose rider_id no longer exists in riders.
DO $$
DECLARE
  orphaned_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rider_live_locations'
      AND c.relkind = 'r'
  ) THEN
    DELETE FROM public.rider_live_locations rll
    WHERE NOT EXISTS (
      SELECT 1 FROM public.riders r WHERE r.id = rll.rider_id
    );
    GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    IF orphaned_count > 0 THEN
      RAISE NOTICE 'rider_live_locations: removed % orphaned row(s) with no matching riders.id', orphaned_count;
    END IF;

    INSERT INTO public.rider_current_locations (
      user_id,
      rider_id,
      lat,
      lng,
      accuracy_m,
      speed_mps,
      heading_deg,
      last_seen_at,
      updated_at
    )
    SELECT
      'usr_' || rll.rider_id,
      rll.rider_id,
      rll.latitude::double precision,
      rll.longitude::double precision,
      rll.accuracy_meters::double precision,
      CASE
        WHEN rll.speed_kmh IS NOT NULL THEN rll.speed_kmh::double precision / 3.6
        ELSE NULL
      END,
      rll.heading::double precision,
      rll.updated_at,
      rll.updated_at
    FROM public.rider_live_locations rll
    INNER JOIN public.riders r ON r.id = rll.rider_id
    ON CONFLICT (user_id) DO UPDATE
    SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      accuracy_m = EXCLUDED.accuracy_m,
      speed_mps = EXCLUDED.speed_mps,
      heading_deg = EXCLUDED.heading_deg,
      last_seen_at = EXCLUDED.last_seen_at,
      updated_at = EXCLUDED.updated_at;

    DROP TABLE public.rider_live_locations;
  END IF;
END $$;

-- Backward-compatible read view for dashboards / ad-hoc SQL.
CREATE OR REPLACE VIEW public.rider_live_locations AS
SELECT
  rider_id,
  lat::numeric(10, 7) AS latitude,
  lng::numeric(10, 7) AS longitude,
  CASE
    WHEN speed_mps IS NOT NULL THEN (speed_mps * 3.6)::numeric(5, 2)
    ELSE NULL
  END AS speed_kmh,
  heading_deg::numeric(6, 2) AS heading,
  accuracy_m::numeric(6, 2) AS accuracy_meters,
  updated_at
FROM public.rider_current_locations;

COMMENT ON VIEW public.rider_live_locations IS
  'Deprecated read alias of rider_current_locations. Writes must target rider_current_locations.';

-- ---------------------------------------------------------------------------
-- 2) rider_location_events — sampling indexes + 30-day retention helper
--    (single heap table; no monthly partitions — see 0353 if upgrading from partitions)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS rider_location_events_user_device_ts_idx
  ON public.rider_location_events (user_id, device_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS rider_location_events_created_at_idx
  ON public.rider_location_events (created_at);

COMMENT ON TABLE public.rider_location_events IS
  'Sampled rider GPS audit trail for fraud checks (single table). '
  'Live dispatch uses rider_current_locations. Persist on business milestones, '
  'moves >=100 m, >=60 s heartbeat, fraud/mock, or first ping.';

-- ---------------------------------------------------------------------------
-- 3) Retention helper (daily prune via backend maintenance tick)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_rider_location_events(
  retention_days integer DEFAULT 30
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1';
  END IF;

  DELETE FROM public.rider_location_events
  WHERE created_at < NOW() - (retention_days || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $$;

COMMENT ON FUNCTION public.prune_rider_location_events(integer) IS
  'Deletes rider_location_events older than retention_days (default 30). '
  'Run daily via backend maintenance tick or pg_cron.';

SELECT public.prune_rider_location_events(30);
