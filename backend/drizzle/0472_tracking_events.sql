-- 0472: Tracking events (Phase 2)
-- Immutable, permanently-auditable event log for the tracking + geo-scoping
-- engine. Every geofence outcome, session lifecycle change, milestone, and
-- (Phase 3) geo-engine signal is appended here — linked to the independent
-- per-assignment session so the full timeline is replayable per rider.
-- Reuses the EXISTING geofence enforcement (assertRiderMilestoneGeoFence /
-- platform_rider_status_radius_rules); this table only records what happened.

CREATE TABLE IF NOT EXISTS public.tracking_events (
  id             bigserial    PRIMARY KEY,
  order_id       text         NOT NULL,
  order_source   text         NOT NULL DEFAULT 'orders_core',
  rider_id       integer,
  session_id     bigint,                                  -- tracking_sessions.id
  assignment_id  bigint,
  service_type   text,                                    -- food | parcel | person_ride
  event_type     text         NOT NULL,                   -- see TrackingEventType
  milestone_key  text,                                    -- reach_store | mark_picked_up | …
  severity       text         NOT NULL DEFAULT 'info',    -- info | warning | violation
  latitude       numeric(10,7),
  longitude      numeric(10,7),
  distance_m     integer,                                 -- rider→target at the event
  radius_m       integer,                                 -- required radius at the event
  message        text,
  metadata       jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_events_order_created_idx
  ON public.tracking_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_events_session_created_idx
  ON public.tracking_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS tracking_events_rider_created_idx
  ON public.tracking_events (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_events_type_idx
  ON public.tracking_events (event_type);

COMMENT ON TABLE public.tracking_events IS
  'Immutable tracking/geo-scoping event log (geofence verified/blocked, session start/stop, milestones, geo-engine signals). Linked to tracking_sessions for per-assignment replay + audit.';
