-- Idempotent: ensure every billing_tax_configs row has a linked TAX slab in billing_pricing_rules.
-- Run if 0166 was applied before slab backfill could run, or if rows were missing for any reason.

INSERT INTO billing_pricing_rules (
  name, type, calculation_type, value_numeric, value_json,
  priority, is_active, stackable, applies_to, offer_owner, is_hidden,
  metadata, service_type, tax_config_id
)
SELECT
  t.name,
  'TAX'::billing_rule_type,
  'FIXED'::billing_calculation_type,
  NULL,
  jsonb_build_object(
    'formula_source', 'billing_tax_configs',
    'tax_config_id', t.id
  ),
  100 + (ROW_NUMBER() OVER (ORDER BY t.id)) * 10,
  true,
  true,
  'ORDER'::billing_applies_to,
  'GATIMITRA'::billing_offer_owner,
  false,
  t.metadata,
  COALESCE(t.service_type, 'FOOD'),
  t.id
FROM billing_tax_configs t
WHERE NOT EXISTS (
  SELECT 1 FROM billing_pricing_rules r
  WHERE r.tax_config_id = t.id AND r.type = 'TAX'::billing_rule_type
);
