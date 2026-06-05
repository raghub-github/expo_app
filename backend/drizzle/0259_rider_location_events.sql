-- Recreate rider_location_events (dropped in 0003_consolidate_schemas_FIXED.sql, required by /v1/rider/location/ping)
CREATE TABLE IF NOT EXISTS rider_location_events (
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

CREATE INDEX IF NOT EXISTS rider_location_events_user_id_idx ON rider_location_events(user_id);
CREATE INDEX IF NOT EXISTS rider_location_events_device_id_idx ON rider_location_events(device_id);
CREATE INDEX IF NOT EXISTS rider_location_events_ts_ms_idx ON rider_location_events(ts_ms);
CREATE INDEX IF NOT EXISTS rider_location_events_user_device_idx ON rider_location_events(user_id, device_id);
