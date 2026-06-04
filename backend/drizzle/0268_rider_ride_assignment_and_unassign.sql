-- ============================================================================
-- Person ride: rider reached pickup timestamp + post-assign unassign audit
-- Migration: 0268_rider_ride_assignment_and_unassign
-- ============================================================================

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS rider_reached_pickup_at timestamp with time zone NULL;

COMMENT ON COLUMN public.orders_ride.rider_reached_pickup_at IS
  'When assigned rider marked reached pickup (before trip start).';

CREATE TABLE IF NOT EXISTS public.order_rider_ride_unassignments (
  id bigserial PRIMARY KEY,
  order_core_id bigint NOT NULL REFERENCES public.orders_core (id) ON DELETE CASCADE,
  order_id text NOT NULL,
  rider_id integer NOT NULL REFERENCES public.riders (id) ON DELETE RESTRICT,
  reason_code text NOT NULL,
  reason_text text NULL,
  core_status_before text NULL,
  core_status_after text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_rider_ride_unassignments_order_idx
  ON public.order_rider_ride_unassignments (order_core_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_rider_ride_unassignments_rider_idx
  ON public.order_rider_ride_unassignments (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_rider_ride_unassignments_order_id_idx
  ON public.order_rider_ride_unassignments (order_id, created_at DESC);

COMMENT ON TABLE public.order_rider_ride_unassignments IS
  'Audit when a rider backs out after accepting a person_ride (order returns to dispatch pool).';
