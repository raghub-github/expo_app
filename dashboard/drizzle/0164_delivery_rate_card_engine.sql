-- Advanced Delivery Rate Card Engine (separate from billing)
-- Supports: service_type (food/parcel/ride), city, zones (GeoJSON), time slots, special days, demand level
-- NOTE: PostGIS is optional; we store GeoJSON and evaluate in the engine for now.

CREATE TABLE IF NOT EXISTS delivery_rate_cards (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  service_type text NOT NULL DEFAULT 'FOOD',
  city_name text,
  scope_type text NOT NULL DEFAULT 'global',
  scope_id bigint,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_rate_cards_lookup_idx
  ON delivery_rate_cards (service_type, city_name, is_active, priority);

CREATE TABLE IF NOT EXISTS delivery_rate_card_distance_slabs (
  id bigserial PRIMARY KEY,
  rate_card_id bigint NOT NULL REFERENCES delivery_rate_cards(id) ON DELETE CASCADE,
  min_km numeric(10, 2),
  max_km numeric(10, 2),
  base_fare numeric(14, 4) NOT NULL DEFAULT 0,
  per_km_rate numeric(14, 4) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS delivery_rate_card_distance_slabs_card_idx
  ON delivery_rate_card_distance_slabs (rate_card_id, priority);

CREATE TABLE IF NOT EXISTS delivery_rate_card_time_slots (
  id bigserial PRIMARY KEY,
  rate_card_id bigint NOT NULL REFERENCES delivery_rate_cards(id) ON DELETE CASCADE,
  -- stored as minutes since midnight in local time
  start_min integer NOT NULL,
  end_min integer NOT NULL,
  surge_multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  is_weekend_only boolean NOT NULL DEFAULT false,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS delivery_rate_card_time_slots_card_idx
  ON delivery_rate_card_time_slots (rate_card_id);

CREATE TABLE IF NOT EXISTS delivery_rate_card_zones (
  id bigserial PRIMARY KEY,
  rate_card_id bigint NOT NULL REFERENCES delivery_rate_cards(id) ON DELETE CASCADE,
  zone_name text,
  geojson jsonb NOT NULL,
  multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS delivery_rate_card_zones_card_idx
  ON delivery_rate_card_zones (rate_card_id, is_active, priority);

CREATE TABLE IF NOT EXISTS delivery_special_days (
  id bigserial PRIMARY KEY,
  day date NOT NULL UNIQUE,
  name text,
  multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS delivery_demand_levels (
  id bigserial PRIMARY KEY,
  service_type text NOT NULL DEFAULT 'FOOD',
  demand_level text NOT NULL, -- LOW | MEDIUM | HIGH | EXTREME
  multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(service_type, demand_level)
);

CREATE TABLE IF NOT EXISTS delivery_rate_card_logs (
  id bigserial PRIMARY KEY,
  order_id bigint,
  merchant_store_id bigint,
  service_type text,
  city_name text,
  pickup_lat numeric(10, 8),
  pickup_lon numeric(11, 8),
  drop_lat numeric(10, 8),
  drop_lon numeric(11, 8),
  distance_km numeric(10, 2),
  applied_rate_card_id bigint,
  applied_slab_id bigint,
  applied_time_slot_id bigint,
  applied_zone_id bigint,
  special_day_id bigint,
  demand_level text,
  base_fare numeric(14, 4),
  per_km_rate numeric(14, 4),
  surge_multiplier numeric(10, 4),
  zone_multiplier numeric(10, 4),
  special_day_multiplier numeric(10, 4),
  demand_multiplier numeric(10, 4),
  total_delivery_fee numeric(14, 4),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

