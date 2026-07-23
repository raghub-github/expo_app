DROP INDEX IF EXISTS public.order_rider_assignments_pickup_ack_idx;

ALTER TABLE public.order_rider_assignments
  DROP COLUMN IF EXISTS pickup_acknowledgement_version,
  DROP COLUMN IF EXISTS pickup_acknowledged_by,
  DROP COLUMN IF EXISTS pickup_acknowledged_at,
  DROP COLUMN IF EXISTS pickup_acknowledged;
