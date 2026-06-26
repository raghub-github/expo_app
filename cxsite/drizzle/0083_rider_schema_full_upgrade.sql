-- ============================================================================
-- RIDER SCHEMA FULL UPGRADE (Production)
-- Run this script in your PostgreSQL editor to bring DB in line with backend/dashboard schema.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS: document_type (extend with new values)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_vals TEXT[] := ARRAY[
    'aadhaar_front','aadhaar_back','dl_front','dl_back','insurance','bank_proof',
    'upi_qr_proof','profile_photo','vehicle_image','ev_ownership_proof','other'
  ];
  v_val TEXT;
  v_exists BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    RETURN;
  END IF;
  FOREACH v_val IN ARRAY v_vals
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'document_type' AND e.enumlabel = v_val
    ) INTO v_exists;
    IF NOT v_exists THEN
      EXECUTE format('ALTER TYPE document_type ADD VALUE %L', v_val);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. NEW ENUMS (rider redesign)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE rider_address_type AS ENUM ('registered', 'current', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_verification_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_file_side AS ENUM ('front', 'back', 'single');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM ('bank', 'upi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_verification_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_proof_type AS ENUM ('passbook', 'cancelled_cheque', 'statement', 'upi_qr_image');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vehicle enums (for rider_vehicles if using typed columns)
DO $$ BEGIN
  CREATE TYPE vehicle_type AS ENUM ('bike', 'ev_bike', 'cycle', 'car', 'auto', 'cng_auto', 'ev_auto', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fuel_type AS ENUM ('petrol', 'diesel', 'cng', 'electric', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_active_status AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ac_type AS ENUM ('AC', 'Non-AC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 3. SYSTEM_USERS (minimal – skip if table exists)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_users') THEN
    CREATE TABLE system_users (
      id BIGSERIAL PRIMARY KEY,
      system_user_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mobile TEXT NOT NULL,
      primary_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION',
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX system_users_system_user_id_idx ON system_users(system_user_id);
    CREATE UNIQUE INDEX system_users_email_idx ON system_users(email);
    CREATE INDEX system_users_status_idx ON system_users(status);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. REFERENCE TABLES: cities, service_types, vehicle_service_mapping, city_vehicle_rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'IN',
  timezone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cities_name_state_idx ON cities(name, state);
CREATE INDEX IF NOT EXISTS cities_is_active_idx ON cities(is_active);

CREATE TABLE IF NOT EXISTS service_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_types_code_idx ON service_types(code);
CREATE INDEX IF NOT EXISTS service_types_is_active_idx ON service_types(is_active);

-- Seed service_types if empty
INSERT INTO service_types (code, name, sort_order)
SELECT 'food', 'Food Delivery', 1
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'food');
INSERT INTO service_types (code, name, sort_order)
SELECT 'parcel', 'Parcel', 2
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'parcel');
INSERT INTO service_types (code, name, sort_order)
SELECT 'person_ride', 'Person Ride', 3
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'person_ride');

CREATE TABLE IF NOT EXISTS vehicle_service_mapping (
  id BIGSERIAL PRIMARY KEY,
  vehicle_type TEXT NOT NULL,
  service_type_id BIGINT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vehicle_service_mapping_vehicle_service_idx
  ON vehicle_service_mapping(vehicle_type, service_type_id);

CREATE TABLE IF NOT EXISTS city_vehicle_rules (
  id BIGSERIAL PRIMARY KEY,
  city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  service_type_id BIGINT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_config JSONB DEFAULT '{}',
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS city_vehicle_rules_city_service_idx ON city_vehicle_rules(city_id, service_type_id);
CREATE INDEX IF NOT EXISTS city_vehicle_rules_is_active_idx ON city_vehicle_rules(is_active);

-- ----------------------------------------------------------------------------
-- 5. RIDERS: soft delete and audit columns
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'riders' AND column_name = 'deleted_at') THEN
    ALTER TABLE riders
      ADD COLUMN deleted_at TIMESTAMPTZ,
      ADD COLUMN deleted_by INT,
      ADD COLUMN created_by INT,
      ADD COLUMN updated_by INT;
    CREATE INDEX IF NOT EXISTS riders_deleted_at_idx ON riders(deleted_at);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. RIDER_ADDRESSES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_addresses (
  id BIGSERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  address_type rider_address_type NOT NULL DEFAULT 'registered',
  full_address TEXT NOT NULL,
  city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  state TEXT,
  pincode TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rider_addresses_rider_id_idx ON rider_addresses(rider_id);
CREATE INDEX IF NOT EXISTS rider_addresses_city_id_idx ON rider_addresses(city_id);
CREATE INDEX IF NOT EXISTS rider_addresses_is_primary_idx ON rider_addresses(rider_id, is_primary);

-- Backfill rider_addresses from riders (idempotent)
INSERT INTO rider_addresses (rider_id, address_type, full_address, state, pincode, latitude, longitude, is_primary)
SELECT r.id, 'registered'::rider_address_type, COALESCE(r.address, ''), r.state, r.pincode,
       r.lat::NUMERIC(10,7), r.lon::NUMERIC(10,7), true
FROM riders r
WHERE ((r.address IS NOT NULL AND r.address <> '') OR r.lat IS NOT NULL OR r.lon IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM rider_addresses ra WHERE ra.rider_id = r.id LIMIT 1);

-- ----------------------------------------------------------------------------
-- 7. RIDER_DOCUMENTS: new columns
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'doc_number') THEN
    ALTER TABLE rider_documents ADD COLUMN doc_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'verification_status') THEN
    ALTER TABLE rider_documents ADD COLUMN verification_status document_verification_status DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'expiry_date') THEN
    ALTER TABLE rider_documents ADD COLUMN expiry_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'verified_at') THEN
    ALTER TABLE rider_documents ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'verified_by') THEN
    ALTER TABLE rider_documents ADD COLUMN verified_by BIGINT REFERENCES system_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'vehicle_id') THEN
    ALTER TABLE rider_documents ADD COLUMN vehicle_id INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'updated_at') THEN
    ALTER TABLE rider_documents ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_documents' AND column_name = 'created_by') THEN
    ALTER TABLE rider_documents ADD COLUMN created_by INT, ADD COLUMN updated_by INT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rider_documents_verification_status_idx ON rider_documents(verification_status)
  WHERE verification_status IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 8. RIDER_DOCUMENT_FILES (multiple images per document)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_document_files (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES rider_documents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  r2_key TEXT,
  side document_file_side NOT NULL DEFAULT 'single',
  mime_type TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rider_document_files_document_id_idx ON rider_document_files(document_id);

-- ----------------------------------------------------------------------------
-- 9. RIDER_VEHICLES: add regulatory columns if missing
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'is_commercial') THEN
    ALTER TABLE rider_vehicles ADD COLUMN is_commercial BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'registration_state') THEN
    ALTER TABLE rider_vehicles ADD COLUMN registration_state TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'permit_expiry') THEN
    ALTER TABLE rider_vehicles ADD COLUMN permit_expiry DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'vehicle_active_status') THEN
    ALTER TABLE rider_vehicles ADD COLUMN vehicle_active_status TEXT NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'seating_capacity') THEN
    ALTER TABLE rider_vehicles ADD COLUMN seating_capacity INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rider_vehicles' AND column_name = 'deleted_at') THEN
    ALTER TABLE rider_vehicles ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by INT, ADD COLUMN created_by INT, ADD COLUMN updated_by INT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rider_vehicles_vehicle_active_status_idx ON rider_vehicles(vehicle_active_status)
  WHERE vehicle_active_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS rider_vehicles_deleted_at_idx ON rider_vehicles(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 10. RIDER_PAYMENT_METHODS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_payment_methods (
  id BIGSERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  method_type payment_method_type NOT NULL,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT,
  ifsc TEXT,
  branch TEXT,
  account_number_encrypted TEXT,
  upi_id TEXT,
  verification_status payment_method_verification_status NOT NULL DEFAULT 'pending',
  verification_proof_type verification_proof_type,
  proof_document_id BIGINT REFERENCES rider_documents(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verified_by BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rider_payment_methods_rider_id_idx ON rider_payment_methods(rider_id);
CREATE INDEX IF NOT EXISTS rider_payment_methods_verification_status_idx ON rider_payment_methods(verification_status);
CREATE INDEX IF NOT EXISTS rider_payment_methods_deleted_at_idx ON rider_payment_methods(deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 11. WITHDRAWAL_REQUESTS: payment_method_id
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'payment_method_id'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD COLUMN payment_method_id BIGINT REFERENCES rider_payment_methods(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS withdrawal_requests_payment_method_id_idx ON withdrawal_requests(payment_method_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 12. DUTY_LOGS: vehicle_id (if not exists)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'duty_logs' AND column_name = 'vehicle_id'
  ) THEN
    ALTER TABLE duty_logs ADD COLUMN vehicle_id BIGINT REFERENCES rider_vehicles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS duty_logs_vehicle_id_idx ON duty_logs(vehicle_id) WHERE vehicle_id IS NOT NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- END RIDER SCHEMA FULL UPGRADE
-- ----------------------------------------------------------------------------
