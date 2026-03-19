-- ============================================================================
-- Add all order_timelines status values to order_status_type enum so
-- orders_core.status can store any timeline stage (Created, Bill Ready, etc.).
-- Timeline statuses mapped to enum: created, bill_ready, payment_initiated_at,
-- payment_done, pymt_assign_rx, dispatch_ready, dispatched, rto_initiated,
-- rto_in_transit, rto_delivered, rto_lost. accepted, delivered, cancelled
-- already exist. Also add 'rejected' for parity with current_status usage.
-- ============================================================================

-- Add new values only if not present (PostgreSQL 9.1+ supports IF NOT EXISTS for ADD VALUE)
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'bill_ready';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'payment_initiated_at';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'payment_done';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'pymt_assign_rx';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'dispatch_ready';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'dispatched';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'rto_initiated';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'rto_in_transit';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'rto_delivered';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'rto_lost';
ALTER TYPE public.order_status_type ADD VALUE IF NOT EXISTS 'rejected';

COMMENT ON TYPE public.order_status_type IS 'Order status: timeline stages (created, bill_ready, payment_done, accepted, dispatch_ready, dispatched, delivered, cancelled, rto_*) plus assigned, reached_store, picked_up, in_transit, failed, rejected.';
