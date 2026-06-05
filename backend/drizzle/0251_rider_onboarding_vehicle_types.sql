-- Configurable rider onboarding vehicle / operating method catalog (super-admin managed).
-- Rider app fetches active + inactive rows; inactive options show disabled in UI.

CREATE TABLE IF NOT EXISTS rider_onboarding_vehicle_types (
  id                    BIGSERIAL PRIMARY KEY,
  code                  TEXT NOT NULL,
  label                 TEXT NOT NULL,
  hint                  TEXT,
  icon                  TEXT,
  sort_order            INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_flow       TEXT NOT NULL DEFAULT 'dl_rc',
  document_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  info_message          TEXT,
  maps_to_vehicle_type  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_onboarding_vehicle_types_code_uq UNIQUE (code),
  CONSTRAINT rider_onboarding_vehicle_types_flow_chk CHECK (
    onboarding_flow IN ('dl_rc', 'rental_ev', 'payment')
  )
);

CREATE INDEX IF NOT EXISTS rider_onboarding_vehicle_types_sort_idx
  ON rider_onboarding_vehicle_types (sort_order, id);

CREATE INDEX IF NOT EXISTS rider_onboarding_vehicle_types_active_idx
  ON rider_onboarding_vehicle_types (is_active)
  WHERE is_active = TRUE;

COMMENT ON TABLE rider_onboarding_vehicle_types IS
  'Super-admin catalog for rider onboarding vehicle selection (labels, icons, doc rules, next flow).';

COMMENT ON COLUMN rider_onboarding_vehicle_types.document_requirements IS
  'JSON: { required_docs: string[], has_own_vehicle?: boolean, requires_max_speed?: boolean }';

INSERT INTO rider_onboarding_vehicle_types (
  code, label, hint, icon, sort_order, onboarding_flow, document_requirements, info_message, maps_to_vehicle_type
)
VALUES
  (
    'own',
    'Own vehicle',
    'DL & RC required',
    'car-sport-outline',
    1,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL,
    'bike'
  ),
  (
    'rental_ev',
    'Rental / EV',
    'Proof in next step',
    'flash-outline',
    2,
    'rental_ev',
    '{"required_docs":["rental_proof","ev_proof"],"has_own_vehicle":false,"requires_max_speed":true}'::jsonb,
    'You will upload your rental agreement or EV ownership proof on the next screen.',
    'ev_bike'
  ),
  (
    'cycle',
    'Cycle',
    'Details in next step',
    'bicycle-outline',
    3,
    'payment',
    '{"required_docs":[],"has_own_vehicle":false}'::jsonb,
    'No rental or EV proof is required. You can continue to payment.',
    'cycle'
  )
ON CONFLICT (code) DO NOTHING;
