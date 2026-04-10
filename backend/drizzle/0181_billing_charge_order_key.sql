-- Canonical execution order for billing_pricing_rules (rules + TAX slabs).
-- `priority` remains a human-facing hint but is NOT globally unique (manual edits caused 23505).
-- Reorders assign both columns in one UPDATE; engine sorts by charge_order_key.

ALTER TABLE billing_pricing_rules
  ADD COLUMN IF NOT EXISTS charge_order_key bigint;

UPDATE billing_pricing_rules AS r
SET charge_order_key = s.k
FROM (
  SELECT
    id,
    (ROW_NUMBER() OVER (ORDER BY priority ASC NULLS LAST, id ASC))::bigint * 100000 AS k
  FROM billing_pricing_rules
) AS s
WHERE r.id = s.id
  AND (r.charge_order_key IS NULL OR r.charge_order_key = 0);

ALTER TABLE billing_pricing_rules
  ALTER COLUMN charge_order_key SET DEFAULT 100000;

UPDATE billing_pricing_rules SET charge_order_key = id * 100000 WHERE charge_order_key IS NULL;

ALTER TABLE billing_pricing_rules
  ALTER COLUMN charge_order_key SET NOT NULL;

DROP INDEX IF EXISTS billing_pricing_rules_priority_unique_idx;

CREATE INDEX IF NOT EXISTS billing_pricing_rules_charge_order_key_idx
  ON billing_pricing_rules (charge_order_key);

COMMENT ON COLUMN billing_pricing_rules.charge_order_key IS
  'Global sort key for billing engine and admin combined list; stable batch-updatable (no unique constraint).';
