-- Tax slab row lives in billing_pricing_rules (priority / active / hidden).
-- billing_tax_configs holds the formula: rate + applicable_base (+ metadata).
-- Idempotent where possible.

ALTER TABLE billing_pricing_rules
  ADD COLUMN IF NOT EXISTS tax_config_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS billing_pricing_rules_tax_config_id_unique_idx
  ON billing_pricing_rules (tax_config_id)
  WHERE tax_config_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_pricing_rules_tax_config_id_fkey'
  ) THEN
    ALTER TABLE billing_pricing_rules
      ADD CONSTRAINT billing_pricing_rules_tax_config_id_fkey
      FOREIGN KEY (tax_config_id)
      REFERENCES billing_tax_configs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill TAX pricing rows from legacy billing_tax_configs columns (if still present)
DO $$
DECLARE
  has_priority boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_tax_configs' AND column_name = 'priority'
  ) INTO has_priority;

  IF has_priority THEN
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
      COALESCE(t.priority, 0),
      COALESCE(t.is_active, true),
      true,
      'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner,
      COALESCE(t.is_hidden, false),
      t.metadata,
      COALESCE(t.service_type, 'FOOD'),
      t.id
    FROM billing_tax_configs t
    WHERE NOT EXISTS (
      SELECT 1 FROM billing_pricing_rules r
      WHERE r.tax_config_id = t.id AND r.type = 'TAX'::billing_rule_type
    );
  END IF;
END $$;

DROP INDEX IF EXISTS billing_tax_configs_active_priority_idx;

ALTER TABLE billing_tax_configs
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS is_hidden;
