-- Geo-scoped rider PRE-PICKUP (first-mile) compensation override.
--
-- Background: pre-pickup allowance (rider GPS -> store pickup) is paid to the accepting
-- rider as a ₹/km first-mile incentive and NEVER changes the customer's price. Until now
-- the rate + funding lived ONLY in platform_rider_dispatch_strategy_config (global, one row
-- per service). This table makes that rate + funding overridable per geo node
-- (state/region/district/division/post_office/pincode), resolved CLOSEST-ANCESTOR-WINS via
-- geo_pricing_chain_steps — exactly like delivery_rate_slabs_effective / service_payout_rules.
--
-- When no active override exists on a location's chain, the engine falls back to the global
-- platform_rider_dispatch_strategy_config row (behavior-preserving).

CREATE TABLE IF NOT EXISTS geo_pre_pickup_compensation (
  id                  bigserial PRIMARY KEY,
  geo_level           geo_pricing_level NOT NULL,
  geo_ref_id          uuid NOT NULL,
  service_type        order_type NOT NULL,
  rate_per_km         numeric(12, 4) NOT NULL DEFAULT 0,
  -- who bears the first-mile amount: 'company' (default & most common), 'customer', 'shared'
  funding             text NOT NULL DEFAULT 'company',
  -- when funding='shared', the customer share of the amount (company bears the remainder)
  customer_share_pct  numeric(5, 2) NOT NULL DEFAULT 0,
  min_amount          numeric(12, 2) NULL,
  max_amount          numeric(12, 2) NULL,
  priority            integer NOT NULL DEFAULT 100,
  is_active           boolean NOT NULL DEFAULT true,
  effective_from      timestamptz NULL,
  effective_to        timestamptz NULL,
  created_by          text NULL,
  updated_by          text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_pre_pickup_comp_rate_nonneg    CHECK (rate_per_km >= 0),
  CONSTRAINT geo_pre_pickup_comp_funding_chk    CHECK (funding IN ('company', 'customer', 'shared')),
  CONSTRAINT geo_pre_pickup_comp_share_range    CHECK (customer_share_pct >= 0 AND customer_share_pct <= 100),
  CONSTRAINT geo_pre_pickup_comp_minmax_chk     CHECK (max_amount IS NULL OR min_amount IS NULL OR max_amount >= min_amount),
  CONSTRAINT geo_pre_pickup_comp_min_nonneg     CHECK (min_amount IS NULL OR min_amount >= 0),
  CONSTRAINT geo_pre_pickup_comp_max_nonneg     CHECK (max_amount IS NULL OR max_amount >= 0),
  CONSTRAINT geo_pre_pickup_comp_effrange_chk   CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  -- one active override per (node, service); admins edit in place
  CONSTRAINT geo_pre_pickup_comp_uniq           UNIQUE (geo_level, geo_ref_id, service_type)
);

CREATE INDEX IF NOT EXISTS geo_pre_pickup_comp_geo_idx
  ON geo_pre_pickup_compensation (geo_level, geo_ref_id, service_type, is_active);

CREATE INDEX IF NOT EXISTS geo_pre_pickup_comp_service_idx
  ON geo_pre_pickup_compensation (service_type, is_active);

-- Effective override for a location: the CLOSEST ancestor (including self) on the geo chain
-- that has an active, in-window override row for this service. Returns 0 or 1 row.
CREATE OR REPLACE FUNCTION geo_pre_pickup_comp_effective(
  p_level   geo_pricing_level,
  p_id      uuid,
  p_service order_type
) RETURNS SETOF geo_pre_pickup_compensation
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
      FROM geo_pre_pickup_compensation c
      WHERE c.geo_level = rec.step_level
        AND c.geo_ref_id = rec.step_id
        AND c.service_type = p_service
        AND c.is_active = true
        AND (c.effective_from IS NULL OR c.effective_from <= now())
        AND (c.effective_to   IS NULL OR c.effective_to   >  now())
      ORDER BY c.priority DESC, c.id ASC
      LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON TABLE geo_pre_pickup_compensation IS
  'Geo-scoped override for rider pre-pickup (first-mile) ₹/km rate + funding. Closest-ancestor-wins; falls back to platform_rider_dispatch_strategy_config when absent.';
