-- Parcel GST bases were incorrectly saved as DELIVERY_FEE in some environments.
-- Parcel puts the courier slab in item_total and keeps delivery_fee = 0, so GST on
-- DELIVERY_FEE never produces a charge. Restore the intended bases from 0521 seed:
--   GST on parcel delivery     → ITEM_AFTER_DISCOUNT (courier fare)
--   GST on parcel booking fee  → PLATFORM_FEE (booking fee)

UPDATE billing_tax_configs
SET applicable_base = 'ITEM_AFTER_DISCOUNT'::billing_tax_applicable_base,
    tax_group = COALESCE(tax_group, 'fee'::billing_tax_group),
    updated_at = NOW()
WHERE service_type = 'PARCEL'
  AND name = 'GST on parcel delivery'
  AND applicable_base <> 'ITEM_AFTER_DISCOUNT'::billing_tax_applicable_base;

UPDATE billing_tax_configs
SET applicable_base = 'PLATFORM_FEE'::billing_tax_applicable_base,
    tax_group = 'platform'::billing_tax_group,
    updated_at = NOW()
WHERE service_type = 'PARCEL'
  AND name = 'GST on parcel booking fee'
  AND applicable_base <> 'PLATFORM_FEE'::billing_tax_applicable_base;

INSERT INTO billing_ruleset_version (id, version, updated_at)
VALUES (1, 2, NOW())
ON CONFLICT (id) DO UPDATE
SET version = billing_ruleset_version.version + 1,
    updated_at = NOW();
