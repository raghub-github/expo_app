-- ETA Engine v2 — production-grade critical-path delivery prediction.
--
-- v1 (migration 0232) tracked a coarse range + per-bucket breakdown.
-- v2 adds the columns the engine actually computes:
--   * critical-path food prep time (MAX of item KPTs, NOT average)
--   * kitchen load buffer (step function over active_orders)
--   * pickup buffer (packaging + queue + OTP)
--   * apartment / drop-context buffer
--   * traffic / weather / peak multipliers (stored as numeric for analytics)
--   * actual delivery timestamp + computed restaurant/rider delay
--
-- Naming uses `eta_v2_*` for fresh fields so v1 audit queries on the
-- `eta_*` columns keep working unchanged.

ALTER TABLE public.orders_core
  -- Critical-path breakdown
  ADD COLUMN IF NOT EXISTS eta_food_prep_minutes          INTEGER,
  ADD COLUMN IF NOT EXISTS eta_kitchen_load_buffer_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS eta_pickup_buffer_minutes      INTEGER,
  ADD COLUMN IF NOT EXISTS eta_apartment_buffer_minutes   INTEGER,
  ADD COLUMN IF NOT EXISTS eta_rider_arrival_minutes      INTEGER,
  ADD COLUMN IF NOT EXISTS eta_critical_path_minutes      INTEGER,
  -- Multipliers (stored as numeric so analytics can group/avg)
  ADD COLUMN IF NOT EXISTS eta_traffic_multiplier         NUMERIC(5, 3),
  ADD COLUMN IF NOT EXISTS eta_weather_multiplier         NUMERIC(5, 3),
  ADD COLUMN IF NOT EXISTS eta_peak_hour_multiplier       NUMERIC(5, 3),
  -- Context flags (the inputs that drove the multipliers)
  ADD COLUMN IF NOT EXISTS eta_weather_state              TEXT,
  ADD COLUMN IF NOT EXISTS eta_peak_window                TEXT,
  ADD COLUMN IF NOT EXISTS eta_drop_context               TEXT,
  -- Engine identity + raw audit (full inputs that produced this snapshot)
  ADD COLUMN IF NOT EXISTS eta_engine_version             TEXT,
  ADD COLUMN IF NOT EXISTS eta_v2_metadata                JSONB,
  -- Actuals — populated when status transitions to DELIVERED
  ADD COLUMN IF NOT EXISTS actual_delivered_at            TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS eta_prediction_error_minutes   INTEGER;

-- Accuracy queries: "promised vs actual by day/store"
CREATE INDEX IF NOT EXISTS idx_orders_core_actual_delivered_at
  ON public.orders_core (actual_delivered_at)
  WHERE actual_delivered_at IS NOT NULL;

-- Surface restaurant load samples for kitchen-load analytics. One row per
-- ETA computation, used to validate the load → buffer step function over
-- time and to backfill ML training data.
CREATE TABLE IF NOT EXISTS public.eta_load_samples (
  id              BIGSERIAL PRIMARY KEY,
  store_id        BIGINT      NOT NULL,
  active_orders   INTEGER     NOT NULL,
  kitchen_status  TEXT        NULL,
  prep_efficiency NUMERIC(4, 3) NULL,
  measured_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eta_load_samples_store_measured
  ON public.eta_load_samples (store_id, measured_at DESC);
