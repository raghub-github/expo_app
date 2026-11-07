-- Rollback 0600: restore previous (incorrect) DELIVERY_FEE bases only if needed for local undo.
-- Prefer leaving the corrected ITEM_AFTER_DISCOUNT / PLATFORM_FEE values in place.

UPDATE billing_tax_configs
SET applicable_base = 'DELIVERY_FEE'::billing_tax_applicable_base,
    updated_at = NOW()
WHERE service_type = 'PARCEL'
  AND name IN ('GST on parcel delivery', 'GST on parcel booking fee');

INSERT INTO billing_ruleset_version (id, version, updated_at)
VALUES (1, 2, NOW())
ON CONFLICT (id) DO UPDATE
SET version = billing_ruleset_version.version + 1,
    updated_at = NOW();
