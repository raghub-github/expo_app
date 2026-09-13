-- Rider cancellation-rate auto-block (Super Admin configurable, per service).
--
-- When a rider's RIDER-FAULT cancellation rate for a service reaches the admin threshold
-- (and the rider has at least the configured minimum accepted orders), the rider is blocked
-- for that service only. The block is rule-governed: it lifts only when the admin changes the
-- threshold for that service (re-evaluation drops riders now under it) — never manually, never
-- on a timer. Enforced by merging into rider-account-restrictions (getRiderAccountRestrictions).
--
-- Reuses rider_service_block_history (0443) for the immutable block/unblock audit log.

-- 1) Per-service configuration (one row per dispatch service). Seeded DISABLED so nothing
--    blocks until a Super Admin turns it on and sets a threshold.
CREATE TABLE IF NOT EXISTS public.rider_cancellation_block_config (
  service_type   text PRIMARY KEY,
  threshold_pct  numeric(5, 2) NOT NULL DEFAULT 0,
  min_accepted   integer NOT NULL DEFAULT 20,
  enabled        boolean NOT NULL DEFAULT false,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_cancellation_block_config_service_chk
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT rider_cancellation_block_config_threshold_chk
    CHECK (threshold_pct >= 0 AND threshold_pct <= 100),
  CONSTRAINT rider_cancellation_block_config_min_accepted_chk
    CHECK (min_accepted >= 0)
);

INSERT INTO public.rider_cancellation_block_config (service_type, threshold_pct, min_accepted, enabled)
VALUES
  ('food', 0, 20, false),
  ('parcel', 0, 20, false),
  ('person_ride', 0, 20, false)
ON CONFLICT (service_type) DO NOTHING;

-- 2) Active auto-blocks — presence = blocked for that service (unique per rider+service),
--    with a snapshot of the numbers at block time for auditability.
CREATE TABLE IF NOT EXISTS public.rider_cancellation_service_blocks (
  id                 bigserial PRIMARY KEY,
  rider_id           integer NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  service_type       text NOT NULL,
  threshold_pct      numeric(5, 2) NOT NULL,
  rider_fault_rate   numeric(6, 2) NOT NULL,
  accepted_count     integer NOT NULL,
  cancelled_count    integer NOT NULL,
  rider_fault_count  integer NOT NULL,
  reason             text NOT NULL DEFAULT 'cancellation_rate_exceeded',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_cancellation_service_blocks_service_chk
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT rider_cancellation_service_blocks_rider_service_uq
    UNIQUE (rider_id, service_type)
);

CREATE INDEX IF NOT EXISTS rider_cancellation_service_blocks_rider_idx
  ON public.rider_cancellation_service_blocks (rider_id);
CREATE INDEX IF NOT EXISTS rider_cancellation_service_blocks_service_idx
  ON public.rider_cancellation_service_blocks (service_type);
