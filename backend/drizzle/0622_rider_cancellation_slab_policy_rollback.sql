-- Rollback for 0622_rider_cancellation_slab_policy.
-- Recreates the flat 0621 config table so the prior code path still resolves.
ALTER TABLE public.rider_cancellation_service_blocks
  DROP COLUMN IF EXISTS slab_number,
  DROP COLUMN IF EXISTS policy_version;

DROP TABLE IF EXISTS public.rider_cancellation_policy_slabs;
DROP TABLE IF EXISTS public.rider_cancellation_policy;

CREATE TABLE IF NOT EXISTS public.rider_cancellation_block_config (
  service_type   text PRIMARY KEY,
  threshold_pct  numeric(5, 2) NOT NULL DEFAULT 0,
  min_accepted   integer NOT NULL DEFAULT 20,
  enabled        boolean NOT NULL DEFAULT false,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.rider_cancellation_block_config (service_type, threshold_pct, min_accepted, enabled)
VALUES ('food', 0, 20, false), ('parcel', 0, 20, false), ('person_ride', 0, 20, false)
ON CONFLICT (service_type) DO NOTHING;
