-- 0473: Geo engine — violations store + per-session running state (Phase 3)
-- The backend geo engine evaluates every stored coordinate against the
-- Super-Admin thresholds (movement / stationary / deviation / wrong-direction)
-- and generates VIOLATIONS. It never deducts penalties directly — violations
-- are the modular interface the penalty engine / admin review consumes
-- (Violation → Penalty → Admin rules → Wallet → Activity).

-- Per-session running state for the geo engine (last-moved point, closest
-- approach to the current target, per-signal dedup/escalation). One jsonb column
-- keeps the schema stable while the engine evolves.
ALTER TABLE public.tracking_sessions
  ADD COLUMN IF NOT EXISTS geo_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.tracking_violations (
  id               bigserial    PRIMARY KEY,
  order_id         text         NOT NULL,
  order_source     text         NOT NULL DEFAULT 'orders_core',
  rider_id         integer,
  session_id       bigint,                                 -- tracking_sessions.id
  assignment_id    bigint,
  service_type     text,                                   -- food | parcel | person_ride
  violation_type   text         NOT NULL,                  -- long_stop | route_deviation | opposite_direction
  level            integer      NOT NULL DEFAULT 1,        -- escalation level (repeat count)
  status           text         NOT NULL DEFAULT 'open',   -- open | reviewed | penalized | dismissed
  distance_m       integer,                                -- signal magnitude (m)
  duration_seconds integer,                                -- for long_stop
  latitude         numeric(10,7),
  longitude        numeric(10,7),
  message          text,
  event_id         bigint,                                 -- tracking_events.id that raised it
  metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_violations_order_created_idx
  ON public.tracking_violations (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_violations_rider_status_idx
  ON public.tracking_violations (rider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_violations_session_idx
  ON public.tracking_violations (session_id);
CREATE INDEX IF NOT EXISTS tracking_violations_type_idx
  ON public.tracking_violations (violation_type);
CREATE INDEX IF NOT EXISTS tracking_violations_status_idx
  ON public.tracking_violations (status);

COMMENT ON TABLE public.tracking_violations IS
  'Geo-engine violations (long stop / route deviation / opposite direction). Generated, never auto-penalized — consumed by the penalty engine / admin review. Immutable audit trail linked to tracking_sessions + tracking_events.';
