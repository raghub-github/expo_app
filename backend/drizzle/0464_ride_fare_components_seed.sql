-- Phase 2 — Ride fare COMPONENT catalog.
--
-- Seed disabled configurable rows in billing_pricing_rules for each Phase 2
-- fare component (waiting / night / peak / festival / airport / toll /
-- extra stops) plus the Bike-Lite discount that today ships as a hardcoded
-- constant. Admins can enable / edit / re-price these from the existing
-- billing rules dashboard without a deploy.
--
-- Every row is scoped `service_type = 'RIDE'` and carries a stable
-- `charge_subtype` slug matching backend/src/modules/rides/pricing/
-- rideFareComponents.ts. The settlement mapper (billingToComponents.ts) and
-- the customer quote breakdown key off that slug, so renaming a row does not
-- break settlement.
--
-- Migration is idempotent (checks charge_subtype before insert).

DO $$
DECLARE
  next_p int;
BEGIN
  SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

  -- Bike Lite discount — CONFIG ROW ONLY (is_active=false).
  --
  -- The Bike-Lite catalog code is a special customer product handled at
  -- quote time (`rideQuote.service.ts` subtracts the discount from the
  -- bike fare BEFORE the billing pipeline runs). If this row were active,
  -- the pipeline would apply the discount a SECOND time as a generic
  -- items-total discount, double-billing.
  --
  -- `loadBikeLiteDiscount()` ignores the is_active flag and reads
  -- `value_numeric` directly so admins can retune the amount without
  -- risking the double-application. Keep is_active=false at all times.
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_BIKE_LITE_DISCOUNT'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Bike Lite discount (config only — do not activate)',
      'DISCOUNT'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      12,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, true,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'catalog_code', 'bike-lite',
        'consumer', 'loadBikeLiteDiscount',
        'do_not_activate', true,
        'notes', 'Value_numeric is read by rideQuote.service.ts at quote time. Do NOT set is_active=true or the discount will be applied twice.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_BIKE_LITE_DISCOUNT',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Waiting charge — DISABLED by default. Historic snapshots write
  -- `waiting_charge` directly; enabling this rule lets the pipeline compute
  -- and surface it in real time on quotes.
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_WAITING'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Waiting charge',
      'OTHER'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      0,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'notes', 'Pickup-side waiting; ride app also captures actual minutes.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_WAITING',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Night surcharge (percentage on ride fare).
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_NIGHT'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Night surcharge',
      'OTHER'::billing_rule_type,
      'PERCENTAGE'::billing_calculation_type,
      10,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'default_window', '22:00-06:00',
        'notes', 'Attach a TIME_WINDOW condition when enabling.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_NIGHT',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Peak hour surcharge (percentage on ride fare).
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_PEAK'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Peak hour surcharge',
      'OTHER'::billing_rule_type,
      'PERCENTAGE'::billing_calculation_type,
      15,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'default_windows', jsonb_build_array('08:00-11:00', '17:00-20:30')
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_PEAK',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Festival surcharge (percentage on ride fare).
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_FESTIVAL'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Festival surcharge',
      'OTHER'::billing_rule_type,
      'PERCENTAGE'::billing_calculation_type,
      15,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'notes', 'Enable per event; combine with TIME_WINDOW conditions.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_FESTIVAL',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Airport pickup / drop (flat).
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_AIRPORT'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Airport pickup / drop',
      'OTHER'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      40,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'notes', 'Attach a geo-scoped condition once geo_id conditions land.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_AIRPORT',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Toll charges (flat, driver-declared).
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_TOLL'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Toll charges',
      'OTHER'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      0,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'notes', 'Toll amount usually comes from rider declaration on trip end.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_TOLL',
      NULL
    );
    next_p := next_p + 10;
  END IF;

  -- Extra stops (per additional stop).
  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_EXTRA_STOPS'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Extra stops',
      'OTHER'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      20,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object(
        'source', 'ride_fare_components_seed_v1',
        'notes', 'Flat per-stop; multi-stop capture arrives in Phase 3.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_EXTRA_STOPS',
      NULL
    );
  END IF;
END $$;

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
