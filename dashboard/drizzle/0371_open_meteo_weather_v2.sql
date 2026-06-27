-- Open-Meteo Weather Intelligence v2

CREATE TABLE IF NOT EXISTS weather_geocode_cache (
  lookup_key   TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  latitude     NUMERIC(10, 6) NOT NULL,
  longitude    NUMERIC(11, 6) NOT NULL,
  country      TEXT,
  admin1       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_cache (
  zone_key          TEXT PRIMARY KEY,
  latitude          NUMERIC(10, 6) NOT NULL,
  longitude         NUMERIC(11, 6) NOT NULL,
  city              TEXT NOT NULL DEFAULT '',
  zone_name         TEXT NOT NULL DEFAULT '',
  weather_code      INTEGER,
  weather_severity  TEXT NOT NULL DEFAULT 'CLEAR',
  rain_detected     BOOLEAN NOT NULL DEFAULT FALSE,
  payload           JSONB NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weather_cache_expires_idx ON weather_cache(expires_at);
CREATE INDEX IF NOT EXISTS weather_cache_updated_idx ON weather_cache(updated_at DESC);

CREATE TABLE IF NOT EXISTS weather_zones (
  zone_key    TEXT PRIMARY KEY,
  latitude    NUMERIC(10, 6) NOT NULL,
  longitude   NUMERIC(11, 6) NOT NULL,
  city        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  last_access TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weather_zones_active_idx ON weather_zones(is_active, last_access DESC);

CREATE TABLE IF NOT EXISTS weather_history (
  id               BIGSERIAL PRIMARY KEY,
  zone_key         TEXT NOT NULL,
  weather_code     INTEGER,
  weather_severity TEXT NOT NULL,
  temperature_c    NUMERIC(5, 2),
  payload          JSONB NOT NULL,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weather_history_zone_time_idx ON weather_history(zone_key, recorded_at DESC);

CREATE TABLE IF NOT EXISTS weather_events (
  id          BIGSERIAL PRIMARY KEY,
  zone_key    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  reasons     JSONB NOT NULL DEFAULT '[]',
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weather_events_zone_idx ON weather_events(zone_key, created_at DESC);

CREATE TABLE IF NOT EXISTS weather_alerts (
  id           BIGSERIAL PRIMARY KEY,
  zone_key     TEXT NOT NULL,
  alert_type   TEXT NOT NULL,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'warning',
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS weather_alerts_active_idx ON weather_alerts(zone_key, expires_at)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE weather_cache IS 'Open-Meteo cache per grid zone (~1.1km). TTL 5–10 min.';
COMMENT ON TABLE weather_geocode_cache IS 'Permanent geocode cache — never geocode same city twice.';

UPDATE system_config
SET config_value = '8', description = 'Open-Meteo cache TTL (minutes)', updated_at = NOW()
WHERE config_key = 'weather.cache_ttl_minutes';

UPDATE system_config
SET config_value = '0', description = 'Deprecated — use weather scheduler compare-and-broadcast', updated_at = NOW()
WHERE config_key = 'weather.refresh_interval_minutes';
