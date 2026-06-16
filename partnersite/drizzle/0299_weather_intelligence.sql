-- Weather intelligence: zone snapshots + admin-configurable thresholds.
-- Keep in sync with backend/drizzle/0299_weather_intelligence.sql

CREATE TABLE IF NOT EXISTS zone_weather_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  zone_key        TEXT NOT NULL UNIQUE,
  city            TEXT NOT NULL,
  zone            TEXT NOT NULL,
  latitude        NUMERIC(10, 6) NOT NULL,
  longitude       NUMERIC(11, 6) NOT NULL,
  weather_condition TEXT NOT NULL DEFAULT 'Clear',
  rain_detected   BOOLEAN NOT NULL DEFAULT FALSE,
  rain_intensity_mm NUMERIC(8, 3) NOT NULL DEFAULT 0,
  temperature_c   NUMERIC(5, 2),
  humidity_pct    NUMERIC(5, 2),
  wind_speed_kmh  NUMERIC(6, 2),
  weather_severity TEXT NOT NULL DEFAULT 'CLEAR',
  provider_payload JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS zone_weather_snapshots_city_idx ON zone_weather_snapshots(city);
CREATE INDEX IF NOT EXISTS zone_weather_snapshots_updated_at_idx ON zone_weather_snapshots(updated_at DESC);
CREATE INDEX IF NOT EXISTS zone_weather_snapshots_severity_idx ON zone_weather_snapshots(weather_severity);

INSERT INTO system_config (config_key, config_value, value_type, description, category)
VALUES
  ('weather.light_rain_threshold_mm', '0.5', 'number', 'Rain mm/h at or above → LIGHT_RAIN', 'weather'),
  ('weather.moderate_rain_threshold_mm', '2.0', 'number', 'Rain mm/h at or above → MODERATE_RAIN', 'weather'),
  ('weather.heavy_rain_threshold_mm', '7.0', 'number', 'Rain mm/h at or above → HEAVY_RAIN', 'weather'),
  ('weather.extreme_rain_threshold_mm', '15.0', 'number', 'Rain mm/h at or above → EXTREME_WEATHER', 'weather'),
  ('weather.extreme_wind_speed_kmh', '50', 'number', 'Wind km/h at or above → EXTREME_WEATHER', 'weather'),
  ('weather.cache_ttl_minutes', '12', 'number', 'Serve cached snapshot without refetch (minutes)', 'weather'),
  ('weather.refresh_interval_minutes', '12', 'number', 'Background tick refresh cadence (minutes)', 'weather'),
  ('weather.eta_delay_light_minutes', '3', 'number', 'Customer-facing ETA delay for light rain', 'weather'),
  ('weather.eta_delay_moderate_minutes', '5', 'number', 'Customer-facing ETA delay for moderate rain', 'weather'),
  ('weather.eta_delay_heavy_minutes', '8', 'number', 'Customer-facing ETA delay for heavy rain', 'weather'),
  ('weather.eta_delay_extreme_minutes', '15', 'number', 'Customer-facing ETA delay for extreme weather', 'weather')
ON CONFLICT (config_key) DO NOTHING;
