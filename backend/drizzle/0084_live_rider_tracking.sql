-- Level-2: Live rider tracking schema for real-time position updates.
-- High write volume; index on (order_id, created_at DESC) for latest position per order.

CREATE TABLE IF NOT EXISTS public.order_rider_tracking (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_source TEXT NOT NULL DEFAULT 'core_orders',
  rider_id INTEGER,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  heading_degrees NUMERIC(5, 2),
  speed_kmh NUMERIC(5, 2),
  accuracy_meters NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT order_rider_tracking_order_source_check CHECK (order_source IN ('core_orders', 'orders_core'))
);

CREATE INDEX IF NOT EXISTS order_rider_tracking_order_id_created_idx
  ON public.order_rider_tracking(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_rider_tracking_rider_id_created_idx
  ON public.order_rider_tracking(rider_id, created_at DESC) WHERE rider_id IS NOT NULL;

COMMENT ON TABLE public.order_rider_tracking IS 'Live rider position updates; poll or subscribe for map.';

-- Latest position per order (materialized or view for fast read).
CREATE OR REPLACE VIEW public.order_rider_tracking_latest AS
SELECT DISTINCT ON (order_id)
  order_id,
  order_source,
  rider_id,
  latitude,
  longitude,
  heading_degrees,
  speed_kmh,
  created_at
FROM public.order_rider_tracking
ORDER BY order_id, created_at DESC;

COMMENT ON VIEW public.order_rider_tracking_latest IS 'One row per order: latest rider position.';
