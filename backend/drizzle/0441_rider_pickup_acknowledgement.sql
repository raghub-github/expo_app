-- Persist rider "Okay, I'm picking!" acknowledgement per active assignment.
-- Migration: 0441_rider_pickup_acknowledgement

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS pickup_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pickup_acknowledged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pickup_acknowledged_by INTEGER NULL REFERENCES public.riders(id),
  ADD COLUMN IF NOT EXISTS pickup_acknowledgement_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.order_rider_assignments.pickup_acknowledged IS
  'True after assigned rider taps Okay I am picking on the pick-order sheet.';
COMMENT ON COLUMN public.order_rider_assignments.pickup_acknowledged_at IS
  'When the rider acknowledged they are collecting the order at merchant.';
COMMENT ON COLUMN public.order_rider_assignments.pickup_acknowledged_by IS
  'Rider who acknowledged pickup intent for this assignment.';
COMMENT ON COLUMN public.order_rider_assignments.pickup_acknowledgement_version IS
  'Schema version for pickup acknowledgement payload; default 1.';

CREATE INDEX IF NOT EXISTS order_rider_assignments_pickup_ack_idx
  ON public.order_rider_assignments (order_core_id, rider_id, pickup_acknowledged)
  WHERE is_active = TRUE AND pickup_acknowledged = TRUE;
