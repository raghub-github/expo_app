-- =============================================================================
-- All-India customer pricing = Haryana reference sheet (exact, flat)
-- + Geo coverage toggles: ON only for Bihar, West Bengal, Haryana
-- =============================================================================
-- Idempotent. State-level customer slabs for FOOD / PARCEL / RIDE.
-- Clears non-state customer overrides so inherited rates match this sheet.
-- Ride max distance: 2W=25, 3W=35, 4W Non-AC=unlimited (no row), 4W AC=60.
-- Single forward migration; no rollback file.
-- =============================================================================

DO $$
DECLARE
  r record;
  v_seeded int := 0;
  v_on boolean;
  v_has_toggle boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'geo_toggle_service' AND n.nspname = 'public'
  ) INTO v_has_toggle;

  -- ─── Clear child geo customer overrides (region→pincode) so state rates apply ─
  DELETE FROM delivery_rate_slabs
  WHERE service_type = 'food'::order_type
    AND actor_type = 'customer'::delivery_actor_type
    AND geo_level <> 'state'::geo_pricing_level;

  DELETE FROM ride_customer_pricing
  WHERE geo_level <> 'state'::geo_pricing_level;

  DELETE FROM parcel_customer_pricing
  WHERE geo_level <> 'state'::geo_pricing_level;

  -- ─── Seed every state / UT with exact Haryana customer sheet ───────────────
  FOR r IN
    SELECT id, name FROM states ORDER BY name
  LOOP
    -- Purge state-level customer slabs
    DELETE FROM delivery_rate_slabs
    WHERE geo_level = 'state'::geo_pricing_level
      AND geo_ref_id = r.id
      AND service_type = 'food'::order_type
      AND actor_type = 'customer'::delivery_actor_type;

    DELETE FROM ride_customer_pricing
    WHERE geo_level = 'state'::geo_pricing_level
      AND geo_ref_id = r.id;

    DELETE FROM parcel_customer_pricing
    WHERE geo_level = 'state'::geo_pricing_level
      AND geo_ref_id = r.id;

    -- FOOD customer
    INSERT INTO delivery_rate_slabs (
      geo_level, geo_ref_id, service_type, actor_type,
      min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 0,  3, 15.00,  7.50, 20.00, 100, true),
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 3,  6, NULL,  8.50, NULL,  90, true),
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 6, 10, NULL,  9.50, NULL,  80, true),
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 10, NULL, NULL, 10.50, NULL,  70, true);

    -- PARCEL customer (2W / 3W / 4W Non-AC only — no AC)
    INSERT INTO parcel_customer_pricing (
      geo_level, geo_ref_id, vehicle_type,
      min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active, deleted_at
    ) VALUES
      -- 2 Wheeler
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 0,  3, 20.00,  8.00, 35.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 3,  6, NULL,  9.00, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 6, 10, NULL, 10.00, NULL,  80, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 10, 20, NULL, 11.00, NULL,  70, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 20, NULL, NULL, 12.00, NULL,  60, true, NULL),
      -- 3 Wheeler
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 0,  3, 30.00, 10.00, 45.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 3,  6, NULL, 11.00, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 6, 10, NULL, 12.00, NULL,  80, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 10, 20, NULL, 13.00, NULL,  70, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 20, NULL, NULL, 14.00, NULL,  60, true, NULL),
      -- 4 Wheeler
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 0,  3, 45.00, 15.50, 60.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 3,  6, NULL, 16.50, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 6, 10, NULL, 17.00, NULL,  80, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 10, 20, NULL, 18.00, NULL,  70, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 20, NULL, NULL, 19.00, NULL,  60, true, NULL);

    -- RIDE customer
    INSERT INTO ride_customer_pricing (
      geo_level, geo_ref_id, vehicle_type,
      min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active, deleted_at
    ) VALUES
      -- 2 Wheeler (max 25 km)
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 0,  3, 15.00,  8.00, 25.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 3,  8, NULL,  9.00, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 8, 15, NULL, 10.00, NULL,  80, true, NULL),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 15, NULL, NULL, 11.00, NULL,  70, true, NULL),
      -- 3 Wheeler (max 35 km)
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 0,  3, 20.00, 10.50, 25.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 3,  8, NULL, 11.50, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 8, 15, NULL, 12.50, NULL,  80, true, NULL),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 15, NULL, NULL, 13.00, NULL,  70, true, NULL),
      -- 4 Wheeler Non-AC (unlimited)
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 0,  3, 30.00, 11.50, 35.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 3, 10, NULL, 14.50, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 10, NULL, NULL, 19.50, NULL,  80, true, NULL),
      -- 4 Wheeler AC (max 60 km)
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 0,  3, 40.00, 15.00, 60.00, 100, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 3, 10, NULL, 20.00, NULL,  90, true, NULL),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 10, NULL, NULL, 22.00, NULL,  80, true, NULL);

    -- Ride vehicle max distance
    DELETE FROM ride_vehicle_limits WHERE state_id = r.id;
    INSERT INTO ride_vehicle_limits (state_id, vehicle_type, max_distance_km, is_enabled)
    VALUES
      (r.id, '2_wheeler'::ride_vehicle_pricing_type, 25.00, true),
      (r.id, '3_wheeler'::ride_vehicle_pricing_type, 35.00, true),
      -- 4_wheeler_non_ac omitted = unlimited
      (r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 60.00, true);

    v_seeded := v_seeded + 1;
  END LOOP;

  RAISE NOTICE 'Customer pricing seeded for % states/UTs (Haryana reference sheet).', v_seeded;

  -- ─── Service coverage toggles ─────────────────────────────────────────────
  -- Only Bihar, West Bengal, Haryana → food + parcel + ride ON.
  -- All other states/UTs → all three OFF (cascades to children via geo_toggle_service).

  FOR r IN
    SELECT id, upper(trim(name)) AS state_key, name FROM states ORDER BY name
  LOOP
    v_on := r.state_key IN ('BIHAR', 'WEST BENGAL', 'HARYANA');

    IF v_has_toggle THEN
      -- OFF first for non-launch states; ON for the three launch states.
      PERFORM geo_toggle_service('state', r.id, 'food',   v_on);
      PERFORM geo_toggle_service('state', r.id, 'parcel', v_on);
      PERFORM geo_toggle_service('state', r.id, 'ride',   v_on);
    ELSE
      -- Fallback if geo_toggle_service is missing: update state flags only.
      UPDATE states SET
        is_food_enabled = v_on,
        is_parcel_enabled = v_on,
        is_ride_enabled = v_on,
        food_override = true,
        parcel_override = true,
        ride_override = true
      WHERE id = r.id;

      IF NOT v_on THEN
        UPDATE regions SET
          is_food_enabled = false, is_parcel_enabled = false, is_ride_enabled = false,
          food_override = false, parcel_override = false, ride_override = false
        WHERE state_id = r.id;
        UPDATE districts d SET
          is_food_enabled = false, is_parcel_enabled = false, is_ride_enabled = false,
          food_override = false, parcel_override = false, ride_override = false
        WHERE region_id IN (SELECT id FROM regions WHERE state_id = r.id);
        UPDATE divisions dv SET
          is_food_enabled = false, is_parcel_enabled = false, is_ride_enabled = false,
          food_override = false, parcel_override = false, ride_override = false
        WHERE district_id IN (
          SELECT d.id FROM districts d
          JOIN regions rg ON rg.id = d.region_id
          WHERE rg.state_id = r.id
        );
        UPDATE post_offices po SET
          is_food_enabled = false, is_parcel_enabled = false, is_ride_enabled = false,
          food_override = false, parcel_override = false, ride_override = false
        WHERE division_id IN (
          SELECT dv.id FROM divisions dv
          JOIN districts d ON d.id = dv.district_id
          JOIN regions rg ON rg.id = d.region_id
          WHERE rg.state_id = r.id
        );
        UPDATE pincodes p SET
          is_food_enabled = false, is_parcel_enabled = false, is_ride_enabled = false,
          food_override = false, parcel_override = false, ride_override = false
        WHERE id IN (
          SELECT ppo.pincode_id FROM pincode_post_offices ppo
          JOIN post_offices po ON po.id = ppo.post_office_id
          JOIN divisions dv ON dv.id = po.division_id
          JOIN districts d ON d.id = dv.district_id
          JOIN regions rg ON rg.id = d.region_id
          WHERE rg.state_id = r.id
        );
      END IF;
    END IF;

    RAISE NOTICE 'Coverage % → food/parcel/ride = %', r.name, v_on;
  END LOOP;

  RAISE NOTICE 'SUCCESS: Haryana customer slabs applied nationwide; coverage ON only for Bihar, West Bengal, Haryana.';
END
$$;
