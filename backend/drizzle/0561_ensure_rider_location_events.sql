-- Ensure rider_location_events exists. Local DBs that skipped 0259/0353
-- were 500-ing POST /v1/rider/location/ping on history SELECT.

CREATE TABLE IF NOT EXISTS public.rider_location_events (
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
  mocked BOOLEAN NOT NULL DEFAULT FALSE,
  provider TEXT NOT NULL DEFAULT 'unknown',
  fraud_score INTEGER NOT NULL DEFAULT 0,
  fraud_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
