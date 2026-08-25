-- Align merchant onboarding docs with Super Admin map (source of truth).
-- Catalog is_active must not hide mapped documents on AM / partnersite forms.
-- Also normalize store_type + document_code so add/delete in admin matches forms.

INSERT INTO merchant_onboarding_document_types (
  code, label, hint, form_section, sort_order, is_active, updated_at
)
SELECT DISTINCT
  UPPER(REPLACE(REPLACE(BTRIM(m.document_code), ' ', '_'), '-', '_')),
  COALESCE(
    NULLIF(BTRIM(c.label), ''),
    INITCAP(REPLACE(LOWER(REPLACE(REPLACE(BTRIM(m.document_code), ' ', '_'), '-', '_')), '_', ' '))
  ),
  c.hint,
  COALESCE(
    c.form_section,
    CASE UPPER(REPLACE(REPLACE(BTRIM(m.document_code), ' ', '_'), '-', '_'))
      WHEN 'PAN' THEN 'PAN'
      WHEN 'AADHAAR' THEN 'AADHAAR'
      WHEN 'AADHAR' THEN 'AADHAAR'
      WHEN 'GST' THEN 'GST'
      WHEN 'BANK_PROOF' THEN 'BANK'
      WHEN 'BANK' THEN 'BANK'
      ELSE 'LICENCE'
    END
  ),
  COALESCE(c.sort_order, 90),
  TRUE,
  NOW()
FROM merchant_store_type_document_map m
LEFT JOIN merchant_onboarding_document_types c
  ON UPPER(BTRIM(c.code)) = UPPER(BTRIM(m.document_code))
WHERE NOT EXISTS (
  SELECT 1
  FROM merchant_onboarding_document_types x
  WHERE UPPER(REPLACE(REPLACE(BTRIM(x.code), ' ', '_'), '-', '_'))
      = UPPER(REPLACE(REPLACE(BTRIM(m.document_code), ' ', '_'), '-', '_'))
)
ON CONFLICT (code) DO NOTHING;

UPDATE merchant_onboarding_document_types c
SET is_active = TRUE, updated_at = NOW()
WHERE c.is_active IS DISTINCT FROM TRUE
  AND EXISTS (
    SELECT 1
    FROM merchant_store_type_document_map m
    WHERE m.is_active = TRUE
      AND UPPER(REPLACE(REPLACE(BTRIM(m.document_code), ' ', '_'), '-', '_'))
        = UPPER(REPLACE(REPLACE(BTRIM(c.code), ' ', '_'), '-', '_'))
  );

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.merchant_store_type_document_map'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE merchant_store_type_document_map DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

DELETE FROM merchant_onboarding_document_types a
USING merchant_onboarding_document_types b
WHERE a.id > b.id
  AND UPPER(REPLACE(REPLACE(BTRIM(a.code), ' ', '_'), '-', '_'))
    = UPPER(REPLACE(REPLACE(BTRIM(b.code), ' ', '_'), '-', '_'));

UPDATE merchant_onboarding_document_types
SET code = UPPER(REPLACE(REPLACE(BTRIM(code), ' ', '_'), '-', '_')),
    updated_at = NOW()
WHERE code IS DISTINCT FROM UPPER(REPLACE(REPLACE(BTRIM(code), ' ', '_'), '-', '_'));

DELETE FROM merchant_store_type_document_map a
USING merchant_store_type_document_map b
WHERE a.id > b.id
  AND UPPER(REPLACE(REPLACE(BTRIM(a.store_type), ' ', '_'), '-', '_'))
    = UPPER(REPLACE(REPLACE(BTRIM(b.store_type), ' ', '_'), '-', '_'))
  AND UPPER(REPLACE(REPLACE(BTRIM(a.document_code), ' ', '_'), '-', '_'))
    = UPPER(REPLACE(REPLACE(BTRIM(b.document_code), ' ', '_'), '-', '_'));

UPDATE merchant_store_type_document_map
SET store_type = UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')),
    document_code = UPPER(REPLACE(REPLACE(BTRIM(document_code), ' ', '_'), '-', '_')),
    updated_at = NOW()
WHERE store_type IS DISTINCT FROM UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_'))
   OR document_code IS DISTINCT FROM UPPER(REPLACE(REPLACE(BTRIM(document_code), ' ', '_'), '-', '_'));

INSERT INTO merchant_onboarding_document_types (
  code, label, form_section, sort_order, is_active, updated_at
)
SELECT DISTINCT
  m.document_code,
  INITCAP(REPLACE(LOWER(m.document_code), '_', ' ')),
  CASE m.document_code
    WHEN 'PAN' THEN 'PAN'
    WHEN 'AADHAAR' THEN 'AADHAAR'
    WHEN 'GST' THEN 'GST'
    WHEN 'BANK_PROOF' THEN 'BANK'
    ELSE 'LICENCE'
  END,
  90,
  TRUE,
  NOW()
FROM merchant_store_type_document_map m
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_onboarding_document_types c WHERE c.code = m.document_code
)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE merchant_store_type_document_map
  DROP CONSTRAINT IF EXISTS merchant_store_type_document_map_document_code_fkey;

ALTER TABLE merchant_store_type_document_map
  ADD CONSTRAINT merchant_store_type_document_map_document_code_fkey
  FOREIGN KEY (document_code) REFERENCES merchant_onboarding_document_types (code);

-- Legacy store_type_document_requirements is not copied here: that table can be
-- large, and merchant_store_type_document_map is already the live source of truth.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_type_onboarding_flags'
  ) THEN
    DELETE FROM merchant_store_type_onboarding_flags a
    USING merchant_store_type_onboarding_flags b
    WHERE a.store_type > b.store_type
      AND UPPER(REPLACE(REPLACE(BTRIM(a.store_type), ' ', '_'), '-', '_'))
        = UPPER(REPLACE(REPLACE(BTRIM(b.store_type), ' ', '_'), '-', '_'));

    UPDATE merchant_store_type_onboarding_flags
    SET store_type = UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')),
        updated_at = NOW()
    WHERE store_type IS DISTINCT FROM UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_'));
  END IF;
END $$;
