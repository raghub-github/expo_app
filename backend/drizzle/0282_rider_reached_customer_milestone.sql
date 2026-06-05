-- Rider timeline: reached customer milestone + assignment timestamp.
-- Migration: 0282_rider_reached_customer_milestone

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS reached_customer_at TIMESTAMPTZ;

ALTER TABLE public.order_rider_assignment_timeline_events
  DROP CONSTRAINT IF EXISTS order_rider_assignment_timeline_events_type_check;

ALTER TABLE public.order_rider_assignment_timeline_events
  ADD CONSTRAINT order_rider_assignment_timeline_events_type_check CHECK (
    event_type IN (
      'assigned',
      'accepted',
      'reached_merchant',
      'picked_up',
      'reached_customer',
      'delivered',
      'rejected',
      'cancelled',
      'unassigned',
      'timeout'
    )
  );
