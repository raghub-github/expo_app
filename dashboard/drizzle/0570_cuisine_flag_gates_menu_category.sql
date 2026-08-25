-- Clarify that cuisine_list_enabled also gates menu category/item cuisine UI + validation.
-- Cheap: comments + insert missing flag rows only (no full merchant_stores scan).

COMMENT ON TABLE merchant_store_type_onboarding_flags IS
  'Super-admin flags per store type: cuisine_list_enabled gates onboarding Step 5 cuisine picker AND menu category/item cuisine fields.';

COMMENT ON COLUMN merchant_store_type_onboarding_flags.cuisine_list_enabled IS
  'When true: show/require cuisine on categories (and show optional cuisine on items). When false: hide cuisine and reject cuisine_id on category create/update.';

INSERT INTO merchant_store_type_onboarding_flags (store_type, cuisine_list_enabled, updated_at)
SELECT DISTINCT UPPER(REPLACE(REPLACE(BTRIM(s.store_type::text), ' ', '_'), '-', '_')),
  UPPER(REPLACE(REPLACE(BTRIM(s.store_type::text), ' ', '_'), '-', '_')) IN (
    'FOOD', 'RESTAURANT', 'CAFE', 'BAKERY', 'CLOUD_KITCHEN',
    'FOOD_TRUCK', 'ICE_CREAM_PARLOR', 'GROCERY'
  ),
  NOW()
FROM (
  SELECT store_type::text AS store_type FROM platform_food_acceptance_settings_by_store_type
  UNION
  SELECT store_type::text AS store_type FROM merchant_store_type_document_map
) s
WHERE s.store_type IS NOT NULL AND btrim(s.store_type) <> ''
ON CONFLICT (store_type) DO NOTHING;
