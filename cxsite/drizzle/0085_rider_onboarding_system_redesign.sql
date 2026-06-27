-- ============================================================================
-- RIDER ONBOARDING SYSTEM REDESIGN
-- Run this in PostgreSQL (Supabase) SQL editor. Idempotent; safe to run multiple times.
-- Adds: transport modes (taxi, e_rickshaw, ev_car), service activation table,
-- status engine log, rule engine table, document fraud/duplicate columns,
-- vehicle ownership/limitation columns, and seeds vehicle-service mapping.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND vehicle_type ENUM (Cycle, EV Bike, Petrol Bike, Car, EV Car, Taxi, Auto, E-Rickshaw)
-- Backend may already have: bike, ev_bike, cycle, car, auto, cng_auto, ev_auto, other
-- Add: taxi, e_rickshaw, ev_car
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_new_vals TEXT[] := ARRAY['taxi', 'e_rickshaw', 'ev_car'];
  v_val TEXT;
  v_exists BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type') THEN
    CREATE TYPE vehicle_type AS ENUM (
      'bike', 'ev_bike', 'cycle', 'car', 'auto', 'cng_auto', 'ev_auto',
      'taxi', 'e_rickshaw', 'ev_car', 'other'
    );
    RETURN;
  END IF;
  FOREACH v_val IN ARRAY v_new_vals
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'vehicle_type' AND e.enumlabel = v_val
    ) INTO v_exists;
    IF NOT v_exists THEN
      EXECUTE format('ALTER TYPE vehicle_type ADD VALUE %L', v_val);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. NEW ENUMS: ownership_type, service_activation_status, onboarding_rule_scope
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE ownership_type AS ENUM ('ownership', 'rental', 'authorization_letter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_activation_status AS ENUM ('inactive', 'active', 'limited', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_rule_scope AS ENUM ('global', 'city', 'service', 'vehicle_type');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 3. verification_method (for rider_documents – dashboard may already have it)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE verification_method AS ENUM ('APP_VERIFIED', 'MANUAL_UPLOAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4. RIDER_DOCUMENTS – fraud, duplicate, manual review columns
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'fraud_flags') THEN
    ALTER TABLE rider_documents ADD COLUMN fraud_flags JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'duplicate_document_id') THEN
    ALTER TABLE rider_documents ADD COLUMN duplicate_document_id BIGINT REFERENCES rider_documents(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'requires_manual_review') THEN
    ALTER TABLE rider_documents ADD COLUMN requires_manual_review BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'verification_method') THEN
    ALTER TABLE rider_documents ADD COLUMN verification_method verification_method NOT NULL DEFAULT 'MANUAL_UPLOAD';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rider_documents_duplicate_document_id_idx ON rider_documents(duplicate_document_id) WHERE duplicate_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rider_documents_requires_manual_review_idx ON rider_documents(requires_manual_review) WHERE requires_manual_review = true;

-- ----------------------------------------------------------------------------
-- 5. RIDER_VEHICLES – ownership_type, limitation_flags
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'ownership_type') THEN
    ALTER TABLE rider_vehicles ADD COLUMN ownership_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'limitation_flags') THEN
    ALTER TABLE rider_vehicles ADD COLUMN limitation_flags JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'is_commercial') THEN
    ALTER TABLE rider_vehicles ADD COLUMN is_commercial BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Ensure vehicle_id FK on rider_documents references rider_vehicles (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'vehicle_id') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'rider_documents'
      AND constraint_name = 'rider_documents_vehicle_id_rider_vehicles_id_fk'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_name = 'rider_documents' AND kcu.column_name = 'vehicle_id'
    ) THEN
      ALTER TABLE rider_documents
        ADD CONSTRAINT rider_documents_vehicle_id_rider_vehicles_id_fk
        FOREIGN KEY (vehicle_id) REFERENCES rider_vehicles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. RIDER_SERVICE_ACTIVATION (per-rider per-service status + limitations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_service_activation (
  id BIGSERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  service_type_id BIGINT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  status service_activation_status NOT NULL DEFAULT 'inactive',
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  vehicle_id BIGINT REFERENCES rider_vehicles(id) ON DELETE SET NULL,
  limitation_flags JSONB DEFAULT '{}',
  activated_by_rule_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, service_type_id)
);

COMMENT ON TABLE rider_service_activation IS 'Per-rider per-service activation status; driven by Service Activation Engine after document/vehicle verification.';

CREATE INDEX IF NOT EXISTS rider_service_activation_rider_id_idx ON rider_service_activation(rider_id);
CREATE INDEX IF NOT EXISTS rider_service_activation_service_type_id_idx ON rider_service_activation(service_type_id);
CREATE INDEX IF NOT EXISTS rider_service_activation_status_idx ON rider_service_activation(status);
CREATE INDEX IF NOT EXISTS rider_service_activation_rider_status_idx ON rider_service_activation(rider_id, status);
CREATE INDEX IF NOT EXISTS rider_service_activation_vehicle_id_idx ON rider_service_activation(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. ONBOARDING_STATUS_TRANSITIONS (state machine audit log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_status_transitions (
  id BIGSERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT,
  from_kyc TEXT,
  to_kyc TEXT,
  from_status TEXT,
  to_status TEXT,
  trigger_type TEXT NOT NULL,
  trigger_ref_id BIGINT,
  performed_by_system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_status_transitions_rider_id_idx ON onboarding_status_transitions(rider_id);
CREATE INDEX IF NOT EXISTS onboarding_status_transitions_created_at_idx ON onboarding_status_transitions(created_at);
CREATE INDEX IF NOT EXISTS onboarding_status_transitions_rider_created_idx ON onboarding_status_transitions(rider_id, created_at);

-- ----------------------------------------------------------------------------
-- 8. ONBOARDING_RULE_POLICIES (rule engine – configurable policies)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_rule_policies (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  scope onboarding_rule_scope NOT NULL DEFAULT 'global',
  scope_ref_id BIGINT,
  rule_type TEXT NOT NULL,
  rule_config JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_rule_policies_rule_code_idx ON onboarding_rule_policies(rule_code);
CREATE INDEX IF NOT EXISTS onboarding_rule_policies_is_active_idx ON onboarding_rule_policies(is_active);
CREATE INDEX IF NOT EXISTS onboarding_rule_policies_scope_idx ON onboarding_rule_policies(scope);
CREATE INDEX IF NOT EXISTS onboarding_rule_policies_effective_idx ON onboarding_rule_policies(effective_from, effective_to) WHERE is_active = true;

-- FK for activated_by_rule_id (after onboarding_rule_policies exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'onboarding_rule_policies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'rider_service_activation'
      AND constraint_name = 'rider_service_activation_activated_by_rule_id_fkey'
    ) THEN
      ALTER TABLE rider_service_activation
        ADD CONSTRAINT rider_service_activation_activated_by_rule_id_fkey
        FOREIGN KEY (activated_by_rule_id) REFERENCES onboarding_rule_policies(id) ON DELETE SET NULL;
    END IF;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 9. SEED vehicle_service_mapping (vehicle_type TEXT – all transport modes vs services)
-- Cycle: food only. EV Bike / Petrol Bike: all three. Auto / E-Rickshaw: all three.
-- Car / Taxi / EV Car: person_ride only (food+parcel require bike docs later).
-- ----------------------------------------------------------------------------
INSERT INTO service_types (code, name, sort_order)
SELECT 'food', 'Food Delivery', 1
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'food');
INSERT INTO service_types (code, name, sort_order)
SELECT 'parcel', 'Parcel', 2
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'parcel');
INSERT INTO service_types (code, name, sort_order)
SELECT 'person_ride', 'Person Ride', 3
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'person_ride');

-- Seed mapping: (vehicle_type, service_type_id, allowed)
-- Cycle: food only. Bike/EV Bike/Auto/E-Rickshaw: all. Car/Taxi/EV Car: person_ride only. Other: all.
WITH st AS (
  SELECT id, code FROM service_types
),
v_types AS (SELECT unnest(ARRAY['cycle','bike','ev_bike','car','ev_car','taxi','auto','cng_auto','ev_auto','e_rickshaw','other']) AS vt),
mapping AS (
  SELECT vt.vt AS vehicle_type, st.id AS service_type_id,
    CASE
      WHEN vt.vt = 'cycle' AND st.code = 'food' THEN true
      WHEN vt.vt = 'cycle' THEN false
      WHEN vt.vt IN ('car','ev_car','taxi') AND st.code = 'person_ride' THEN true
      WHEN vt.vt IN ('car','ev_car','taxi') THEN false
      WHEN vt.vt IN ('bike','ev_bike','auto','cng_auto','ev_auto','e_rickshaw','other') THEN true
      ELSE false
    END AS allowed
  FROM v_types vt CROSS JOIN st
)
INSERT INTO vehicle_service_mapping (vehicle_type, service_type_id, allowed)
SELECT mapping.vehicle_type, mapping.service_type_id, mapping.allowed
FROM mapping
WHERE NOT EXISTS (
  SELECT 1 FROM vehicle_service_mapping v
  WHERE v.vehicle_type = mapping.vehicle_type AND v.service_type_id = mapping.service_type_id
);

-- ----------------------------------------------------------------------------
-- 10. RIDER_VEHICLES: ensure vehicle_type column accepts TEXT (if table uses enum, application must send enum value)
-- No change if column is already enum; application layer maps taxi/e_rickshaw/ev_car.
-- ----------------------------------------------------------------------------
-- Optional: if rider_vehicles.vehicle_type is TEXT, seed rows are fine. If it's enum, ALTER already added new values above.

-- ----------------------------------------------------------------------------
-- END RIDER ONBOARDING SYSTEM REDESIGN
-- ----------------------------------------------------------------------------
