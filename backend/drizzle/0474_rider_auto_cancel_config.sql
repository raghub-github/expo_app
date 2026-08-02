-- 0474: Rider auto-cancel (engine channel) per-service config
-- The geo-engine watchdog uses these Super-Admin tunables to warn a rider and
-- (Phase C) auto-cancel a PRE-PICKUP assignment on rider fault — GPS turned off,
-- moving opposite to pickup, not moving, or off-route — then apply a per-service
-- flat penalty. This is the "Auto-cancelled by engine" channel on the Financial
-- Rule Engine → Rider Penalties page, distinct from web/app (manual) cancels.
--
-- Additive + fully guarded: rows ship DISABLED (is_enabled = false) so nothing
-- acts until Super Admin turns a service on. Distances in km/meters, times in
-- minutes. One row per (service_type, phase); only pre_pickup is seeded now.

CREATE TABLE IF NOT EXISTS public.gm_rider_auto_cancel_config (
  id                            bigserial     PRIMARY KEY,
  service_type                  text          NOT NULL,               -- food | parcel | person_ride
  phase                         text          NOT NULL DEFAULT 'pre_pickup', -- pre_pickup | post_pickup
  is_enabled                    boolean       NOT NULL DEFAULT false, -- master per-service switch (ships OFF)

  -- flat penalty debited to the rider's per-service wallet on auto-cancel
  penalty_amount                numeric(10,2) NOT NULL DEFAULT 0,

  -- rule thresholds
  opposite_direction_km         numeric(6,2)  NOT NULL DEFAULT 7,     -- cumulative move away from pickup
  no_movement_minutes           integer       NOT NULL DEFAULT 15,    -- stationary while still pinging
  location_off_minutes          integer       NOT NULL DEFAULT 15,    -- no pings / GPS off / app killed
  route_deviation_m             integer       NOT NULL DEFAULT 300,   -- distance off the planned route

  -- per-rule toggles
  enable_location_off_rule      boolean       NOT NULL DEFAULT true,
  enable_no_movement_rule       boolean       NOT NULL DEFAULT true,
  enable_opposite_direction_rule boolean      NOT NULL DEFAULT true,
  enable_route_deviation_rule   boolean       NOT NULL DEFAULT true,

  -- warning cadence + grace before the hard cancel
  warning_interval_minutes      integer       NOT NULL DEFAULT 4,     -- re-warn the rider every N min
  grace_minutes                 integer       NOT NULL DEFAULT 0,     -- extra slack after threshold before cancel

  -- rider-facing ledger copy (shown in wallet history / activity)
  ledger_title                  text          NOT NULL DEFAULT 'Auto-cancellation penalty',
  ledger_description            text          NOT NULL DEFAULT 'The order was auto-cancelled by the system because the tracking rules were not met (location off, wrong direction, no movement, or off-route).',
  reason_code                   text,                                 -- linked cancellation reason (Phase C)

  updated_by                    text,
  updated_at                    timestamptz   NOT NULL DEFAULT now(),
  created_at                    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT gm_rider_auto_cancel_config_service_chk
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT gm_rider_auto_cancel_config_phase_chk
    CHECK (phase IN ('pre_pickup', 'post_pickup'))
);

CREATE UNIQUE INDEX IF NOT EXISTS gm_rider_auto_cancel_config_service_phase_uidx
  ON public.gm_rider_auto_cancel_config (service_type, phase);

COMMENT ON TABLE public.gm_rider_auto_cancel_config IS
  'Per-service (food/parcel/person_ride) Super-Admin config for the engine auto-cancel channel: rider-fault thresholds (location-off / opposite / no-movement / off-route), warning cadence, and the flat per-service penalty. Rows ship disabled.';

-- Seed pre-pickup rows for the three services (disabled; example amounts editable
-- in the panel). ON CONFLICT keeps re-runs idempotent and never clobbers edits.
INSERT INTO public.gm_rider_auto_cancel_config (service_type, phase, penalty_amount)
VALUES
  ('food',        'pre_pickup', 5),
  ('parcel',      'pre_pickup', 10),
  ('person_ride', 'pre_pickup', 15)
ON CONFLICT (service_type, phase) DO NOTHING;
