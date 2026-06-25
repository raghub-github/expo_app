-- ============================================================================
-- 0353: Remove rider_location_events monthly partitions
-- Run AFTER 0352_rider_current_locations_dispatch_optimization.sql
--
-- Converts partitioned rider_location_events back to a single heap table.
-- Drops all child partitions and partition-maintenance functions.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ensure_rider_location_events_partitions_for_range(
  timestamptz,
  timestamptz,
  integer
);

DROP FUNCTION IF EXISTS public.ensure_rider_location_events_partitions(integer);

-- Clean up any leftover heap from a failed 0352 partition migration.
DROP TABLE IF EXISTS public.rider_location_events_legacy;

DO $$
DECLARE
  is_partitioned boolean;
  row_count bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rider_location_events'
  ) INTO is_partitioned;

  IF NOT is_partitioned THEN
    RAISE NOTICE 'rider_location_events is already a single table — skipping unpartition';
    RETURN;
  END IF;

  ALTER TABLE public.rider_location_events RENAME TO rider_location_events_partitioned_parent;

  CREATE TABLE public.rider_location_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    ts_ms BIGINT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION,
    altitude_m DOUBLE PRECISION,
    speed_mps DOUBLE PRECISION,
    heading_deg DOUBLE PRECISION,
    mocked BOOLEAN NOT NULL DEFAULT false,
    provider TEXT NOT NULL DEFAULT 'unknown',
    fraud_score INTEGER NOT NULL DEFAULT 0,
    fraud_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  INSERT INTO public.rider_location_events
  SELECT DISTINCT ON (id)
    id,
    user_id,
    device_id,
    ts_ms,
    lat,
    lng,
    accuracy_m,
    altitude_m,
    speed_mps,
    heading_deg,
    mocked,
    provider,
    fraud_score,
    fraud_signals,
    meta,
    created_at
  FROM public.rider_location_events_partitioned_parent
  ORDER BY id, created_at DESC;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RAISE NOTICE 'rider_location_events: merged % row(s) into single heap table', row_count;

  -- CASCADE drops all monthly child partitions (rider_location_events_YYYY_MM).
  DROP TABLE public.rider_location_events_partitioned_parent CASCADE;
END $$;

CREATE INDEX IF NOT EXISTS rider_location_events_user_id_idx
  ON public.rider_location_events (user_id);

CREATE INDEX IF NOT EXISTS rider_location_events_device_id_idx
  ON public.rider_location_events (device_id);

CREATE INDEX IF NOT EXISTS rider_location_events_ts_ms_idx
  ON public.rider_location_events (ts_ms);

CREATE INDEX IF NOT EXISTS rider_location_events_user_device_idx
  ON public.rider_location_events (user_id, device_id);

CREATE INDEX IF NOT EXISTS rider_location_events_user_device_ts_idx
  ON public.rider_location_events (user_id, device_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS rider_location_events_created_at_idx
  ON public.rider_location_events (created_at);

COMMENT ON TABLE public.rider_location_events IS
  'Sampled rider GPS audit trail for fraud checks (single table, not partitioned). '
  'Live dispatch uses rider_current_locations. Persist on business milestones, '
  'moves >=100 m, >=60 s heartbeat, fraud/mock, or first ping.';

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
