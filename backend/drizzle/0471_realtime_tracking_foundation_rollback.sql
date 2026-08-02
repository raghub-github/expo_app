-- 0471 rollback: Real-time tracking foundation (Phase 1)
-- Drops the additive columns/indexes and the two new tables. Existing
-- order_rider_tracking data is preserved (only the new columns are removed).

DROP INDEX IF EXISTS public.order_rider_tracking_session_seq_idx;
ALTER TABLE public.order_rider_tracking
  DROP COLUMN IF EXISTS session_id,
  DROP COLUMN IF EXISTS assignment_id,
  DROP COLUMN IF EXISTS service_type,
  DROP COLUMN IF EXISTS sequence_number,
  DROP COLUMN IF EXISTS source;

DROP TABLE IF EXISTS public.tracking_sessions;
DROP TABLE IF EXISTS public.tracking_config;
