-- Geo Delivery Pricing v3.2 — INDEPENDENT rider pre-pickup & post-pickup leg pricing.
--
-- WHY: today the rider's post-pickup (pickup->drop) leg has NO independent price — it is
-- only the remainder of the "rider % of customer fare" pool, split by distance ratio.
-- Pre-pickup (rider->pickup) had a single flat ₹/km per geo (geo_pre_pickup_compensation),
-- with no vehicle or distance-slab dimension. This migration makes BOTH legs first-class,
-- independently-priced rules:
--
--   PRE-PICKUP  = rider  -> pickup   (own rate/slab/vehicle/geo/min/max/funding)
--   POST-PICKUP = pickup -> drop     (own rate/slab/vehicle/geo/min/max/funding)
--
-- They resolve separately (never share a rate) and are then reconciled against the rider
-- % pool by the backend engine (raw entitlement -> allocated -> company top-up), so the
-- rider total stays within 100% of the eligible delivery fee unless the company funds more.
--
-- Mirrors the established geo pattern: closest-ancestor-wins over geo_pricing_chain_steps,
-- exactly like delivery_rate_slabs_effective / service_payout_rules / geo_pre_pickup_comp.
-- NON-DESTRUCTIVE: adds a new table only; existing pre-pickup config keeps working as the
-- fallback until leg rules are configured.

CREATE TABLE IF NOT EXISTS rider_leg_pricing (
  id                  bigserial PRIMARY KEY,
  -- which leg this rule prices. 'pre' = rider->pickup, 'post' = pickup->drop.
  leg                 text NOT NULL,
  geo_level           geo_pricing_level NOT NULL,
  geo_ref_id          uuid NOT NULL,
  service_type        order_type NOT NULL,                 -- food | parcel | person_ride
  -- vehicle dimension: NULL = applies to all vehicles (typical for food); a specific
  -- vehicle for person_ride / parcel so bike vs auto vs car price differently.
  vehicle_type        ride_vehicle_pricing_type NULL,
  -- parcel weight slab (kg). NULL bounds = "any weight" (food / person_ride always NULL).
  weight_min_kg       numeric(10, 2) NULL,
  weight_max_kg       numeric(10, 2) NULL,
  -- distance slab for THIS leg (km). max_km NULL = unbounded (the last/open slab).
  min_km              numeric(10, 2) NOT NULL DEFAULT 0,
  max_km              numeric(10, 2) NULL,
  -- price = base_amount (first slab only) + rate_per_km × leg_km, then clamped to [min,max].
  base_amount         numeric(12, 2) NULL,
  rate_per_km         numeric(12, 4) NOT NULL DEFAULT 0,
  min_amount          numeric(12, 2) NULL,
  max_amount          numeric(12, 2) NULL,
  -- who funds this leg: 'company' (on top of the pool), 'customer' (within the pool),
  -- 'shared' (customer_share_pct% within the pool, company bears the remainder on top).
  funding             text NOT NULL DEFAULT 'company',
  customer_share_pct  numeric(5, 2) NOT NULL DEFAULT 0,
  priority            integer NOT NULL DEFAULT 100,
  is_active           boolean NOT NULL DEFAULT true,
  effective_from      timestamptz NULL,
  effective_to        timestamptz NULL,
  created_by          text NULL,
  updated_by          text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rider_leg_pricing_leg_chk        CHECK (leg IN ('pre', 'post')),
  CONSTRAINT rider_leg_pricing_rate_nonneg    CHECK (rate_per_km >= 0),
  CONSTRAINT rider_leg_pricing_base_nonneg    CHECK (base_amount IS NULL OR base_amount >= 0),
  CONSTRAINT rider_leg_pricing_funding_chk    CHECK (funding IN ('company', 'customer', 'shared')),
  CONSTRAINT rider_leg_pricing_share_range    CHECK (customer_share_pct >= 0 AND customer_share_pct <= 100),
  CONSTRAINT rider_leg_pricing_km_nonneg      CHECK (min_km >= 0),
  CONSTRAINT rider_leg_pricing_km_valid       CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT rider_leg_pricing_weight_valid   CHECK (weight_max_kg IS NULL OR weight_min_kg IS NULL OR weight_max_kg > weight_min_kg),
  CONSTRAINT rider_leg_pricing_weight_nonneg  CHECK (weight_min_kg IS NULL OR weight_min_kg >= 0),
  CONSTRAINT rider_leg_pricing_minmax_chk     CHECK (max_amount IS NULL OR min_amount IS NULL OR max_amount >= min_amount),
  CONSTRAINT rider_leg_pricing_min_nonneg     CHECK (min_amount IS NULL OR min_amount >= 0),
  CONSTRAINT rider_leg_pricing_max_nonneg     CHECK (max_amount IS NULL OR max_amount >= 0),
  CONSTRAINT rider_leg_pricing_effrange_chk   CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  -- base_amount is a per-leg flat and belongs only on the first (0 km) slab.
  CONSTRAINT rider_leg_pricing_base_first_only CHECK (base_amount IS NULL OR min_km = 0)
);

CREATE INDEX IF NOT EXISTS rider_leg_pricing_lookup_idx
  ON rider_leg_pricing (leg, geo_level, geo_ref_id, service_type, is_active);

CREATE INDEX IF NOT EXISTS rider_leg_pricing_resolve_idx
  ON rider_leg_pricing (leg, service_type, geo_level, geo_ref_id, priority DESC, min_km ASC);

-- Effective leg rule for a location: the CLOSEST ancestor (incl. self) on the geo chain
-- that has an active, in-window rule matching leg + service + vehicle (exact or all) +
-- weight slab (parcel) + distance slab. Vehicle-specific beats all-vehicle; then priority;
-- then id. Returns 0 or 1 row — the single authoritative leg rule.
CREATE OR REPLACE FUNCTION rider_leg_pricing_effective(
  p_leg       text,
  p_level     geo_pricing_level,
  p_id        uuid,
  p_service   order_type,
  p_vehicle   ride_vehicle_pricing_type,
  p_weight_kg numeric,
  p_km        numeric
) RETURNS SETOF rider_leg_pricing
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM geo_pricing_chain_steps(p_level, p_id) ORDER BY step_ord ASC
  LOOP
    RETURN QUERY
      SELECT *
      FROM rider_leg_pricing c
      WHERE c.leg = p_leg
        AND c.geo_level = rec.step_level
        AND c.geo_ref_id = rec.step_id
        AND c.service_type = p_service
        AND c.is_active = true
        AND (c.vehicle_type IS NULL OR c.vehicle_type = p_vehicle)
        AND (c.weight_min_kg IS NULL OR p_weight_kg IS NULL OR p_weight_kg >= c.weight_min_kg)
        AND (c.weight_max_kg IS NULL OR p_weight_kg IS NULL OR p_weight_kg <  c.weight_max_kg)
        AND c.min_km <= p_km
        AND (c.max_km IS NULL OR p_km < c.max_km)
        AND (c.effective_from IS NULL OR c.effective_from <= now())
        AND (c.effective_to   IS NULL OR c.effective_to   >  now())
      ORDER BY (c.vehicle_type IS NOT NULL) DESC, c.priority DESC, c.id ASC
      LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON TABLE rider_leg_pricing IS
  'Independent rider leg pricing: pre-pickup (rider->pickup) and post-pickup (pickup->drop), each with own rate/slab/vehicle/weight/geo/min/max/funding. Closest-ancestor-wins. Reconciled against the rider % pool by the backend engine.';
