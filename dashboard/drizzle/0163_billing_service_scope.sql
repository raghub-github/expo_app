-- Service scope (food / parcel / ride), delivery rate cards, platform offers
-- Idempotent where possible.

ALTER TABLE billing_pricing_rules
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'FOOD';

ALTER TABLE billing_tax_configs
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'FOOD';

ALTER TABLE billing_discounts
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'FOOD';

CREATE TABLE IF NOT EXISTS billing_delivery_rate_cards (
  id bigserial PRIMARY KEY,
  name text,
  service_type text NOT NULL DEFAULT 'FOOD',
  city_name text,
  time_slot text,
  base_fare numeric(14, 4) NOT NULL DEFAULT 0,
  per_km_rate numeric(14, 4) NOT NULL DEFAULT 0,
  surge_multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  min_km numeric(10, 2),
  max_km numeric(10, 2),
  free_delivery_above numeric(14, 4),
  scope_type text NOT NULL DEFAULT 'global',
  scope_id bigint,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_delivery_rate_cards_lookup_idx
  ON billing_delivery_rate_cards (service_type, is_active, priority);

CREATE TABLE IF NOT EXISTS billing_platform_offers (
  id bigserial PRIMARY KEY,
  name text,
  service_type text NOT NULL DEFAULT 'FOOD',
  discount_type text NOT NULL DEFAULT 'PERCENTAGE',
  value_numeric numeric(14, 4),
  delivery_discount_type text,
  delivery_discount_value numeric(14, 4),
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_hidden boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_platform_offers_service_active_idx
  ON billing_platform_offers (service_type, is_active, priority);
