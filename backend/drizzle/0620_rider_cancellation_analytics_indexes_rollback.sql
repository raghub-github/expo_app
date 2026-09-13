-- Rollback for 0620_rider_cancellation_analytics_indexes.
DROP INDEX IF EXISTS public.order_rider_assignments_rider_accepted_idx;
DROP INDEX IF EXISTS public.order_cancellation_reasons_order_created_idx;
