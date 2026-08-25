-- Per store-type: show cuisine list in onboarding when enabled.
-- Also: Aadhaar optional, PAN + bank mandatory on every mapped store type.

CREATE TABLE IF NOT EXISTS merchant_store_type_onboarding_flags (
  store_type            TEXT PRIMARY KEY,
  cuisine_list_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_store_type_onboarding_flags IS
  'Super-admin flags for child/partner onboarding (cuisine list, etc.) per store type.';

INSERT INTO merchant_store_type_onboarding_flags (store_type, cuisine_list_enabled, updated_at)
SELECT DISTINCT UPPER(BTRIM(s.store_type)),
  UPPER(BTRIM(s.store_type)) IN (
    'FOOD', 'RESTAURANT', 'CAFE', 'BAKERY', 'CLOUD_KITCHEN',
    'FOOD_TRUCK', 'ICE_CREAM_PARLOR', 'GROCERY'
  ),
  NOW()
FROM (
  SELECT store_type FROM platform_food_acceptance_settings_by_store_type
  UNION
  SELECT store_type FROM merchant_store_type_document_map
) s
WHERE s.store_type IS NOT NULL AND btrim(s.store_type) <> ''
ON CONFLICT (store_type) DO NOTHING;

-- PAN + bank mandatory, Aadhaar optional — all mapped types.
UPDATE merchant_store_type_document_map
SET is_mandatory = FALSE, is_active = TRUE, updated_at = NOW()
WHERE UPPER(document_code) = 'AADHAAR';

UPDATE merchant_store_type_document_map
SET is_mandatory = TRUE, is_active = TRUE, updated_at = NOW()
WHERE UPPER(document_code) IN ('PAN', 'BANK_PROOF');

INSERT INTO merchant_store_type_document_map (store_type, document_code, is_mandatory, is_active, display_order)
SELECT s.store_type, d.code, d.is_mandatory, TRUE, d.display_order
FROM (
  SELECT DISTINCT UPPER(BTRIM(store_type)) AS store_type
  FROM merchant_store_type_document_map
) s
CROSS JOIN (
  VALUES
    ('PAN', TRUE, 10),
    ('AADHAAR', FALSE, 20),
    ('BANK_PROOF', TRUE, 40)
) AS d(code, is_mandatory, display_order)
ON CONFLICT (store_type, document_code) DO UPDATE SET
  is_mandatory = EXCLUDED.is_mandatory,
  is_active = TRUE,
  updated_at = NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_type_document_requirements'
  ) THEN
    UPDATE store_type_document_requirements
    SET is_mandatory = FALSE
    WHERE document_type::text = 'AADHAAR';
    UPDATE store_type_document_requirements
    SET is_mandatory = TRUE
    WHERE document_type::text IN ('PAN', 'BANK_PROOF');
  END IF;
END $$;
