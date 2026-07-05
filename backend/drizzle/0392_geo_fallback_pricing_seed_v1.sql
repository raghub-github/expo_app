-- =============================================================================
-- GatiMitra Platform Fallback Customer Pricing — Delhi Baseline Seed (Production v1)
-- =============================================================================
-- Dashboard: Super Admin → Geo & Coverage → Fallback Del charge
-- Table     : geo_fallback_pricing_slabs (pricing_side = customer)
--
-- Mirrors Delhi state customer slabs from 0391_all_india_food_ride_pricing_seed_v1
-- so unmapped / invalid geo lookups charge the same progressive rates as Delhi.
--
-- Food / Parcel : 0-3 base 25 / ₹7/km / min 39 | 3-6 ₹8 | 6-10 ₹10 | 10+ ₹12
-- Ride 2W       : 0-3 25/8/39 | 3-8 9 | 8+ 10
-- Ride 3W       : 0-3 40/12/55 | 3-8 13 | 8+ 14
-- Ride 4W Non AC: 0-3 70/15/90 | 3-10 16 | 10+ 18
-- Ride 4W AC    : 0-3 85/17/110 | 3-10 18 | 10+ 20
--
-- Idempotent: deletes active customer fallback slabs then re-inserts. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_food int := 0;
  v_parcel int := 0;
  v_ride int := 0;
BEGIN
  -- Purge legacy flat fallback slabs (₹22 + ₹5/km bootstrap from 0366)
  DELETE FROM geo_fallback_pricing_slabs
  WHERE pricing_side = 'customer'::delivery_actor_type
    AND deleted_at IS NULL;

  -- ─── FOOD → CUSTOMER (4 progressive slabs) ─────────────────────────────────

  INSERT INTO geo_fallback_pricing_slabs (
    service_type, pricing_side, vehicle_type,
    min_km, max_km, base_fare, per_km_rate, min_charge,
    waiting_charge_per_min, waiting_start_after,
    priority, is_active
  ) VALUES
    ('food'::order_type, 'customer'::delivery_actor_type, NULL, 0,  3, 25,  7, 39, NULL, 0, 100, true),
    ('food'::order_type, 'customer'::delivery_actor_type, NULL, 3,  6, NULL, 8, NULL, NULL, 0, 90, true),
    ('food'::order_type, 'customer'::delivery_actor_type, NULL, 6, 10, NULL, 10, NULL, NULL, 0, 80, true),
    ('food'::order_type, 'customer'::delivery_actor_type, NULL, 10, NULL, NULL, 12, NULL, NULL, 0, 70, true);

  GET DIAGNOSTICS v_food = ROW_COUNT;

  -- ─── PARCEL → CUSTOMER (same Delhi delivery band as food) ──────────────────

  INSERT INTO geo_fallback_pricing_slabs (
    service_type, pricing_side, vehicle_type,
    min_km, max_km, base_fare, per_km_rate, min_charge,
    waiting_charge_per_min, waiting_start_after,
    priority, is_active
  ) VALUES
    ('parcel'::order_type, 'customer'::delivery_actor_type, NULL, 0,  3, 25,  7, 39, NULL, 0, 100, true),
    ('parcel'::order_type, 'customer'::delivery_actor_type, NULL, 3,  6, NULL, 8, NULL, NULL, 0, 90, true),
    ('parcel'::order_type, 'customer'::delivery_actor_type, NULL, 6, 10, NULL, 10, NULL, NULL, 0, 80, true),
    ('parcel'::order_type, 'customer'::delivery_actor_type, NULL, 10, NULL, NULL, 12, NULL, NULL, 0, 70, true);

  GET DIAGNOSTICS v_parcel = ROW_COUNT;

  -- ─── PERSON RIDE → CUSTOMER (per vehicle × 3 slabs) ────────────────────────

  INSERT INTO geo_fallback_pricing_slabs (
    service_type, pricing_side, vehicle_type,
    min_km, max_km, base_fare, per_km_rate, min_charge,
    waiting_charge_per_min, waiting_start_after,
    priority, is_active
  ) VALUES
    -- 2 Wheeler
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '2_wheeler'::ride_vehicle_pricing_type, 0, 3, 25,  8, 39, NULL, 0, 100, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '2_wheeler'::ride_vehicle_pricing_type, 3, 8, NULL, 9, NULL, NULL, 0, 90, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '2_wheeler'::ride_vehicle_pricing_type, 8, NULL, NULL, 10, NULL, NULL, 0, 80, true),
    -- 3 Wheeler
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '3_wheeler'::ride_vehicle_pricing_type, 0, 3, 40, 12, 55, NULL, 0, 100, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '3_wheeler'::ride_vehicle_pricing_type, 3, 8, NULL, 13, NULL, NULL, 0, 90, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '3_wheeler'::ride_vehicle_pricing_type, 8, NULL, NULL, 14, NULL, NULL, 0, 80, true),
    -- 4 Wheeler Non AC
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 0,  3, 70, 15, 90, NULL, 0, 100, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 3, 10, NULL, 16, NULL, NULL, 0, 90, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 10, NULL, NULL, 18, NULL, NULL, 0, 80, true),
    -- 4 Wheeler AC
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '4_wheeler_ac'::ride_vehicle_pricing_type, 0,  3, 85, 17, 110, NULL, 0, 100, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '4_wheeler_ac'::ride_vehicle_pricing_type, 3, 10, NULL, 18, NULL, NULL, 0, 90, true),
    ('person_ride'::order_type, 'customer'::delivery_actor_type, '4_wheeler_ac'::ride_vehicle_pricing_type, 10, NULL, NULL, 20, NULL, NULL, 0, 80, true);

  GET DIAGNOSTICS v_ride = ROW_COUNT;

  IF v_food <> 4 THEN
    RAISE WARNING 'Expected 4 food fallback slabs, inserted %', v_food;
  END IF;
  IF v_parcel <> 4 THEN
    RAISE WARNING 'Expected 4 parcel fallback slabs, inserted %', v_parcel;
  END IF;
  IF v_ride <> 12 THEN
    RAISE WARNING 'Expected 12 person_ride fallback slabs, inserted %', v_ride;
  END IF;

  RAISE NOTICE 'SUCCESS: Fallback customer pricing seeded (food=%, parcel=%, ride=%).', v_food, v_parcel, v_ride;
END
$$;
