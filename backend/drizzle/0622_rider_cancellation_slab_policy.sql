-- Rider-fault cancellation SLAB policy (Super Admin configurable, per service).
--
-- Upgrades the flat single-threshold auto-block (0621) to a cumulative slab model:
-- per service, an ordered set of slabs keyed on cumulative accepted orders, each with its
-- own rider-fault threshold and a grace flag. Seeded DISABLED so nothing blocks until a
-- Super Admin enables the service. The authoritative decision engine lives in
-- @gatimitra/financial-rules (evaluateCancellationSlabPolicy) — shared by dashboard + backend.

-- 1) Per-service policy header (enable switch + version for audit).
CREATE TABLE IF NOT EXISTS public.rider_cancellation_policy (
  service_type   text PRIMARY KEY,
  enabled        boolean NOT NULL DEFAULT false,
  policy_version integer NOT NULL DEFAULT 1,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_cancellation_policy_service_chk
    CHECK (service_type IN ('food', 'parcel', 'person_ride'))
);

-- 2) Ordered slabs per service. max_accepted NULL = open-ended top slab ("and above").
CREATE TABLE IF NOT EXISTS public.rider_cancellation_policy_slabs (
  id               bigserial PRIMARY KEY,
  service_type     text NOT NULL,
  slab_number      integer NOT NULL,
  min_accepted     integer NOT NULL,
  max_accepted     integer,
  blocking_enabled boolean NOT NULL DEFAULT true,
  threshold_pct    numeric(5, 2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_cancellation_policy_slabs_service_chk
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT rider_cancellation_policy_slabs_threshold_chk
    CHECK (threshold_pct >= 0 AND threshold_pct <= 100),
  CONSTRAINT rider_cancellation_policy_slabs_range_chk
    CHECK (min_accepted >= 1 AND (max_accepted IS NULL OR max_accepted >= min_accepted)),
  CONSTRAINT rider_cancellation_policy_slabs_service_number_uq
    UNIQUE (service_type, slab_number)
);
CREATE INDEX IF NOT EXISTS rider_cancellation_policy_slabs_service_idx
  ON public.rider_cancellation_policy_slabs (service_type, min_accepted);

-- 3) Versioned audit columns on the active-block table (0621).
ALTER TABLE public.rider_cancellation_service_blocks
  ADD COLUMN IF NOT EXISTS slab_number integer,
  ADD COLUMN IF NOT EXISTS policy_version integer;

-- 4) Seed policy headers (all disabled) + default slabs (grace 1-5, then 60/35/20, top open-ended).
INSERT INTO public.rider_cancellation_policy (service_type, enabled, policy_version)
VALUES ('food', false, 1), ('parcel', false, 1), ('person_ride', false, 1)
ON CONFLICT (service_type) DO NOTHING;

INSERT INTO public.rider_cancellation_policy_slabs
  (service_type, slab_number, min_accepted, max_accepted, blocking_enabled, threshold_pct)
SELECT s.service_type, v.slab_number, v.min_accepted, v.max_accepted, v.blocking_enabled, v.threshold_pct
FROM (SELECT unnest(ARRAY['food','parcel','person_ride']) AS service_type) s
CROSS JOIN (VALUES
  (1, 1, 5,   false, 0),
  (2, 6, 15,  true, 60),
  (3, 16, 25, true, 35),
  (4, 26, NULL::integer, true, 20)
) AS v(slab_number, min_accepted, max_accepted, blocking_enabled, threshold_pct)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_cancellation_policy_slabs x
  WHERE x.service_type = s.service_type AND x.slab_number = v.slab_number
);

-- 5) Retire the flat 0621 config table (replaced by the slab model; no service was enabled).
DROP TABLE IF EXISTS public.rider_cancellation_block_config;
