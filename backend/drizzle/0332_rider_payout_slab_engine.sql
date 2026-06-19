-- Rider payout slab engine upgrade: separate pickup/drop slabs per service + ride vehicle pricing.
-- Customer delivery_rate_slabs remain unchanged.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ride_vehicle_pricing_type') THEN
    CREATE TYPE ride_vehicle_pricing_type AS ENUM (
      '2_wheeler',
      '3_wheeler',
      '4_wheeler_non_ac',
      '4_wheeler_ac'
    );
  END IF;
END
$$;

-- ─── Food rider slabs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS food_rider_pickup_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  pickup_per_km numeric(12, 2) NOT NULL DEFAULT 0,
  min_charge numeric(12, 2) NULL,
  waiting_charge_per_min numeric(14, 6) NULL,
  waiting_start_after integer NOT NULL DEFAULT 0,
  surge_multiplier numeric(14, 6) NULL DEFAULT 1,
  surge_max_only boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_rider_pickup_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT food_rider_pickup_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT food_rider_pickup_slabs_base_fare_first_only CHECK (base_fare IS NULL OR min_km = 0),
  CONSTRAINT food_rider_pickup_slabs_pickup_per_km_nonneg CHECK (pickup_per_km >= 0),
  CONSTRAINT food_rider_pickup_slabs_waiting_start_nonneg CHECK (waiting_start_after >= 0),
  CONSTRAINT food_rider_pickup_slabs_surge_min CHECK (surge_multiplier IS NULL OR surge_multiplier >= 1)
);

CREATE TABLE IF NOT EXISTS food_rider_drop_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  drop_per_km numeric(12, 2) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_rider_drop_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT food_rider_drop_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT food_rider_drop_slabs_drop_per_km_nonneg CHECK (drop_per_km >= 0)
);

CREATE INDEX IF NOT EXISTS food_rider_pickup_slabs_geo_idx
  ON food_rider_pickup_slabs (geo_level, geo_ref_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS food_rider_pickup_slabs_geo_priority_idx
  ON food_rider_pickup_slabs (geo_level, geo_ref_id, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS food_rider_drop_slabs_geo_idx
  ON food_rider_drop_slabs (geo_level, geo_ref_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS food_rider_drop_slabs_geo_priority_idx
  ON food_rider_drop_slabs (geo_level, geo_ref_id, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

-- ─── Parcel rider slabs ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parcel_rider_pickup_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  pickup_per_km numeric(12, 2) NOT NULL DEFAULT 0,
  min_charge numeric(12, 2) NULL,
  waiting_charge_per_min numeric(14, 6) NULL,
  waiting_start_after integer NOT NULL DEFAULT 0,
  surge_multiplier numeric(14, 6) NULL DEFAULT 1,
  surge_max_only boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parcel_rider_pickup_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT parcel_rider_pickup_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT parcel_rider_pickup_slabs_base_fare_first_only CHECK (base_fare IS NULL OR min_km = 0),
  CONSTRAINT parcel_rider_pickup_slabs_pickup_per_km_nonneg CHECK (pickup_per_km >= 0),
  CONSTRAINT parcel_rider_pickup_slabs_waiting_start_nonneg CHECK (waiting_start_after >= 0),
  CONSTRAINT parcel_rider_pickup_slabs_surge_min CHECK (surge_multiplier IS NULL OR surge_multiplier >= 1)
);

CREATE TABLE IF NOT EXISTS parcel_rider_drop_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  drop_per_km numeric(12, 2) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parcel_rider_drop_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT parcel_rider_drop_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT parcel_rider_drop_slabs_drop_per_km_nonneg CHECK (drop_per_km >= 0)
);

CREATE INDEX IF NOT EXISTS parcel_rider_pickup_slabs_geo_idx
  ON parcel_rider_pickup_slabs (geo_level, geo_ref_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS parcel_rider_pickup_slabs_geo_priority_idx
  ON parcel_rider_pickup_slabs (geo_level, geo_ref_id, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS parcel_rider_drop_slabs_geo_idx
  ON parcel_rider_drop_slabs (geo_level, geo_ref_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS parcel_rider_drop_slabs_geo_priority_idx
  ON parcel_rider_drop_slabs (geo_level, geo_ref_id, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

-- ─── Ride customer + rider slabs (vehicle-type scoped) ────────────────────────

CREATE TABLE IF NOT EXISTS ride_customer_pricing (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  vehicle_type ride_vehicle_pricing_type NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  per_km_rate numeric(12, 2) NOT NULL DEFAULT 0,
  min_charge numeric(12, 2) NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_customer_pricing_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT ride_customer_pricing_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT ride_customer_pricing_base_fare_first_only CHECK (base_fare IS NULL OR min_km = 0),
  CONSTRAINT ride_customer_pricing_per_km_nonneg CHECK (per_km_rate >= 0)
);

CREATE TABLE IF NOT EXISTS ride_rider_pickup_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  vehicle_type ride_vehicle_pricing_type NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  pickup_per_km numeric(12, 2) NOT NULL DEFAULT 0,
  min_charge numeric(12, 2) NULL,
  waiting_charge_per_min numeric(14, 6) NULL,
  waiting_start_after integer NOT NULL DEFAULT 0,
  surge_multiplier numeric(14, 6) NULL DEFAULT 1,
  surge_max_only boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_rider_pickup_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT ride_rider_pickup_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT ride_rider_pickup_slabs_base_fare_first_only CHECK (base_fare IS NULL OR min_km = 0),
  CONSTRAINT ride_rider_pickup_slabs_pickup_per_km_nonneg CHECK (pickup_per_km >= 0),
  CONSTRAINT ride_rider_pickup_slabs_waiting_start_nonneg CHECK (waiting_start_after >= 0),
  CONSTRAINT ride_rider_pickup_slabs_surge_min CHECK (surge_multiplier IS NULL OR surge_multiplier >= 1)
);

CREATE TABLE IF NOT EXISTS ride_rider_drop_slabs (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  vehicle_type ride_vehicle_pricing_type NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  drop_per_km numeric(12, 2) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_rider_drop_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT ride_rider_drop_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT ride_rider_drop_slabs_drop_per_km_nonneg CHECK (drop_per_km >= 0)
);

CREATE INDEX IF NOT EXISTS ride_customer_pricing_geo_vehicle_idx
  ON ride_customer_pricing (geo_level, geo_ref_id, vehicle_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ride_customer_pricing_geo_priority_idx
  ON ride_customer_pricing (geo_level, geo_ref_id, vehicle_type, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS ride_rider_pickup_slabs_geo_vehicle_idx
  ON ride_rider_pickup_slabs (geo_level, geo_ref_id, vehicle_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ride_rider_pickup_slabs_geo_priority_idx
  ON ride_rider_pickup_slabs (geo_level, geo_ref_id, vehicle_type, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS ride_rider_drop_slabs_geo_vehicle_idx
  ON ride_rider_drop_slabs (geo_level, geo_ref_id, vehicle_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ride_rider_drop_slabs_geo_priority_idx
  ON ride_rider_drop_slabs (geo_level, geo_ref_id, vehicle_type, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

-- ─── Backfill from legacy delivery_rate_slabs (rider actor) ───────────────────
-- Copies existing rider slabs into new pickup+drop tables so payouts continue working.

INSERT INTO food_rider_pickup_slabs (
  geo_level, geo_ref_id, min_km, max_km, base_fare, pickup_per_km, min_charge,
  waiting_charge_per_min, waiting_start_after, surge_multiplier, surge_max_only,
  priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, s.min_km, s.max_km, s.base_fare, s.per_km_rate, s.min_charge,
  s.waiting_charge_per_min, 0, COALESCE(s.surge_multiplier, 1), false,
  s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
WHERE s.service_type = 'food'::order_type
  AND s.actor_type = 'rider'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM food_rider_pickup_slabs f
    WHERE f.geo_level = s.geo_level AND f.geo_ref_id = s.geo_ref_id AND f.deleted_at IS NULL
  );

INSERT INTO food_rider_drop_slabs (
  geo_level, geo_ref_id, min_km, max_km, drop_per_km, priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, s.min_km, s.max_km, s.per_km_rate, s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
WHERE s.service_type = 'food'::order_type
  AND s.actor_type = 'rider'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM food_rider_drop_slabs f
    WHERE f.geo_level = s.geo_level AND f.geo_ref_id = s.geo_ref_id AND f.deleted_at IS NULL
  );

INSERT INTO parcel_rider_pickup_slabs (
  geo_level, geo_ref_id, min_km, max_km, base_fare, pickup_per_km, min_charge,
  waiting_charge_per_min, waiting_start_after, surge_multiplier, surge_max_only,
  priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, s.min_km, s.max_km, s.base_fare, s.per_km_rate, s.min_charge,
  s.waiting_charge_per_min, 0, COALESCE(s.surge_multiplier, 1), false,
  s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
WHERE s.service_type = 'parcel'::order_type
  AND s.actor_type = 'rider'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM parcel_rider_pickup_slabs f
    WHERE f.geo_level = s.geo_level AND f.geo_ref_id = s.geo_ref_id AND f.deleted_at IS NULL
  );

INSERT INTO parcel_rider_drop_slabs (
  geo_level, geo_ref_id, min_km, max_km, drop_per_km, priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, s.min_km, s.max_km, s.per_km_rate, s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
WHERE s.service_type = 'parcel'::order_type
  AND s.actor_type = 'rider'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM parcel_rider_drop_slabs f
    WHERE f.geo_level = s.geo_level AND f.geo_ref_id = s.geo_ref_id AND f.deleted_at IS NULL
  );

-- Ride: backfill all four vehicle types from person_ride rider slabs (same rates initially).
INSERT INTO ride_rider_pickup_slabs (
  geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, pickup_per_km, min_charge,
  waiting_charge_per_min, waiting_start_after, surge_multiplier, surge_max_only,
  priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, vt.vehicle_type, s.min_km, s.max_km, s.base_fare, s.per_km_rate, s.min_charge,
  s.waiting_charge_per_min, 0, COALESCE(s.surge_multiplier, 1), false,
  s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
CROSS JOIN (
  SELECT unnest(ARRAY[
    '2_wheeler'::ride_vehicle_pricing_type,
    '3_wheeler'::ride_vehicle_pricing_type,
    '4_wheeler_non_ac'::ride_vehicle_pricing_type,
    '4_wheeler_ac'::ride_vehicle_pricing_type
  ]) AS vehicle_type
) vt
WHERE s.service_type = 'person_ride'::order_type
  AND s.actor_type = 'rider'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM ride_rider_pickup_slabs r
    WHERE r.geo_level = s.geo_level AND r.geo_ref_id = s.geo_ref_id
      AND r.vehicle_type = vt.vehicle_type AND r.deleted_at IS NULL
  );

INSERT INTO ride_rider_drop_slabs (
  geo_level, geo_ref_id, vehicle_type, min_km, max_km, drop_per_km, priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, vt.vehicle_type, s.min_km, s.max_km, s.per_km_rate, s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
CROSS JOIN (
  SELECT unnest(ARRAY[
    '2_wheeler'::ride_vehicle_pricing_type,
    '3_wheeler'::ride_vehicle_pricing_type,
    '4_wheeler_non_ac'::ride_vehicle_pricing_type,
    '4_wheeler_ac'::ride_vehicle_pricing_type
  ]) AS vehicle_type
) vt
WHERE s.service_type = 'person_ride'::order_type
  AND s.actor_type = 'rider'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM ride_rider_drop_slabs r
    WHERE r.geo_level = s.geo_level AND r.geo_ref_id = s.geo_ref_id
      AND r.vehicle_type = vt.vehicle_type AND r.deleted_at IS NULL
  );

INSERT INTO ride_customer_pricing (
  geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, per_km_rate, min_charge,
  priority, is_active, created_at, updated_at
)
SELECT
  s.geo_level, s.geo_ref_id, vt.vehicle_type, s.min_km, s.max_km, s.base_fare, s.per_km_rate, s.min_charge,
  s.priority, s.is_active, s.created_at, s.updated_at
FROM delivery_rate_slabs s
CROSS JOIN (
  SELECT unnest(ARRAY[
    '2_wheeler'::ride_vehicle_pricing_type,
    '3_wheeler'::ride_vehicle_pricing_type,
    '4_wheeler_non_ac'::ride_vehicle_pricing_type,
    '4_wheeler_ac'::ride_vehicle_pricing_type
  ]) AS vehicle_type
) vt
WHERE s.service_type = 'person_ride'::order_type
  AND s.actor_type = 'customer'::delivery_actor_type
  AND NOT EXISTS (
    SELECT 1 FROM ride_customer_pricing r
    WHERE r.geo_level = s.geo_level AND r.geo_ref_id = s.geo_ref_id
      AND r.vehicle_type = vt.vehicle_type AND r.deleted_at IS NULL
  );

COMMENT ON TABLE food_rider_pickup_slabs IS 'Food delivery rider payout — pickup leg (rider→merchant) progressive slabs.';
COMMENT ON TABLE food_rider_drop_slabs IS 'Food delivery rider payout — drop leg (merchant→customer) progressive slabs.';
COMMENT ON TABLE parcel_rider_pickup_slabs IS 'Parcel rider payout — pickup leg progressive slabs.';
COMMENT ON TABLE parcel_rider_drop_slabs IS 'Parcel rider payout — drop leg progressive slabs.';
COMMENT ON TABLE ride_customer_pricing IS 'Ride customer pricing per vehicle type (progressive slabs).';
COMMENT ON TABLE ride_rider_pickup_slabs IS 'Ride rider payout — pickup leg per vehicle type.';
COMMENT ON TABLE ride_rider_drop_slabs IS 'Ride rider payout — drop leg per vehicle type.';
COMMENT ON COLUMN food_rider_pickup_slabs.waiting_start_after IS 'Free waiting minutes before waiting_charge_per_min applies.';
COMMENT ON COLUMN food_rider_pickup_slabs.surge_max_only IS 'When true, only GMitra Max riders receive surge + waiting payout.';
