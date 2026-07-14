-- Default RIDE billing: platform fee, booking fee, and GST lines.
-- Idempotent per rule name + service_type = RIDE.

DO $$
DECLARE
  next_p int;
  tid bigint;
BEGIN
  SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND type::text = 'PLATFORM_FEE'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Ride platform fee',
      'PLATFORM_FEE'::billing_rule_type,
      'PERCENTAGE'::billing_calculation_type,
      5,
      '{}'::jsonb,
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object('source', 'ride_booking_seed_v1'),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      NULL,
      NULL
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND type::text = 'CONVENIENCE_FEE'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Ride booking fee',
      'CONVENIENCE_FEE'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      5,
      '{}'::jsonb,
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object('source', 'ride_booking_seed_v1'),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      NULL,
      NULL
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base = 'ITEM_AFTER_DISCOUNT'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on ride fare', 0.05, 'ITEM_AFTER_DISCOUNT', 'RIDE', 'item')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on ride fare', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'RIDE', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base = 'PLATFORM_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on ride platform fee', 0.18, 'PLATFORM_FEE', 'RIDE', 'platform')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on ride platform fee', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'RIDE', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base = 'CONVENIENCE_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on ride booking fee', 0.18, 'CONVENIENCE_FEE', 'RIDE', 'fee')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on ride booking fee', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'RIDE', tid
    );
  END IF;
END $$;

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
