-- FOOD default GST lines (runs in a separate transaction after 0177 so new enum values are committed).
-- Idempotent per applicable_base + service_type.

DO $$
DECLARE
  next_p int;
  tid bigint;
BEGIN
  SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'FOOD' AND applicable_base = 'ITEM_AFTER_DISCOUNT'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on items (food)', 0.05, 'ITEM_AFTER_DISCOUNT', 'FOOD', 'item')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on items (food)', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'FOOD', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'FOOD' AND applicable_base = 'DELIVERY_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on delivery', 0.18, 'DELIVERY_FEE', 'FOOD', 'delivery')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on delivery', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'FOOD', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'FOOD' AND applicable_base = 'PLATFORM_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on platform fee', 0.18, 'PLATFORM_FEE', 'FOOD', 'platform')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on platform fee', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'FOOD', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'FOOD' AND applicable_base = 'PACKAGING_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on packaging', 0.18, 'PACKAGING_FEE', 'FOOD', 'packaging')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on packaging', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'FOOD', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'FOOD' AND applicable_base = 'SURGE_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on surge', 0.18, 'SURGE_FEE', 'FOOD', 'surge')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on surge', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'FOOD', tid
    );
  END IF;
END $$;

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
