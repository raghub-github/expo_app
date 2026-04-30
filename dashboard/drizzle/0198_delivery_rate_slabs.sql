-- Progressive slab-based delivery pricing (geo inherited).
-- Dashboard migration mirrors backend schema for admin CRUD.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_actor_type') THEN
    CREATE TYPE delivery_actor_type AS ENUM ('customer', 'rider');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS delivery_rate_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  service_type order_type NOT NULL,
  actor_type delivery_actor_type NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  per_km_rate numeric(12, 2) NOT NULL,
  min_charge numeric(12, 2) NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_rate_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT delivery_rate_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT delivery_rate_slabs_base_fare_first_only CHECK (base_fare IS NULL OR (min_km = 0)),
  CONSTRAINT delivery_rate_slabs_base_fare_nonneg CHECK (base_fare IS NULL OR base_fare >= 0),
  CONSTRAINT delivery_rate_slabs_per_km_nonneg CHECK (per_km_rate >= 0),
  CONSTRAINT delivery_rate_slabs_min_charge_nonneg CHECK (min_charge IS NULL OR min_charge >= 0)
);

CREATE INDEX IF NOT EXISTS delivery_rate_slabs_geo_scope_idx
  ON delivery_rate_slabs (geo_level, geo_ref_id, service_type, actor_type, is_active);

CREATE INDEX IF NOT EXISTS delivery_rate_slabs_geo_priority_idx
  ON delivery_rate_slabs (geo_level, geo_ref_id, service_type, actor_type, priority DESC);

-- Progressive slab-based delivery pricing (geo inherited).
-- Used for:
-- - Customer delivery fee
-- - Rider payout
--
-- Core rule: base_fare can be applied only once (first slab). Enforced by CHECK: base_fare allowed only when min_km = 0.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_actor_type') THEN
    CREATE TYPE delivery_actor_type AS ENUM ('customer', 'rider');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS delivery_rate_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  service_type order_type NOT NULL,
  actor_type delivery_actor_type NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  per_km_rate numeric(12, 2) NOT NULL,
  min_charge numeric(12, 2) NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_rate_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT delivery_rate_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT delivery_rate_slabs_base_fare_first_only CHECK (base_fare IS NULL OR (min_km = 0)),
  CONSTRAINT delivery_rate_slabs_base_fare_nonneg CHECK (base_fare IS NULL OR base_fare >= 0),
  CONSTRAINT delivery_rate_slabs_per_km_nonneg CHECK (per_km_rate >= 0),
  CONSTRAINT delivery_rate_slabs_min_charge_nonneg CHECK (min_charge IS NULL OR min_charge >= 0)
);

CREATE INDEX IF NOT EXISTS delivery_rate_slabs_geo_scope_idx
  ON delivery_rate_slabs (geo_level, geo_ref_id, service_type, actor_type, is_active);

CREATE INDEX IF NOT EXISTS delivery_rate_slabs_geo_priority_idx
  ON delivery_rate_slabs (geo_level, geo_ref_id, service_type, actor_type, priority DESC);

