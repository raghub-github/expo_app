-- Platform fallback slab pricing (Food / Parcel / Ride per vehicle).
-- Used when geo slab lookup fails, is invalid, or pincode is unmapped.
-- Managed from Super Admin → Geo → Fallback Del charge.

CREATE TABLE IF NOT EXISTS geo_fallback_pricing_slabs (
  id bigserial PRIMARY KEY,
  service_type order_type NOT NULL,
  pricing_side delivery_actor_type NOT NULL DEFAULT 'customer',
  vehicle_type ride_vehicle_pricing_type NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  per_km_rate numeric(12, 2) NOT NULL DEFAULT 0,
  min_charge numeric(12, 2) NULL,
  waiting_charge_per_min numeric(14, 6) NULL,
  waiting_start_after integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_fallback_pricing_slabs_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT geo_fallback_pricing_slabs_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT geo_fallback_pricing_slabs_base_fare_first_only CHECK (base_fare IS NULL OR min_km = 0),
  CONSTRAINT geo_fallback_pricing_slabs_per_km_nonneg CHECK (per_km_rate >= 0),
  CONSTRAINT geo_fallback_pricing_slabs_waiting_start_nonneg CHECK (waiting_start_after >= 0),
  CONSTRAINT geo_fallback_pricing_slabs_vehicle_scope CHECK (
    (service_type = 'person_ride' AND vehicle_type IS NOT NULL)
    OR (service_type IN ('food', 'parcel') AND vehicle_type IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS geo_fallback_pricing_slabs_lookup_idx
  ON geo_fallback_pricing_slabs (service_type, pricing_side, vehicle_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS geo_fallback_pricing_slabs_order_idx
  ON geo_fallback_pricing_slabs (service_type, pricing_side, vehicle_type, min_km ASC, priority DESC)
  WHERE deleted_at IS NULL AND is_active = true;

COMMENT ON TABLE geo_fallback_pricing_slabs IS
  'Platform-wide fallback customer pricing slabs when geo delivery slabs are unavailable.';

-- Bootstrap legacy flat formula (system_config) into one open-ended slab per service / ride vehicle.
DO $$
DECLARE
  v_base numeric := 25;
  v_per_km numeric := 5;
  v_min_charge numeric := 0;
  v_vehicle ride_vehicle_pricing_type;
BEGIN
  SELECT COALESCE(
    (SELECT NULLIF(trim(config_value::text), '')::numeric FROM system_config WHERE config_key = 'delivery.fallback_base_inr'),
    25
  ) INTO v_base;
  SELECT COALESCE(
    (SELECT NULLIF(trim(config_value::text), '')::numeric FROM system_config WHERE config_key = 'delivery.fallback_per_km_inr'),
    5
  ) INTO v_per_km;
  SELECT COALESCE(
    (SELECT NULLIF(trim(config_value::text), '')::numeric FROM system_config WHERE config_key = 'delivery.min_fee_inr'),
    0
  ) INTO v_min_charge;

  IF NOT EXISTS (
    SELECT 1 FROM geo_fallback_pricing_slabs
    WHERE service_type = 'food' AND pricing_side = 'customer' AND deleted_at IS NULL
  ) THEN
    INSERT INTO geo_fallback_pricing_slabs (
      service_type, pricing_side, min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES (
      'food', 'customer', 0, NULL, v_base, v_per_km,
      CASE WHEN v_min_charge > 0 THEN v_min_charge ELSE NULL END,
      100, true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM geo_fallback_pricing_slabs
    WHERE service_type = 'parcel' AND pricing_side = 'customer' AND deleted_at IS NULL
  ) THEN
    INSERT INTO geo_fallback_pricing_slabs (
      service_type, pricing_side, min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES (
      'parcel', 'customer', 0, NULL, v_base, v_per_km,
      CASE WHEN v_min_charge > 0 THEN v_min_charge ELSE NULL END,
      100, true
    );
  END IF;

  FOREACH v_vehicle IN ARRAY ARRAY[
    '2_wheeler'::ride_vehicle_pricing_type,
    '3_wheeler'::ride_vehicle_pricing_type,
    '4_wheeler_non_ac'::ride_vehicle_pricing_type,
    '4_wheeler_ac'::ride_vehicle_pricing_type
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM geo_fallback_pricing_slabs
      WHERE service_type = 'person_ride'
        AND pricing_side = 'customer'
        AND vehicle_type = v_vehicle
        AND deleted_at IS NULL
    ) THEN
      INSERT INTO geo_fallback_pricing_slabs (
        service_type, pricing_side, vehicle_type, min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
      ) VALUES (
        'person_ride', 'customer', v_vehicle, 0, NULL, v_base, v_per_km,
        CASE WHEN v_min_charge > 0 THEN v_min_charge ELSE NULL END,
        100, true
      );
    END IF;
  END LOOP;
END $$;
