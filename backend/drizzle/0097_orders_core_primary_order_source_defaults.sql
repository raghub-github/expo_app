-- orders_core is the primary order table. All order_source columns default to 'orders_core'.
-- Ensures new rows (events, ETA, tracking, kitchen) reference orders_core; safe to run after 0094/0096.

ALTER TABLE public.order_events
  ALTER COLUMN order_source SET DEFAULT 'orders_core';

ALTER TABLE public.order_eta_snapshots
  ALTER COLUMN order_source SET DEFAULT 'orders_core';

ALTER TABLE public.order_rider_tracking
  ALTER COLUMN order_source SET DEFAULT 'orders_core';

ALTER TABLE public.order_kitchen_timeline
  ALTER COLUMN order_source SET DEFAULT 'orders_core';

COMMENT ON TABLE public.orders_core IS 'Primary order table; canonical order_id (GM10000001). All placement and tracking reference this table.';
