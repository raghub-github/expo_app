-- Rollback of 0570: restore earlier table comment only (rows inserted by 0570 are left in place).
COMMENT ON TABLE merchant_store_type_onboarding_flags IS
  'Super-admin flags for child/partner onboarding (cuisine list, etc.) per store type.';

COMMENT ON COLUMN merchant_store_type_onboarding_flags.cuisine_list_enabled IS NULL;
