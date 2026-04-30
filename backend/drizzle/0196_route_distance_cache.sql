CREATE TABLE IF NOT EXISTS route_distance_cache (
  cache_key text PRIMARY KEY,
  origin_lat numeric(9,6) NOT NULL,
  origin_lng numeric(9,6) NOT NULL,
  dest_lat numeric(9,6) NOT NULL,
  dest_lng numeric(9,6) NOT NULL,
  profile text NOT NULL DEFAULT 'driving',
  distance_meters integer NOT NULL,
  duration_seconds integer NOT NULL,
  geometry text,
  provider text NOT NULL DEFAULT 'mapbox',
  approximate boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_distance_cache_expires_idx
  ON route_distance_cache(expires_at);

CREATE INDEX IF NOT EXISTS route_distance_cache_points_idx
  ON route_distance_cache(origin_lat, origin_lng, dest_lat, dest_lng, profile);
