-- When super-admin adds RIDE charge rules, deactivate legacy seed duplicates of the same type.
-- Keeps only the configured active rows (charge order UI is source of truth).

UPDATE billing_pricing_rules seed
SET is_active = false, updated_at = now()
WHERE seed.is_active = true
  AND upper(trim(seed.service_type)) = 'RIDE'
  AND seed.type::text IN ('PLATFORM_FEE', 'CONVENIENCE_FEE')
  AND coalesce(seed.metadata->>'source', '') = 'ride_booking_seed_v1'
  AND EXISTS (
    SELECT 1
    FROM billing_pricing_rules newer
    WHERE newer.id <> seed.id
      AND newer.is_active = true
      AND upper(trim(newer.service_type)) = 'RIDE'
      AND newer.type = seed.type
  );

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
