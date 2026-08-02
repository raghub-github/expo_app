-- 0467: Seed RIDE per-component GST configs (runs AFTER 0466 enum adds).
-- All new tax lines are INACTIVE by default except we leave existing RIDE taxes alone.
-- Toll GST seeded at rate 0 + inactive (pass-through; normally not taxable).

DO $$
DECLARE
  next_p int;
  tid bigint;
BEGIN
  SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

  -- GST on waiting (inactive — admin enables when legally required)
  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base::text = 'WAITING_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on waiting (ride)', 0.18, 'WAITING_FEE', 'RIDE', 'waiting')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on waiting (ride)', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, false, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object('source', 'ride_component_tax_seed_v1', 'component', 'WAITING'),
      'RIDE', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base::text = 'NIGHT_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on night charge (ride)', 0.18, 'NIGHT_FEE', 'RIDE', 'night')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on night charge (ride)', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, false, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object('source', 'ride_component_tax_seed_v1', 'component', 'NIGHT'),
      'RIDE', tid
    );
    next_p := next_p + 10;
  END IF;

  -- Toll: rate 0, inactive — pass-through, normally no GST
  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base::text = 'TOLL_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on toll (ride — normally off)', 0, 'TOLL_FEE', 'RIDE', 'toll')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on toll (ride — normally off)', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, false, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, true,
      jsonb_build_object('source', 'ride_component_tax_seed_v1', 'component', 'TOLL', 'default_off', true),
      'RIDE', tid
    );
    next_p := next_p + 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'RIDE' AND applicable_base::text = 'SERVICE_FEE'
  ) THEN
    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on service fee (ride)', 0.18, 'SERVICE_FEE', 'RIDE', 'service')
    RETURNING id INTO tid;
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on service fee (ride)', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, false, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      jsonb_build_object('source', 'ride_component_tax_seed_v1', 'component', 'SERVICE'),
      'RIDE', tid
    );
  END IF;
END $$;
