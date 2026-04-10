-- Engine order uses a single `priority` sort across all rows in billing_pricing_rules (rules + TAX slabs).
-- Normalize any duplicate priorities, then enforce global uniqueness.

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY priority ASC NULLS LAST, id ASC) AS rn
  FROM billing_pricing_rules
)
UPDATE billing_pricing_rules r
SET priority = ordered.rn * 10
FROM ordered
WHERE r.id = ordered.id;

CREATE UNIQUE INDEX IF NOT EXISTS billing_pricing_rules_priority_unique_idx
  ON billing_pricing_rules (priority);
