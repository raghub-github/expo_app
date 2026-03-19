-- ============================================================================
-- Order Timelines: ETA per step (expected_by_at)
-- Migration: 0118_order_timelines_expected_by_at
-- First ETA = expected delivery time for the order at this status (can be set when status changes).
-- ============================================================================

ALTER TABLE public.order_timelines
  ADD COLUMN IF NOT EXISTS expected_by_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.order_timelines.expected_by_at IS 'ETA (expected delivery time) at the time of this status. Used for "X mins left till ETA" / "X mins elapsed past ETA" / "after/before ETA".';
