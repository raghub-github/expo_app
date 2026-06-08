-- Immutable weather snapshot captured at order placement (historical accuracy).

CREATE TABLE IF NOT EXISTS order_weather_snapshots (
  id                      BIGSERIAL PRIMARY KEY,
  order_core_id           BIGINT NOT NULL UNIQUE REFERENCES orders_core(id) ON DELETE CASCADE,
  order_id                TEXT NOT NULL,
  weather_condition       TEXT NOT NULL,
  weather_severity        TEXT NOT NULL,
  rain_detected           BOOLEAN NOT NULL DEFAULT FALSE,
  rain_intensity_mm       NUMERIC(8, 3) NOT NULL DEFAULT 0,
  temperature_c           NUMERIC(5, 2),
  weather_delay_minutes   INTEGER NOT NULL DEFAULT 0,
  zone_name               TEXT,
  zone_key                TEXT,
  city                    TEXT,
  dispatch_priority_boost INTEGER NOT NULL DEFAULT 0,
  surge_eligible          BOOLEAN NOT NULL DEFAULT FALSE,
  weather_priority_boost  BOOLEAN NOT NULL DEFAULT FALSE,
  weather_dispatch_weight INTEGER NOT NULL DEFAULT 0,
  snapshot_timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_weather_snapshots_order_id_idx ON order_weather_snapshots(order_id);
CREATE INDEX IF NOT EXISTS order_weather_snapshots_zone_key_idx ON order_weather_snapshots(zone_key);
CREATE INDEX IF NOT EXISTS order_weather_snapshots_snapshot_ts_idx ON order_weather_snapshots(snapshot_timestamp DESC);

COMMENT ON TABLE order_weather_snapshots IS
  'Frozen weather at order placement. Never updated — used for ops history, dispatch analytics, and surge prep.';
