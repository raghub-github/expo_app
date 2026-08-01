-- =============================================================================
-- 0476: Prevent Services (emergency location-based service blocking)
-- =============================================================================
-- Safe and idempotent.
--
-- Super Admins can block Food / Grocery / Parcel / Ride / Courier / Pharmacy
-- inside a radius around a place (flat search or lat/lng), without affecting
-- surrounding areas. Multiple overlapping rules are supported; if any active
-- rule blocks a service at a point, that service is unavailable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.prevent_service_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_type     TEXT NOT NULL
                    CHECK (search_type IN ('flat_search', 'lat_lng')),
  place_id        TEXT,
  location_name   TEXT NOT NULL,
  address         TEXT,
  latitude        DOUBLE PRECISION NOT NULL
                    CHECK (latitude >= -90 AND latitude <= 90),
  longitude       DOUBLE PRECISION NOT NULL
                    CHECK (longitude >= -180 AND longitude <= 180),
  radius_meters   INTEGER NOT NULL
                    CHECK (radius_meters > 0 AND radius_meters <= 100000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prevent_service_locations_lat_lng
  ON public.prevent_service_locations (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_prevent_service_locations_place_id
  ON public.prevent_service_locations (place_id)
  WHERE place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.prevent_service_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       UUID NOT NULL
                      REFERENCES public.prevent_service_locations(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused', 'expired', 'deleted')),
  reason            TEXT,
  reason_custom     TEXT,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  created_by        UUID,
  created_by_name   TEXT,
  updated_by        UUID,
  updated_by_name   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT prevent_service_rules_window_chk
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_prevent_service_rules_status
  ON public.prevent_service_rules (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prevent_service_rules_location
  ON public.prevent_service_rules (location_id);

CREATE INDEX IF NOT EXISTS idx_prevent_service_rules_window
  ON public.prevent_service_rules (starts_at, ends_at)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS public.prevent_service_services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL
                  REFERENCES public.prevent_service_rules(id) ON DELETE CASCADE,
  service_code  TEXT NOT NULL
                  CHECK (service_code IN (
                    'food', 'grocery', 'parcel', 'ride', 'courier', 'pharmacy'
                  )),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, service_code)
);

CREATE INDEX IF NOT EXISTS idx_prevent_service_services_rule
  ON public.prevent_service_services (rule_id);

CREATE INDEX IF NOT EXISTS idx_prevent_service_services_code
  ON public.prevent_service_services (service_code);

CREATE TABLE IF NOT EXISTS public.prevent_service_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID
                  REFERENCES public.prevent_service_rules(id) ON DELETE SET NULL,
  action        TEXT NOT NULL
                  CHECK (action IN (
                    'created', 'updated', 'paused', 'resumed', 'deleted', 'expired'
                  )),
  admin_id      UUID,
  admin_name    TEXT,
  reason        TEXT,
  snapshot      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prevent_service_logs_rule
  ON public.prevent_service_logs (rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prevent_service_logs_created
  ON public.prevent_service_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- Expire due rules (status → expired). Called from check path + admin reads.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_services_expire_due()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  n INTEGER := 0;
BEGIN
  WITH due AS (
    UPDATE public.prevent_service_rules r
    SET status = 'expired',
        updated_at = NOW()
    WHERE r.deleted_at IS NULL
      AND r.status = 'active'
      AND r.ends_at IS NOT NULL
      AND r.ends_at <= NOW()
    RETURNING r.id
  )
  INSERT INTO public.prevent_service_logs (rule_id, action, admin_name, reason, snapshot)
  SELECT d.id, 'expired', 'system', 'Schedule end time reached', NULL
  FROM due d;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Runtime check: active rules whose radius covers (lat, lng).
-- Uses bbox prefilter + haversine (no PostGIS required).
-- Returns nearest matching rule first when multiple overlap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_services_check_point(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_service TEXT DEFAULT NULL
)
RETURNS TABLE (
  rule_id UUID,
  location_id UUID,
  location_name TEXT,
  address TEXT,
  search_type TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER,
  distance_meters DOUBLE PRECISION,
  reason TEXT,
  blocked_services TEXT[],
  status TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  -- ~111_320 m per degree latitude; longitude scaled by cos(lat)
  lat_pad DOUBLE PRECISION;
  lng_pad DOUBLE PRECISION;
  max_r INTEGER;
BEGIN
  -- Intentionally read-only: the time-window predicates below already treat a
  -- past `ends_at` as inactive, so expiry needs no write on the hot path
  -- (a write here would break the STABLE contract).
  SELECT COALESCE(MAX(l.radius_meters), 0)
  INTO max_r
  FROM public.prevent_service_rules r
  JOIN public.prevent_service_locations l ON l.id = r.location_id
  WHERE r.deleted_at IS NULL
    AND r.status = 'active'
    AND (r.starts_at IS NULL OR r.starts_at <= NOW())
    AND (r.ends_at IS NULL OR r.ends_at > NOW());

  IF max_r <= 0 THEN
    RETURN;
  END IF;

  lat_pad := (max_r::DOUBLE PRECISION / 111320.0) * 1.15;
  lng_pad := (max_r::DOUBLE PRECISION / (111320.0 * GREATEST(COS(RADIANS(p_lat)), 0.01))) * 1.15;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      r.id AS rid,
      l.id AS lid,
      l.location_name AS lname,
      l.address AS laddr,
      l.search_type AS stype,
      l.latitude AS lat,
      l.longitude AS lng,
      l.radius_meters AS radius_m,
      (
        6371000.0 * 2 * ASIN(
          SQRT(
            POWER(SIN(RADIANS(l.latitude - p_lat) / 2), 2) +
            COS(RADIANS(p_lat)) * COS(RADIANS(l.latitude)) *
            POWER(SIN(RADIANS(l.longitude - p_lng) / 2), 2)
          )
        )
      ) AS dist_m,
      r.reason AS rreason,
      r.status AS rstatus,
      r.starts_at AS rstarts,
      r.ends_at AS rends,
      ARRAY(
        SELECT s.service_code
        FROM public.prevent_service_services s
        WHERE s.rule_id = r.id
        ORDER BY s.service_code
      ) AS svcs
    FROM public.prevent_service_rules r
    JOIN public.prevent_service_locations l ON l.id = r.location_id
    WHERE r.deleted_at IS NULL
      AND r.status = 'active'
      AND (r.starts_at IS NULL OR r.starts_at <= NOW())
      AND (r.ends_at IS NULL OR r.ends_at > NOW())
      AND l.latitude BETWEEN (p_lat - lat_pad) AND (p_lat + lat_pad)
      AND l.longitude BETWEEN (p_lng - lng_pad) AND (p_lng + lng_pad)
  )
  SELECT
    c.rid,
    c.lid,
    c.lname,
    c.laddr,
    c.stype,
    c.lat,
    c.lng,
    c.radius_m,
    c.dist_m,
    c.rreason,
    c.svcs,
    c.rstatus,
    c.rstarts,
    c.rends
  FROM candidates c
  WHERE c.dist_m <= c.radius_m::DOUBLE PRECISION
    AND (
      p_service IS NULL
      OR p_service = ANY (c.svcs)
    )
  ORDER BY c.dist_m ASC, c.rid ASC;
END;
$$;

COMMENT ON TABLE public.prevent_service_locations IS
  'Geographic targets for emergency Prevent Services blocks (place or lat/lng + radius).';
COMMENT ON TABLE public.prevent_service_rules IS
  'Blocking rules tied to a location; status active|paused|expired|deleted.';
COMMENT ON TABLE public.prevent_service_services IS
  'Per-rule blocked service codes (food, grocery, parcel, ride, courier, pharmacy).';
COMMENT ON TABLE public.prevent_service_logs IS
  'Audit trail for Prevent Services admin actions.';
COMMENT ON FUNCTION public.prevent_services_check_point(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) IS
  'Returns active Prevent Services rules covering a point, nearest first.';
