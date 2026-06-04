-- Super-admin catalog for rider onboarding document uploads (labels, icons, capture screen).

CREATE TABLE IF NOT EXISTS rider_onboarding_document_types (
  id                      BIGSERIAL PRIMARY KEY,
  code                    TEXT NOT NULL,
  label                   TEXT NOT NULL,
  hint                    TEXT,
  icon                    TEXT,
  capture_group           TEXT NOT NULL DEFAULT 'dl_rc',
  requires_text_field     BOOLEAN NOT NULL DEFAULT FALSE,
  text_field_label        TEXT,
  text_field_placeholder  TEXT,
  min_text_length         INT NOT NULL DEFAULT 4,
  sort_order              INT NOT NULL DEFAULT 0,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_onboarding_document_types_code_uq UNIQUE (code),
  CONSTRAINT rider_onboarding_document_types_capture_group_chk CHECK (
    capture_group IN ('dl_rc', 'rental_ev')
  )
);

CREATE INDEX IF NOT EXISTS rider_onboarding_document_types_sort_idx
  ON rider_onboarding_document_types (capture_group, sort_order, id);

CREATE INDEX IF NOT EXISTS rider_onboarding_document_types_active_idx
  ON rider_onboarding_document_types (is_active)
  WHERE is_active = TRUE;

COMMENT ON TABLE rider_onboarding_document_types IS
  'Super-admin catalog for rider vehicle document uploads shown on dl-rc / rental-ev screens.';

INSERT INTO rider_onboarding_document_types (
  code, label, hint, icon, capture_group, requires_text_field,
  text_field_label, text_field_placeholder, min_text_length, sort_order
)
VALUES
  (
    'dl',
    'Driving License',
    'Enter your DL number and upload a clear photo',
    'card-outline',
    'dl_rc',
    TRUE,
    'Driving License Number',
    'Enter DL number',
    4,
    1
  ),
  (
    'rc',
    'Registration Certificate',
    'Enter your RC number and upload the registration certificate',
    'document-text-outline',
    'dl_rc',
    TRUE,
    'RC Number',
    'Enter registration number',
    4,
    2
  ),
  (
    'rental_proof',
    'Rental agreement',
    'Valid rental contract for your vehicle',
    'document-text-outline',
    'rental_ev',
    FALSE,
    NULL,
    NULL,
    0,
    1
  ),
  (
    'ev_proof',
    'EV proof',
    'EV ownership or lease document',
    'flash-outline',
    'rental_ev',
    FALSE,
    NULL,
    NULL,
    0,
    2
  )
ON CONFLICT (code) DO NOTHING;
