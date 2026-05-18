-- Seed the 18% subscription GST rule + pricing rule wiring.
-- Idempotent: only inserts when no row with applicable_base='SUBSCRIPTION_FEE'
-- exists for the FOOD service.
--
-- The pair (billing_tax_configs row + billing_pricing_rules row) is required
-- because the pipeline reads pricing rules and resolves TAX-type ones via
-- their tax_config_id reference — mirrors how 0178 wired DELIVERY_FEE,
-- PLATFORM_FEE, PACKAGING_FEE, etc.

DO $$
DECLARE
  next_p int;
  tid bigint;
  rule_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM billing_tax_configs
    WHERE upper(trim(service_type)) = 'FOOD'
      AND applicable_base = 'SUBSCRIPTION_FEE'
  ) INTO rule_exists;

  IF NOT rule_exists THEN
    SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

    INSERT INTO billing_tax_configs (name, rate, applicable_base, service_type, tax_group)
    VALUES ('GST on subscription', 0.18, 'SUBSCRIPTION_FEE', 'FOOD', 'fee')
    RETURNING id INTO tid;

    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, tax_config_id
    ) VALUES (
      'GST on subscription', 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
      NULL, jsonb_build_object('formula_source', 'billing_tax_configs', 'tax_config_id', tid),
      next_p, true, true, 'ORDER'::billing_applies_to, 'GATIMITRA'::billing_offer_owner, false,
      '{}'::jsonb, 'FOOD', tid
    );
  END IF;
END $$;
