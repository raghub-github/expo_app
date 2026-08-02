-- 0471: Real-time tracking foundation (Phase 1)
-- Adds: tracking_config (Super Admin tunables, single-row), tracking_sessions
-- (one INDEPENDENT session per rider↔order assignment — history is never
-- overwritten when the order is reassigned), and enriches order_rider_tracking
-- so every coordinate is linkable to a session/assignment/sequence.
-- Fully additive + backward-compatible: existing inserts keep working (new
-- columns are nullable / defaulted).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. tracking_config — single global row (id = 1). Super Admin editable.
--    All distances in METERS, durations in SECONDS. Defaults per spec.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracking_config (
  id                          smallint     PRIMARY KEY DEFAULT 1,
  -- collection
  tracking_interval_seconds   integer      NOT NULL DEFAULT 60,   -- 30/60/90/120…
  gps_accuracy_threshold_m    integer      NOT NULL DEFAULT 50,   -- reject fixes worse than this
  speed_threshold_kmh         integer      NOT NULL DEFAULT 120,  -- impossible-speed guard
  eta_refresh_seconds         integer      NOT NULL DEFAULT 60,   -- min gap between ETA pushes
  -- geo-engine thresholds (Phase 3). NOTE: pickup/drop geofence RADII and
  -- enforcement are intentionally NOT here — they are owned by the existing
  -- per-milestone system (platform_rider_status_radius_rules /
  -- assertRiderMilestoneGeoFence) to avoid two competing radius configs.
  movement_threshold_m        integer      NOT NULL DEFAULT 30,   -- min move to count as "moving"
  stationary_timeout_seconds  integer      NOT NULL DEFAULT 600,  -- 10 min no-movement event
  deviation_distance_m        integer      NOT NULL DEFAULT 300,  -- off-route threshold
  wrong_direction_threshold_m integer      NOT NULL DEFAULT 200,  -- cumulative away-from-target
  -- geo-engine rule toggles (violations feed the existing penalty engine)
  enable_stationary_rule      boolean      NOT NULL DEFAULT true,
  enable_deviation_rule       boolean      NOT NULL DEFAULT true,
  enable_wrong_direction_rule boolean      NOT NULL DEFAULT true,
  updated_by                  text,
  updated_at                  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT tracking_config_singleton CHECK (id = 1)
);

INSERT INTO public.tracking_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.tracking_config IS
  'Single-row (id=1) Super Admin tunables for the real-time tracking + geo-scoping engine. Distances in meters, durations in seconds.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. tracking_sessions — one row per rider↔order ASSIGNMENT.
--    Reassigning an order creates a NEW session; prior sessions are retained.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracking_sessions (
  id                  bigserial    PRIMARY KEY,
  order_id            text         NOT NULL,
  order_source        text         NOT NULL DEFAULT 'orders_core',
  rider_id            integer      NOT NULL,
  assignment_id       bigint,                                   -- delivery_assignments.id when available
  service_type        text         NOT NULL DEFAULT 'food',     -- food | parcel | person_ride
  status              text         NOT NULL DEFAULT 'active',    -- active | completed | stopped | cancelled | expired
  stop_reason         text,                                     -- delivered | ride_completed | cancelled | unassigned | expired | superseded
  started_at          timestamptz  NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  last_seq            integer      NOT NULL DEFAULT 0,           -- monotonically increasing coordinate sequence
  coordinate_count    integer      NOT NULL DEFAULT 0,
  last_latitude       numeric(10,7),
  last_longitude      numeric(10,7),
  last_recorded_at    timestamptz,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_sessions_order_started_idx
  ON public.tracking_sessions (order_id, started_at DESC);
CREATE INDEX IF NOT EXISTS tracking_sessions_rider_status_idx
  ON public.tracking_sessions (rider_id, status);
CREATE INDEX IF NOT EXISTS tracking_sessions_assignment_idx
  ON public.tracking_sessions (assignment_id);
-- At most one ACTIVE session per (order, rider) at a time (idempotent start).
CREATE UNIQUE INDEX IF NOT EXISTS tracking_sessions_active_order_rider_uidx
  ON public.tracking_sessions (order_id, rider_id)
  WHERE status = 'active';

COMMENT ON TABLE public.tracking_sessions IS
  'Independent, immutable tracking session per rider↔order assignment. Order reassignment opens a new session; prior sessions and their coordinates are never overwritten.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Enrich order_rider_tracking so each coordinate links to a session.
--    Additive + nullable → existing insert path is unaffected.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_rider_tracking
  ADD COLUMN IF NOT EXISTS session_id      bigint,
  ADD COLUMN IF NOT EXISTS assignment_id   bigint,
  ADD COLUMN IF NOT EXISTS service_type    text,
  ADD COLUMN IF NOT EXISTS sequence_number integer,
  ADD COLUMN IF NOT EXISTS source          text NOT NULL DEFAULT 'gps';

CREATE INDEX IF NOT EXISTS order_rider_tracking_session_seq_idx
  ON public.order_rider_tracking (session_id, sequence_number);

COMMENT ON COLUMN public.order_rider_tracking.session_id IS
  'FK-in-spirit to tracking_sessions.id — groups this coordinate under one rider assignment for immutable per-session history/replay.';
