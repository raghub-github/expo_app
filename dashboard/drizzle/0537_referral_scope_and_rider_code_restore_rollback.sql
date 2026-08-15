-- Rollback 0537. Enum/type values are not removed.
-- Restored rider codes are left in place (do not delete published codes).

ALTER TABLE referral_settings
  DROP CONSTRAINT IF EXISTS referral_settings_merchant_qual_scope_check;

ALTER TABLE referral_settings
  DROP COLUMN IF EXISTS merchant_qualification_scope,
  DROP COLUMN IF EXISTS merchant_qualification_store_ids;
