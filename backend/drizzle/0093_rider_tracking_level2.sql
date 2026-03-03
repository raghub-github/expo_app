-- GatiMitra Rider Tracking System — Level-2
-- delivery_assignments: order ↔ rider link, status timestamps, ETA, route
-- rider_live_locations: one row per rider (fast lookup for "where is rider now")
-- rider_location_history: rider-centric history for replay/analytics
-- order_tracking_tokens: shareable public tracking links (GMTRK_xxx)

-- 1) Delivery assignments: connects rider to order with status and ETA
CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  rider_id INTEGER NOT NULL,
  assignment_status TEXT NOT NULL DEFAULT 'ASSIGNED',

  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  current_eta_minutes INTEGER,
  distance_remaining_km NUMERIC(6, 2),
  route_polyline TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_assignments_order_id_idx ON public.delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS delivery_assignments_rider_id_idx ON public.delivery_assignments(rider_id);
CREATE INDEX IF NOT EXISTS delivery_assignments_status_idx ON public.delivery_assignments(assignment_status);

COMMENT ON TABLE public.delivery_assignments IS 'Order ↔ rider link; ETA and route for customer tracking.';

-- 2) Rider live location: ONE row per rider (super fast lookup)
CREATE TABLE IF NOT EXISTS public.rider_live_locations (
  rider_id INTEGER PRIMARY KEY,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  speed_kmh NUMERIC(5, 2),
  heading NUMERIC(6, 2),
  accuracy_meters NUMERIC(6, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rider_live_locations IS 'Latest position per rider; updated every 3–5 sec by rider app.';

-- 3) Rider location history: for replay, analytics, fraud
CREATE TABLE IF NOT EXISTS public.rider_location_history (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL,
  order_id TEXT,

  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  speed_kmh NUMERIC(5, 2),
  heading NUMERIC(6, 2),
  accuracy_meters NUMERIC(6, 2),

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_location_history_rider_id_recorded_idx
  ON public.rider_location_history(rider_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS rider_location_history_order_id_idx
  ON public.rider_location_history(order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE public.rider_location_history IS 'Rider position history; replay and route optimization.';

-- 4) Shareable tracking tokens (public link: /track/GMTRK_xxx)
CREATE TABLE IF NOT EXISTS public.order_tracking_tokens (
  order_id TEXT PRIMARY KEY,
  tracking_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS order_tracking_tokens_token_idx ON public.order_tracking_tokens(tracking_token);

COMMENT ON TABLE public.order_tracking_tokens IS 'Shareable tracking links; public page shows map + ETA, no PII.';
