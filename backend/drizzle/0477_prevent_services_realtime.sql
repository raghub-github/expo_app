-- =============================================================================
-- 0477: Prevent Services — instant propagation to apps (no manual refresh)
-- =============================================================================
-- Safe and idempotent. Two things:
--
-- 1. Fixes prevent_services_check_point(): 0476 declared it STABLE but called
--    prevent_services_expire_due() (which writes), so Postgres aborted every
--    call with "UPDATE is not allowed in a non-volatile function" and the
--    runtime check silently failed open — nothing was ever blocked.
--    Expiry is not needed on the hot path: the ends_at predicate already treats
--    a finished rule as inactive.
--
-- 2. Adds prevent_service_signals — a single-row version counter bumped by
--    trigger whenever any rule / location / service row changes. Only this
--    table is exposed to Supabase Realtime, so the apps get a push within ~1s
--    of a Super Admin create / edit / pause / resume / delete / expire without
--    leaking admin names or rule geometry to anon clients.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Realtime signal table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prevent_service_signals (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version     BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.prevent_service_signals (id, version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- SECURITY DEFINER so the bump still lands if the write arrives on a connection
-- subject to RLS (the signal table has no UPDATE policy — only reads are public).
CREATE OR REPLACE FUNCTION public.prevent_services_bump_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.prevent_service_signals
  SET version = version + 1,
      updated_at = NOW()
  WHERE id = 1;
  RETURN NULL;
END;
$$;

-- FOR EACH ROW (not STATEMENT) on purpose: a statement trigger also fires when
-- zero rows match, so the 20s expiry tick's no-op UPDATE would broadcast a
-- change to every connected app on every tick.
DROP TRIGGER IF EXISTS trg_prevent_service_rules_signal ON public.prevent_service_rules;
CREATE TRIGGER trg_prevent_service_rules_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.prevent_service_rules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_services_bump_signal();

DROP TRIGGER IF EXISTS trg_prevent_service_services_signal ON public.prevent_service_services;
CREATE TRIGGER trg_prevent_service_services_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.prevent_service_services
  FOR EACH ROW EXECUTE FUNCTION public.prevent_services_bump_signal();

DROP TRIGGER IF EXISTS trg_prevent_service_locations_signal ON public.prevent_service_locations;
CREATE TRIGGER trg_prevent_service_locations_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.prevent_service_locations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_services_bump_signal();

-- Realtime needs the full row image plus a readable table for anon/authenticated.
ALTER TABLE public.prevent_service_signals REPLICA IDENTITY FULL;
ALTER TABLE public.prevent_service_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prevent_service_signals_public_read ON public.prevent_service_signals;
CREATE POLICY prevent_service_signals_public_read
  ON public.prevent_service_signals
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.prevent_service_signals TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'prevent_service_signals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.prevent_service_signals;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.prevent_service_signals IS
  'Single-row version counter; bumped on any Prevent Services change so apps can invalidate instantly via Realtime.';

-- ---------------------------------------------------------------------------
-- 2. Read-only runtime check (replaces the 0476 definition)
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
