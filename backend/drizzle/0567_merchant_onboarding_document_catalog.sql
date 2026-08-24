-- Merchant onboarding document catalog + per-store-type mapping.
-- I/O-safe: two small new tables only. No scans/rewrites of merchant_store_documents
-- or orders. Seed copies from existing store_type_document_requirements (~hundreds of
-- rows) and gap-fills from platform_food_acceptance_settings_by_store_type.

CREATE TABLE IF NOT EXISTS merchant_onboarding_document_types (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  hint        TEXT,
  form_section TEXT NOT NULL DEFAULT 'LICENCE',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_onboarding_document_types_code_uq UNIQUE (code),
  CONSTRAINT merchant_onboarding_document_types_section_chk CHECK (
    form_section IN ('PAN', 'AADHAAR', 'LICENCE', 'GST', 'BANK')
  )
);

CREATE INDEX IF NOT EXISTS merchant_onboarding_document_types_active_idx
  ON merchant_onboarding_document_types (is_active)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS merchant_store_type_document_map (
  id             BIGSERIAL PRIMARY KEY,
  store_type     TEXT NOT NULL,
  document_code  TEXT NOT NULL REFERENCES merchant_onboarding_document_types(code),
  is_mandatory   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  display_order  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_store_type_document_map_uq UNIQUE (store_type, document_code)
);

CREATE INDEX IF NOT EXISTS merchant_store_type_document_map_store_idx
  ON merchant_store_type_document_map (store_type, is_active, display_order);

COMMENT ON TABLE merchant_onboarding_document_types IS
  'Super-admin catalog of merchant onboarding documents shown in child/partner onboarding.';
COMMENT ON TABLE merchant_store_type_document_map IS
  'Which catalog documents apply to which store type (store types come from order-acceptance settings).';

INSERT INTO merchant_onboarding_document_types (code, label, hint, form_section, sort_order)
VALUES
  ('PAN', 'PAN Card', 'PAN card of the business/owner', 'PAN', 10),
  ('AADHAAR', 'Aadhaar Card', 'Aadhaar of the store owner/authorized person', 'AADHAAR', 20),
  ('GST', 'GST Certificate', 'GST registration certificate (if applicable)', 'GST', 30),
  ('BANK_PROOF', 'Bank Account Details', 'Bank account statement or cancelled cheque', 'BANK', 40),
  ('FSSAI', 'FSSAI License', 'Food Safety and Standards Authority of India license', 'LICENCE', 50),
  ('TRADE_LICENSE', 'Trade License', 'Valid trade license for the business', 'LICENCE', 60),
  ('SHOP_ACT', 'Shop & Establishment', 'Shop and Establishment Act license', 'LICENCE', 70),
  ('UDYAM', 'Udyam Registration', 'MSME / Udyam registration (if applicable)', 'LICENCE', 80),
  ('RETAIL_DRUG_LICENSE', 'Retail Drug License', 'Retail drug license for pharmacy', 'LICENCE', 90),
  ('WHOLESALE_DRUG_LICENSE', 'Wholesale Drug License', 'Wholesale drug license for pharmacy', 'LICENCE', 100),
  ('PHARMACIST_CERTIFICATE', 'Pharmacist Certificate', 'Registered pharmacist certificate', 'LICENCE', 110),
  ('PHARMACIST_REGISTRATION_NUMBER', 'Pharmacist Registration', 'Pharmacist registration number', 'LICENCE', 120),
  ('STATE_PHARMACY_COUNCIL_PROOF', 'Pharmacy Council Proof', 'State pharmacy council registration proof', 'LICENCE', 130),
  ('OTHER', 'Other document', 'Any other supporting licence or document', 'LICENCE', 140)
ON CONFLICT (code) DO NOTHING;

-- Any extra codes already in the legacy requirements table.
INSERT INTO merchant_onboarding_document_types (code, label, hint, form_section, sort_order)
SELECT
  d.document_type::text,
  COALESCE(MAX(d.display_name), d.document_type::text),
  MAX(d.description),
  CASE d.document_type::text
    WHEN 'PAN' THEN 'PAN'
    WHEN 'AADHAAR' THEN 'AADHAAR'
    WHEN 'GST' THEN 'GST'
    WHEN 'BANK_PROOF' THEN 'BANK'
    ELSE 'LICENCE'
  END,
  COALESCE(MIN(d.display_order), 200)
FROM store_type_document_requirements d
GROUP BY d.document_type
ON CONFLICT (code) DO NOTHING;

-- Copy existing per-type rules (source of truth for types already configured).
INSERT INTO merchant_store_type_document_map (store_type, document_code, is_mandatory, is_active, display_order)
SELECT
  r.store_type::text,
  r.document_type::text,
  r.is_mandatory,
  TRUE,
  COALESCE(r.display_order, 0)
FROM store_type_document_requirements r
ON CONFLICT (store_type, document_code) DO NOTHING;

-- Gap-fill common docs for every store type on the order-acceptance page.
INSERT INTO merchant_store_type_document_map (store_type, document_code, is_mandatory, is_active, display_order)
SELECT s.store_type, d.code, d.is_mandatory, TRUE, d.display_order
FROM platform_food_acceptance_settings_by_store_type s
CROSS JOIN (
  VALUES
    ('PAN', TRUE, 10),
    ('AADHAAR', TRUE, 20),
    ('BANK_PROOF', TRUE, 40),
    ('GST', FALSE, 30),
    ('TRADE_LICENSE', FALSE, 60),
    ('SHOP_ACT', FALSE, 70)
) AS d(code, is_mandatory, display_order)
ON CONFLICT (store_type, document_code) DO NOTHING;

-- Match current child-form behaviour: FSSAI mandatory for food store types.
INSERT INTO merchant_store_type_document_map (store_type, document_code, is_mandatory, is_active, display_order)
SELECT s.store_type, 'FSSAI', TRUE, TRUE, 50
FROM platform_food_acceptance_settings_by_store_type s
WHERE UPPER(s.store_type) IN ('FOOD', 'RESTAURANT', 'CAFE', 'BAKERY', 'CLOUD_KITCHEN', 'GROCERY')
ON CONFLICT (store_type, document_code) DO UPDATE
SET is_mandatory = TRUE,
    is_active = TRUE,
    updated_at = NOW();

-- Pharma extras if PHARMA exists on acceptance settings but was missing from the copy.
INSERT INTO merchant_store_type_document_map (store_type, document_code, is_mandatory, is_active, display_order)
SELECT s.store_type, d.code, TRUE, TRUE, d.display_order
FROM platform_food_acceptance_settings_by_store_type s
CROSS JOIN (
  VALUES
    ('RETAIL_DRUG_LICENSE', 90),
    ('PHARMACIST_CERTIFICATE', 110),
    ('PHARMACIST_REGISTRATION_NUMBER', 120),
    ('STATE_PHARMACY_COUNCIL_PROOF', 130)
) AS d(code, display_order)
WHERE UPPER(s.store_type) = 'PHARMA'
ON CONFLICT (store_type, document_code) DO NOTHING;
