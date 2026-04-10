-- One tax config per service line (FOOD, PARCEL, RIDE, ALL, …).
-- Remove duplicate tax rows (keep lowest id per normalized service_type) and enforce uniqueness.

DELETE FROM billing_pricing_rules r
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY upper(trim(service_type)) ORDER BY id ASC) AS rn
    FROM billing_tax_configs
  ) sub
  WHERE sub.rn > 1
) dup
WHERE r.tax_config_id = dup.id;

DELETE FROM billing_tax_configs t
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY upper(trim(service_type)) ORDER BY id ASC) AS rn
    FROM billing_tax_configs
  ) sub
  WHERE sub.rn > 1
) dup
WHERE t.id = dup.id;

CREATE UNIQUE INDEX IF NOT EXISTS billing_tax_configs_one_per_service_idx
  ON billing_tax_configs (upper(trim(service_type)));
