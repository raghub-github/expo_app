-- ETA Engine — frozen promise snapshot on orders_core.
--
-- Why: the ETA shown at checkout becomes the platform's official promised
-- delivery time. We persist the full computation (prep + assignment + route +
-- traffic + weather + buffer) so:
--   1. dispatchers/support can reconstruct *why* we promised what we promised
--   2. analytics can compare promised vs actual
--   3. recalculations never erase the original snapshot
--
-- All columns are nullable so the migration is safe on existing orders;
-- new orders write all of them at finalize.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS eta_min_minutes              INTEGER,
  ADD COLUMN IF NOT EXISTS eta_max_minutes              INTEGER,
  ADD COLUMN IF NOT EXISTS promised_delivery_at         TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS eta_generated_at             TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS eta_buffer_minutes           INTEGER,
  -- Breakdown — each minute of the promise traced back to its source.
  ADD COLUMN IF NOT EXISTS eta_prep_minutes             INTEGER,
  ADD COLUMN IF NOT EXISTS eta_rider_assignment_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS eta_rider_to_store_minutes   INTEGER,
  ADD COLUMN IF NOT EXISTS eta_store_to_customer_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS eta_traffic_delay_minutes    INTEGER,
  ADD COLUMN IF NOT EXISTS eta_weather_delay_minutes    INTEGER,
  ADD COLUMN IF NOT EXISTS eta_congestion_delay_minutes INTEGER,
  -- Routing audit.
  ADD COLUMN IF NOT EXISTS eta_route_distance_km        NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS eta_confidence_score         NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS eta_version                  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS eta_mapbox_route_id          TEXT,
  ADD COLUMN IF NOT EXISTS eta_route_snapshot           JSONB,
  ADD COLUMN IF NOT EXISTS eta_metadata                 JSONB;

CREATE INDEX IF NOT EXISTS idx_orders_core_promised_delivery_at
  ON public.orders_core (promised_delivery_at)
  WHERE promised_delivery_at IS NOT NULL;
