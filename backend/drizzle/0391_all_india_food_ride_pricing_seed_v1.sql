-- =============================================================================
-- GatiMitra All-India Pricing Engine — Default State/UT Seed (Production v1)
-- =============================================================================
-- PRD: State-wise pricing engine — Food Delivery + Person Ride
--
-- Geo level seeded : state (28 States + 8 Union Territories = 36 nodes)
-- Delhi baseline   : Delhi_Pricing_Seed_v1.md (Launch v1)
--
-- Dashboard tables (Super Admin → Geo & Coverage → Slabs):
--   FOOD customer         → delivery_rate_slabs (service_type=food, actor_type=customer)
--   FOOD rider pickup     → food_rider_pickup_slabs
--   FOOD rider drop       → food_rider_drop_slabs
--   RIDE customer         → ride_customer_pricing (per vehicle_type)
--   RIDE rider pickup     → ride_rider_pickup_slabs (per vehicle_type)
--   RIDE rider drop       → ride_rider_drop_slabs (per vehicle_type)
--   RIDE max trip distance→ ride_vehicle_limits (per state_id + vehicle_type)
--
-- PRD field mapping:
--   Base Fare / Included Distance / Per KM / Min Charge → slab rows (base on min_km=0, included=max_km of slab 1)
--   Min Rider Guarantee → min_charge on pickup slab rows
--   Waiting Charge / Starts After → waiting_charge_per_min, waiting_start_after
--   Max trip distance (ride) → ride_vehicle_limits.max_distance_km (4W AC = no row = unlimited)
--
-- Pricing philosophy:
--   • Customer: competitive, ±5% market band via tier deltas vs Delhi
--   • Rider: ~75% of average customer fare (tuned via Delhi baseline + rider_boost delta)
--   • Tier 1 metros: +₹1.25 – +₹2.00 customer delta
--   • Tier 2: −₹1.00 | Tier 3: −₹2.00
--
-- Idempotent: deletes prior state-level rows then re-inserts. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r record;
  v_cust_delta numeric;   -- customer pricing adjustment vs Delhi
  v_rider_delta numeric; -- customer delta + rider_boost (~75% rider payout vs customer fare)
  v_seeded int := 0;
  v_limit_states int := 0;
  v_missing_limits text;
  -- food
  fc_base numeric; fc_min numeric; fc_k1 numeric; fc_k2 numeric; fc_k3 numeric; fc_k4 numeric;
  fp_base numeric; fp_min numeric; fp_k1 numeric; fp_k2 numeric; fp_k3 numeric;
  fd_k1 numeric; fd_k2 numeric; fd_k3 numeric;
  -- ride customer
  rc2_base numeric; rc2_min numeric; rc2_k1 numeric; rc2_k2 numeric; rc2_k3 numeric;
  rc3_base numeric; rc3_min numeric; rc3_k1 numeric; rc3_k2 numeric; rc3_k3 numeric;
  rc4n_base numeric; rc4n_min numeric; rc4n_k1 numeric; rc4n_k2 numeric; rc4n_k3 numeric;
  rc4a_base numeric; rc4a_min numeric; rc4a_k1 numeric; rc4a_k2 numeric; rc4a_k3 numeric;
  -- ride rider
  rp2_base numeric; rp2_pk numeric; rp2_guar numeric;
  rp3_base numeric; rp3_pk numeric; rp3_guar numeric;
  rp4n_base numeric; rp4n_pk numeric; rp4n_guar numeric;
  rp4a_base numeric; rp4a_pk numeric; rp4a_guar numeric;
  rd2 numeric; rd3 numeric; rd4n numeric; rd4a numeric;
BEGIN
  -- ─── Pricing profile: 28 States + 8 UTs ───────────────────────────────────
  -- Columns: state_key | tier | is_ut | customer_delta | rider_boost

  CREATE TEMP TABLE _gm_state_pricing_profile (
    state_key text PRIMARY KEY,
    tier smallint NOT NULL,
    is_ut boolean NOT NULL DEFAULT false,
    customer_delta numeric(12, 2) NOT NULL,
    rider_boost numeric(12, 2) NOT NULL DEFAULT 0.75
  ) ON COMMIT DROP;

  TRUNCATE _gm_state_pricing_profile;

  INSERT INTO _gm_state_pricing_profile (state_key, tier, is_ut, customer_delta, rider_boost) VALUES
    -- Tier 1 — Metro / high cost (+₹1.25 – ₹2.00 customer)
    ('MAHARASHTRA', 1, false, 2.00, 1.25),
    ('KARNATAKA', 1, false, 2.00, 1.25),
    ('TAMIL NADU', 1, false, 2.00, 1.25),
    ('TELANGANA', 1, false, 2.00, 1.25),
    ('WEST BENGAL', 1, false, 2.00, 1.25),
    ('GUJARAT', 1, false, 1.50, 1.00),
    ('HARYANA', 1, false, 1.25, 1.00),
    ('PUNJAB', 1, false, 1.25, 1.00),
    ('DELHI', 1, true, 0.00, 0.75),
    ('CHANDIGARH', 1, true, 1.25, 1.00),
    -- Tier 2 — Secondary markets (−₹1.00)
    ('UTTAR PRADESH', 2, false, -1.00, 0.75),
    ('RAJASTHAN', 2, false, -1.00, 0.75),
    ('KERALA', 2, false, -1.00, 0.75),
    ('ANDHRA PRADESH', 2, false, -1.00, 0.75),
    ('MADHYA PRADESH', 2, false, -1.00, 0.75),
    ('ODISHA', 2, false, -1.00, 0.75),
    ('UTTARAKHAND', 2, false, -1.00, 0.75),
    ('GOA', 2, false, -1.00, 0.75),
    ('PUDUCHERRY', 2, true, -1.00, 0.75),
    -- Tier 3 — Lower cost / NE / hills / islands (−₹2.00)
    ('BIHAR', 3, false, -2.00, 0.50),
    ('JHARKHAND', 3, false, -2.00, 0.50),
    ('ASSAM', 3, false, -2.00, 0.50),
    ('CHHATTISGARH', 3, false, -2.00, 0.50),
    ('HIMACHAL PRADESH', 3, false, -2.00, 0.50),
    ('JAMMU AND KASHMIR', 3, true, -2.00, 0.50),
    ('LADAKH', 3, true, -2.00, 0.50),
    ('ANDAMAN AND NICOBAR ISLANDS', 3, true, -2.00, 0.50),
    ('LAKSHADWEEP', 3, true, -2.00, 0.50),
    ('THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 3, true, -2.00, 0.50),
    ('SIKKIM', 3, false, -2.00, 0.50),
    ('MANIPUR', 3, false, -2.00, 0.50),
    ('MEGHALAYA', 3, false, -2.00, 0.50),
    ('MIZORAM', 3, false, -2.00, 0.50),
    ('NAGALAND', 3, false, -2.00, 0.50),
    ('TRIPURA', 3, false, -2.00, 0.50),
    ('ARUNACHAL PRADESH', 3, false, -2.00, 0.50);

  -- Warn if profile rows ≠ 36
  IF (SELECT count(*) FROM _gm_state_pricing_profile) <> 36 THEN
    RAISE WARNING 'Pricing profile expects 36 states/UTs, found % rows', (SELECT count(*) FROM _gm_state_pricing_profile);
  END IF;

  -- Missing DB states (pricing profile)
  SELECT string_agg(p.state_key, ', ' ORDER BY p.state_key)
  INTO v_missing_limits
  FROM _gm_state_pricing_profile p
  LEFT JOIN states s ON upper(trim(s.name)) = p.state_key
  WHERE s.id IS NULL;

  IF v_missing_limits IS NOT NULL THEN
    RAISE WARNING 'States/UTs in profile but missing in states table: %', v_missing_limits;
  END IF;

  FOR r IN
    SELECT s.id, s.name, p.tier, p.is_ut, p.customer_delta, p.rider_boost
    FROM states s
    INNER JOIN _gm_state_pricing_profile p ON upper(trim(s.name)) = p.state_key
    ORDER BY p.tier, s.name
  LOOP
    v_cust_delta  := r.customer_delta;
    v_rider_delta := r.customer_delta + r.rider_boost;

    -- ═══ DELHI BASELINE REFERENCE (customer_delta = 0) ═══════════════════════
    -- FOOD customer : 0-3 base 25 / ₹7/km / min 39 | 3-6 ₹8 | 6-10 ₹10 | 10+ ₹12
    -- FOOD rider pk : 0-3 base 12 / ₹3/km / min 14 | 3-6 ₹4 | 6+ ₹4 | wait ₹1.5/min after 5 min
    -- FOOD rider dr : 0-3 ₹4 | 3-6 ₹4 | 6+ ₹6
    -- RIDE cust 2W  : 0-3 25/8/39 | 3-8 9 | 8+ 10
    -- RIDE cust 3W  : 0-3 40/12/55 | 3-8 13 | 8+ 14
    -- RIDE cust 4N  : 0-3 70/15/90 | 3-10 16 | 10+ 18
    -- RIDE cust 4A  : 0-3 85/17/110 | 3-10 18 | 10+ 20
    -- RIDE rider pk : 2W 10/2 | 3W 22/3 | 4N 24/5 | 4A 26/6 | wait 1.5/2 min, free 5 min
    -- RIDE rider dr : 2W ₹4 | 3W ₹6 | 4N ₹9 | 4A ₹11

    -- ── Food customer (cust delta) ──
    fc_base := GREATEST(ROUND(25 + v_cust_delta), 10);
    fc_min  := GREATEST(ROUND(39 + v_cust_delta), 20);
    fc_k1   := GREATEST(ROUND((7  + v_cust_delta)::numeric, 1), 3);
    fc_k2   := GREATEST(ROUND((8  + v_cust_delta)::numeric, 1), 3);
    fc_k3   := GREATEST(ROUND((10 + v_cust_delta)::numeric, 1), 3);
    fc_k4   := GREATEST(ROUND((12 + v_cust_delta)::numeric, 1), 3);

    -- ── Food rider (rider delta — ~75% payout band) ──
    fp_base := GREATEST(ROUND(12 + v_rider_delta), 8);
    fp_min  := GREATEST(ROUND(14 + v_rider_delta), 12);
    fp_k1   := GREATEST(ROUND((3.0 + v_rider_delta)::numeric, 1), 2.5);
    fp_k2   := GREATEST(ROUND((4.0 + v_rider_delta)::numeric, 1), 2.5);
    fp_k3   := GREATEST(ROUND((4.0 + v_rider_delta)::numeric, 1), 2.5);
    fd_k1   := GREATEST(ROUND((4.0 + v_rider_delta)::numeric, 1), 2.5);
    fd_k2   := GREATEST(ROUND((4.0 + v_rider_delta)::numeric, 1), 2.5);
    fd_k3   := GREATEST(ROUND((6.0 + v_rider_delta)::numeric, 1), 2.5);

    -- ── Ride customer (cust delta) ──
    rc2_base := GREATEST(ROUND(25 + v_cust_delta), 10);
    rc2_min  := GREATEST(ROUND(39 + v_cust_delta), 20);
    rc2_k1   := GREATEST(ROUND((8  + v_cust_delta)::numeric, 1), 3);
    rc2_k2   := GREATEST(ROUND((9  + v_cust_delta)::numeric, 1), 3);
    rc2_k3   := GREATEST(ROUND((10 + v_cust_delta)::numeric, 1), 3);

    rc3_base := GREATEST(ROUND(40 + v_cust_delta), 15);
    rc3_min  := GREATEST(ROUND(55 + v_cust_delta), 25);
    rc3_k1   := GREATEST(ROUND((12 + v_cust_delta)::numeric, 1), 4);
    rc3_k2   := GREATEST(ROUND((13 + v_cust_delta)::numeric, 1), 4);
    rc3_k3   := GREATEST(ROUND((14 + v_cust_delta)::numeric, 1), 4);

    rc4n_base := GREATEST(ROUND(70 + v_cust_delta), 25);
    rc4n_min  := GREATEST(ROUND(90 + v_cust_delta), 40);
    rc4n_k1   := GREATEST(ROUND((15 + v_cust_delta)::numeric, 1), 5);
    rc4n_k2   := GREATEST(ROUND((16 + v_cust_delta)::numeric, 1), 5);
    rc4n_k3   := GREATEST(ROUND((18 + v_cust_delta)::numeric, 1), 5);

    rc4a_base := GREATEST(ROUND(85 + v_cust_delta), 30);
    rc4a_min  := GREATEST(ROUND(110 + v_cust_delta), 50);
    rc4a_k1   := GREATEST(ROUND((17 + v_cust_delta)::numeric, 1), 6);
    rc4a_k2   := GREATEST(ROUND((18 + v_cust_delta)::numeric, 1), 6);
    rc4a_k3   := GREATEST(ROUND((20 + v_cust_delta)::numeric, 1), 6);

    -- ── Ride rider (rider delta + min guarantee on pickup) ──
    rp2_base  := GREATEST(ROUND(10 + v_rider_delta), 8);
    rp2_pk    := GREATEST(ROUND((2.0 + v_rider_delta)::numeric, 1), 2.5);
    rp2_guar  := GREATEST(ROUND(rp2_base + 2), 12);

    rp3_base  := GREATEST(ROUND(22 + v_rider_delta), 10);
    rp3_pk    := GREATEST(ROUND((3.0 + v_rider_delta)::numeric, 1), 3);
    rp3_guar  := GREATEST(ROUND(rp3_base + 3), 18);

    rp4n_base := GREATEST(ROUND(24 + v_rider_delta), 12);
    rp4n_pk   := GREATEST(ROUND((5.0 + v_rider_delta)::numeric, 1), 3);
    rp4n_guar := GREATEST(ROUND(rp4n_base + 4), 25);

    rp4a_base := GREATEST(ROUND(26 + v_rider_delta), 15);
    rp4a_pk   := GREATEST(ROUND((6.0 + v_rider_delta)::numeric, 1), 3.5);
    rp4a_guar := GREATEST(ROUND(rp4a_base + 5), 30);

    rd2  := GREATEST(ROUND((4.0  + v_rider_delta)::numeric, 1), 3);
    rd3  := GREATEST(ROUND((6.0  + v_rider_delta)::numeric, 1), 4);
    rd4n := GREATEST(ROUND((9.0  + v_rider_delta)::numeric, 1), 5);
    rd4a := GREATEST(ROUND((11.0 + v_rider_delta)::numeric, 1), 5);

    -- ─── Purge existing state-level pricing (idempotent) ─────────────────────

    DELETE FROM delivery_rate_slabs
    WHERE geo_level = 'state'::geo_pricing_level
      AND geo_ref_id = r.id
      AND service_type = 'food'::order_type
      AND actor_type = 'customer'::delivery_actor_type;

    DELETE FROM food_rider_pickup_slabs
    WHERE geo_level = 'state'::geo_pricing_level AND geo_ref_id = r.id;

    DELETE FROM food_rider_drop_slabs
    WHERE geo_level = 'state'::geo_pricing_level AND geo_ref_id = r.id;

    DELETE FROM ride_customer_pricing
    WHERE geo_level = 'state'::geo_pricing_level AND geo_ref_id = r.id;

    DELETE FROM ride_rider_pickup_slabs
    WHERE geo_level = 'state'::geo_pricing_level AND geo_ref_id = r.id;

    DELETE FROM ride_rider_drop_slabs
    WHERE geo_level = 'state'::geo_pricing_level AND geo_ref_id = r.id;

    -- ─── FOOD → CUSTOMER (4 progressive slabs, priority 100→70) ───────────────

    INSERT INTO delivery_rate_slabs (
      geo_level, geo_ref_id, service_type, actor_type,
      min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 0,  3, fc_base, fc_k1, fc_min, 100, true),
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 3,  6, NULL, fc_k2, NULL, 90, true),
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 6, 10, NULL, fc_k3, NULL, 80, true),
      ('state'::geo_pricing_level, r.id, 'food'::order_type, 'customer'::delivery_actor_type, 10, NULL, NULL, fc_k4, NULL, 70, true);

    -- ─── FOOD → RIDER PICKUP (min_charge = minimum rider guarantee) ───────────

    INSERT INTO food_rider_pickup_slabs (
      geo_level, geo_ref_id, min_km, max_km, base_fare, pickup_per_km, min_charge,
      waiting_charge_per_min, waiting_start_after, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, 0, 3, fp_base, fp_k1, fp_min, 1.5, 5, 100, true),
      ('state'::geo_pricing_level, r.id, 3, 6, NULL, fp_k2, NULL, 1.5, 5, 90, true),
      ('state'::geo_pricing_level, r.id, 6, NULL, NULL, fp_k3, NULL, 1.5, 5, 80, true);

    -- ─── FOOD → RIDER DROP ───────────────────────────────────────────────────

    INSERT INTO food_rider_drop_slabs (
      geo_level, geo_ref_id, min_km, max_km, drop_per_km, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, 0, 3, fd_k1, 100, true),
      ('state'::geo_pricing_level, r.id, 3, 6, fd_k2, 90, true),
      ('state'::geo_pricing_level, r.id, 6, NULL, fd_k3, 80, true);

    -- ─── PERSON RIDE → CUSTOMER (4 vehicle types × 3 slabs) ─────────────────

    INSERT INTO ride_customer_pricing (
      geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 0, 3, rc2_base, rc2_k1, rc2_min, 100, true),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 3, 8, NULL, rc2_k2, NULL, 90, true),
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 8, NULL, NULL, rc2_k3, NULL, 80, true),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 0, 3, rc3_base, rc3_k1, rc3_min, 100, true),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 3, 8, NULL, rc3_k2, NULL, 90, true),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 8, NULL, NULL, rc3_k3, NULL, 80, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 0,  3, rc4n_base, rc4n_k1, rc4n_min, 100, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 3, 10, NULL, rc4n_k2, NULL, 90, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 10, NULL, NULL, rc4n_k3, NULL, 80, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 0,  3, rc4a_base, rc4a_k1, rc4a_min, 100, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 3, 10, NULL, rc4a_k2, NULL, 90, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 10, NULL, NULL, rc4a_k3, NULL, 80, true);

    -- ─── PERSON RIDE → RIDER PICKUP (min_charge = minimum rider guarantee) ───

    INSERT INTO ride_rider_pickup_slabs (
      geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, pickup_per_km, min_charge,
      waiting_charge_per_min, waiting_start_after, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 0, NULL, rp2_base, rp2_pk, rp2_guar, 1.5, 5, 100, true),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 0, NULL, rp3_base, rp3_pk, rp3_guar, 2.0, 5, 100, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 0, NULL, rp4n_base, rp4n_pk, rp4n_guar, 2.0, 5, 100, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 0, NULL, rp4a_base, rp4a_pk, rp4a_guar, 2.0, 5, 100, true);

    -- ─── PERSON RIDE → RIDER DROP ────────────────────────────────────────────

    INSERT INTO ride_rider_drop_slabs (
      geo_level, geo_ref_id, vehicle_type, min_km, max_km, drop_per_km, priority, is_active
    ) VALUES
      ('state'::geo_pricing_level, r.id, '2_wheeler'::ride_vehicle_pricing_type, 0, NULL, rd2, 100, true),
      ('state'::geo_pricing_level, r.id, '3_wheeler'::ride_vehicle_pricing_type, 0, NULL, rd3, 100, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 0, NULL, rd4n, 100, true),
      ('state'::geo_pricing_level, r.id, '4_wheeler_ac'::ride_vehicle_pricing_type, 0, NULL, rd4a, 100, true);

    v_seeded := v_seeded + 1;
    RAISE NOTICE '[tier %] Seeded % (cust Δ%+ rider Δ%+)', r.tier, r.name, v_cust_delta, v_rider_delta;
  END LOOP;

  -- ═══ RIDE VEHICLE MAX DISTANCE — dedicated pass (all 36 states/UTs) ═══════════
  -- Dashboard: Super Admin → Geo → RIDE → Rider tab → Max distance km
  --   2 Wheeler        → 25 km
  --   3 Wheeler        → 35 km
  --   4 Wheeler Non AC → 60 km
  --   4 Wheeler AC     → unlimited (no row = All India)

  FOR r IN
    SELECT s.id, s.name
    FROM states s
    INNER JOIN _gm_state_pricing_profile p ON upper(trim(s.name)) = p.state_key
    ORDER BY s.name
  LOOP
    DELETE FROM ride_vehicle_limits WHERE state_id = r.id;

    INSERT INTO ride_vehicle_limits (state_id, vehicle_type, max_distance_km, is_enabled)
    VALUES
      (r.id, '2_wheeler'::ride_vehicle_pricing_type, 25.00, true),
      (r.id, '3_wheeler'::ride_vehicle_pricing_type, 35.00, true),
      (r.id, '4_wheeler_non_ac'::ride_vehicle_pricing_type, 60.00, true);

  END LOOP;

  SELECT count(DISTINCT state_id)::int
  INTO v_limit_states
  FROM ride_vehicle_limits
  WHERE vehicle_type = '2_wheeler'::ride_vehicle_pricing_type
    AND is_enabled = true
    AND max_distance_km = 25.00;

  IF v_limit_states <> 36 THEN
    RAISE WARNING 'ride_vehicle_limits: expected 36 states with 2W=25km, found %', v_limit_states;
  ELSE
    RAISE NOTICE 'ride_vehicle_limits: all 36 states/UTs set (2W=25, 3W=35, 4W non-AC=60, 4W AC=unlimited).';
  END IF;

  IF (SELECT count(*) FROM ride_vehicle_limits WHERE vehicle_type = '4_wheeler_ac'::ride_vehicle_pricing_type) > 0 THEN
    DELETE FROM ride_vehicle_limits WHERE vehicle_type = '4_wheeler_ac'::ride_vehicle_pricing_type;
    RAISE NOTICE 'Removed 4_wheeler_ac caps — AC rides unlimited nationwide.';
  END IF;

  IF v_seeded <> 36 THEN
    RAISE WARNING 'Expected 36 states/UTs seeded, got %', v_seeded;
  ELSE
    RAISE NOTICE 'SUCCESS: GatiMitra pricing engine seeded for all 36 States + UTs.';
  END IF;
END
$$;
