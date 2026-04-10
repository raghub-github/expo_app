-- Default FOOD row so Super Admin sees "Rider tip" in charge order (idempotent).

DO $$
DECLARE
  next_p int;
BEGIN
  SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE type::text = 'RIDER_TIP' AND upper(trim(service_type)) = 'FOOD'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'Rider tip (customer-entered)',
      'RIDER_TIP'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      0,
      '{}'::jsonb,
      next_p, true, false, 'ORDER'::billing_applies_to, 'OTHER'::billing_offer_owner, false,
      jsonb_build_object('source', 'checkout_tipAmount', 'taxable', false),
      'FOOD',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      NULL,
      NULL
    );
  END IF;
END $$;

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
