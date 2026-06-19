-- Rider milestone attribution: who marked pickup, whether reach-store was skipped.

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS reached_merchant_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS picked_up_actor_type text,
  ADD COLUMN IF NOT EXISTS picked_up_actor_label text;

COMMENT ON COLUMN public.order_rider_assignments.reached_merchant_skipped IS
  'True when pickup was recorded without rider reaching merchant (e.g. GatiMitra team marked dispatched).';
COMMENT ON COLUMN public.order_rider_assignments.picked_up_actor_type IS
  'Who marked pickup: rider | agent | system';
COMMENT ON COLUMN public.order_rider_assignments.picked_up_actor_label IS
  'Human-readable actor (rider id, agent email, etc.)';

ALTER TABLE public.order_rider_assignment_timeline_events
  DROP CONSTRAINT IF EXISTS order_rider_assignment_timeline_events_type_check;

ALTER TABLE public.order_rider_assignment_timeline_events
  ADD CONSTRAINT order_rider_assignment_timeline_events_type_check CHECK (
    event_type IN (
      'assigned',
      'accepted',
      'reached_merchant',
      'reached_merchant_skipped',
      'picked_up',
      'reached_customer',
      'delivered',
      'rejected',
      'cancelled',
      'unassigned',
      'timeout'
    )
  );
