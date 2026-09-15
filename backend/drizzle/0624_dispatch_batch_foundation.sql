-- Advanced multi-order dispatch / batching — DARK FOUNDATION (no live behaviour change).
--
-- Adds the persistent batch/route-plan entities and the per-service batching config. The pure
-- eligibility + route-insertion engines read this config; nothing is wired into live dispatch yet
-- (dispatch_batch_config.enabled defaults FALSE for every service). Person Ride is never batchable.
-- Complements (does not replace) service_assignment_limits (capacity/cross-service/person-exclusive).

-- 1) Per-service batching config (Super Admin tunable; seeded DISABLED).
CREATE TABLE IF NOT EXISTS public.dispatch_batch_config (
  service_type            text PRIMARY KEY,
  enabled                 boolean NOT NULL DEFAULT false,
  -- Hard route constraints (SLA always wins — see engine):
  max_pickup_detour_km    numeric(6, 2) NOT NULL DEFAULT 2.0,
  max_pickup_detour_min   numeric(6, 2) NOT NULL DEFAULT 8.0,
  max_extra_drop_delay_min numeric(6, 2) NOT NULL DEFAULT 10.0,
  -- Travel/service estimation for the pure feasibility engine (road ETA substituted when wired):
  avg_speed_kmph          numeric(6, 2) NOT NULL DEFAULT 18.0,
  pickup_service_min      numeric(6, 2) NOT NULL DEFAULT 3.0,
  drop_service_min        numeric(6, 2) NOT NULL DEFAULT 2.0,
  -- Soft scoring:
  same_store_bonus        numeric(6, 2) NOT NULL DEFAULT 6.0,
  batch_window_sec        integer NOT NULL DEFAULT 20,
  updated_by              text,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_batch_config_service_chk
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT dispatch_batch_config_positive_chk
    CHECK (max_pickup_detour_km >= 0 AND avg_speed_kmph > 0)
);

INSERT INTO public.dispatch_batch_config (service_type, enabled) VALUES
  ('food', false), ('parcel', false), ('person_ride', false)
ON CONFLICT (service_type) DO NOTHING;

-- 2) delivery_batch — a rider's active multi-order route plan (one open batch per rider+service).
CREATE TABLE IF NOT EXISTS public.delivery_batch (
  id            bigserial PRIMARY KEY,
  rider_id      integer NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  vehicle_id    bigint,
  service_type  text NOT NULL,
  status        text NOT NULL DEFAULT 'active',   -- active | completed | cancelled
  route_version integer NOT NULL DEFAULT 1,        -- optimistic concurrency for route updates
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_batch_service_chk CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT delivery_batch_status_chk CHECK (status IN ('active', 'completed', 'cancelled'))
);
-- At most one ACTIVE batch per rider+service.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_batch_one_active_per_rider_service
  ON public.delivery_batch (rider_id, service_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS delivery_batch_rider_idx ON public.delivery_batch (rider_id, status);

-- 3) delivery_batch_orders — orders in a batch + their route sequence.
CREATE TABLE IF NOT EXISTS public.delivery_batch_orders (
  id             bigserial PRIMARY KEY,
  batch_id       bigint NOT NULL REFERENCES public.delivery_batch(id) ON DELETE CASCADE,
  order_core_id  bigint NOT NULL,
  seq            integer NOT NULL DEFAULT 0,       -- overall stop order within the route plan
  pickup_seq     integer,
  drop_seq       integer,
  added_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_batch_orders_unique UNIQUE (batch_id, order_core_id)
);
CREATE INDEX IF NOT EXISTS delivery_batch_orders_order_idx ON public.delivery_batch_orders (order_core_id);

-- 4) Structured batching decision log (observability / debug — §64/§65). Never deleted.
CREATE TABLE IF NOT EXISTS public.dispatch_batch_decision_log (
  id                bigserial PRIMARY KEY,
  order_core_id     bigint,
  candidate_rider_id integer,
  service_type      text,
  decision          text NOT NULL,                 -- offered | rejected | assigned
  rejection_reason  text,                           -- machine-readable (see engine)
  active_order_count integer,
  score             numeric(10, 3),
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_batch_decision_log_order_idx
  ON public.dispatch_batch_decision_log (order_core_id, created_at DESC);
