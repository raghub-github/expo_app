-- ============================================================================
-- 0350: rider_location_events — sampling support + retention
-- Run AFTER 0349_customer_accessibility_settings.sql
--
-- No new columns. Backend now samples inserts (~1 row / 2 min when stationary;
-- live dispatch continues via rider_live_locations).
--
-- This migration:
--   1) Adds an index for latest-per-device lookups on cache miss
--   2) Documents table purpose
--   3) Adds a prune helper for ops/cron
--   4) One-time delete of audit rows older than 30 days
-- ============================================================================

CREATE INDEX IF NOT EXISTS rider_location_events_user_device_ts_idx
  ON public.rider_location_events (user_id, device_id, ts_ms DESC);

COMMENT ON TABLE public.rider_location_events IS
  'Sampled rider GPS audit trail for fraud checks. Live dispatch uses rider_live_locations. '
  'App persists first ping, fraud/mock events, moves >=75 m, or >=2 min heartbeat.';

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
END;
$$;

COMMENT ON FUNCTION public.prune_rider_location_events(integer) IS
  'Deletes rider_location_events older than retention_days (default 30). '
  'Schedule weekly via pg_cron or an external job: SELECT public.prune_rider_location_events(30);';

-- One-time cleanup of historical bloat (safe to re-run).
SELECT public.prune_rider_location_events(30);
