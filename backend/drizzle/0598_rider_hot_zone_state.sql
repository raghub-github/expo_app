-- Hot Zone Engine redesign: persistence + global-then-filter + 20km rider visibility.
--
-- WHY: the engine used to recompute per-rider on every request (no persistence), which
-- (a) left hysteresis dormant (prevStatus was always NORMAL → flicker) and (b) only ever
-- looked at the rider's ~1.4km neighbourhood. This adds a persisted, city-wide zone-state
-- table that a background reconciler writes and the per-rider read filters (within a
-- configurable visibility radius, default 20km), so hysteresis works and riders see the
-- whole demand picture around them.

-- ── Config: new knobs for the reconciler + rider visibility. All default-safe. ──
ALTER TABLE public.rider_hot_zone_config
  ADD COLUMN IF NOT EXISTS visibility_radius_meters integer NOT NULL DEFAULT 20000,   -- rider sees zones within this radius (Part: 20km)
  ADD COLUMN IF NOT EXISTS reconcile_interval_seconds integer NOT NULL DEFAULT 45,    -- background reconciler cadence
  ADD COLUMN IF NOT EXISTS demand_assigned_weight numeric NOT NULL DEFAULT 0;         -- how much an ALREADY-ASSIGNED order counts as demand (0 = only unassigned/searching backlog is demand; assigned supply is already reflected in reduced capacity)

-- ── State: one row per (H3 cell, service). Written by the reconciler, read per-rider. ──
-- Only ELEVATED cells are kept (a cell that falls to NORMAL is deleted); the row's status
-- is fed back in as prevStatus on the next tick so classifyZone's hysteresis is active.
CREATE TABLE IF NOT EXISTS public.rider_hot_zone_state (
  h3_index       text NOT NULL,
  resolution     smallint NOT NULL,
  service_type   order_type NOT NULL,               -- food | parcel | person_ride
  status         text NOT NULL,                      -- WARM | HOT | CRITICAL (NORMAL rows are never stored)
  center_lat     double precision NOT NULL,
  center_lng     double precision NOT NULL,
  weighted_demand   numeric NOT NULL DEFAULT 0,      -- decayed demand feeding the score
  effective_supply  numeric NOT NULL DEFAULT 0,      -- capacity-aware, ring-decayed supply
  pressure          numeric NOT NULL DEFAULT 0,      -- demand / max(supply, floor)
  unassigned_demand numeric NOT NULL DEFAULT 0,      -- explainability: searching/backlog component
  assigned_demand   numeric NOT NULL DEFAULT 0,      -- explainability: already-being-served component
  order_count       integer NOT NULL DEFAULT 0,      -- explainability: raw orders in the window for this cell/service
  supply_count      integer NOT NULL DEFAULT 0,      -- explainability: eligible riders contributing
  computed_at    timestamptz NOT NULL DEFAULT now(),
  valid_until    timestamptz NOT NULL,
  PRIMARY KEY (h3_index, service_type)
);

-- Per-rider read: "elevated, still-valid zones near me" — bbox prefilter on center, then
-- exact haversine in app code. Index supports the validity + spatial scan.
CREATE INDEX IF NOT EXISTS rider_hot_zone_state_valid_center_idx
  ON public.rider_hot_zone_state (valid_until, center_lat, center_lng);
CREATE INDEX IF NOT EXISTS rider_hot_zone_state_service_idx
  ON public.rider_hot_zone_state (service_type);

COMMENT ON TABLE public.rider_hot_zone_state IS
  'Persisted hot-zone state (one row per H3 cell + service) written by the background reconciler; the per-rider API reads+filters this within visibility_radius_meters. Only WARM/HOT/CRITICAL cells are stored.';
