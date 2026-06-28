-- ============================================================================
-- Rider Domain Schema Fixes and Clarifications
-- Migration: 0061_fix_rider_schema_clarifications
-- 
-- This migration addresses the following issues:
-- 1. Creates missing enums for penalty_status, service_type, vehicle_type, fuel_type, etc.
-- 2. Enhances duty_logs table to track service-specific online status, vehicle_id, location, session_id
-- 3. Clarifies and standardizes vehicle/bike number field naming (use registration_number consistently)
-- 4. Clarifies penalties table vs wallet table relationship
-- 5. Adds comprehensive documentation and comments
--
-- IMPORTANT: This migration enhances existing tables and adds missing enums
-- IMPORTANT: Duty logs now track which service(s) rider is online for
-- IMPORTANT: Penalties table = individual records, Wallet table = aggregated totals
-- ============================================================================

-- ============================================================================
-- 1. CREATE MISSING ENUMS
-- ============================================================================

-- Penalty Status Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'penalty_status') THEN
    CREATE TYPE penalty_status AS ENUM (
      'active',      -- Penalty is active and pending payment
      'reversed',    -- Penalty was reversed/cancelled
      'paid'         -- Penalty was paid (deducted from wallet)
    );
  END IF;
END $$;

-- Service Type Enum (for blacklist and other service-specific operations)
-- Note: Do NOT add new enum values (e.g. 'all') in this migration and use them in the same
-- transaction - PostgreSQL requires "New enum values must be committed before they can be used".
-- We only create the enum if it doesn't exist, or use existing values.
DO $$ 
DECLARE
  enum_oid OID;
BEGIN
  -- Check if enum exists
  SELECT oid INTO enum_oid FROM pg_type WHERE typname = 'service_type';
  
  IF enum_oid IS NULL THEN
    -- Enum doesn't exist, create it with all values including 'all'
    CREATE TYPE service_type AS ENUM (
      'food',        -- Food delivery service
      'parcel',      -- Parcel delivery service
      'person_ride', -- Person ride service
      'all'          -- All services (for global blacklist)
    );
  END IF;
  -- If enum already exists, do NOT add 'all' here - it cannot be used in same transaction.
  -- Column conversion below will use first existing value as default when 'all' is not present.
END $$;

-- Vehicle Type Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type') THEN
    CREATE TYPE vehicle_type AS ENUM (
      'bike',        -- Motorcycle/Bike
      'car',         -- Car
      'bicycle',     -- Bicycle
      'scooter',     -- Scooter
      'auto'         -- Auto-rickshaw
    );
  END IF;
END $$;

-- Fuel Type Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_type') THEN
    CREATE TYPE fuel_type AS ENUM (
      'EV',          -- Electric Vehicle
      'Petrol',      -- Petrol
      'Diesel',      -- Diesel
      'CNG'          -- Compressed Natural Gas
    );
  END IF;
END $$;

-- Vehicle Category Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_category') THEN
    CREATE TYPE vehicle_category AS ENUM (
      'Auto',        -- Auto-rickshaw
      'Bike',        -- Motorcycle
      'Cab',         -- Cab/Taxi
      'Taxi',        -- Taxi
      'Bicycle',     -- Bicycle
      'Scooter'      -- Scooter
    );
  END IF;
END $$;

-- AC Type Enum (for person_ride service)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ac_type') THEN
    CREATE TYPE ac_type AS ENUM (
      'AC',          -- Air Conditioned
      'Non-AC'       -- Non-Air Conditioned
    );
  END IF;
END $$;

-- Penalty Type Enum (common penalty types)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'penalty_type') THEN
    CREATE TYPE penalty_type AS ENUM (
      'late_delivery',       -- Order delivered late
      'customer_complaint',  -- Customer complaint
      'fraud',               -- Fraudulent activity
      'cancellation',        -- Order cancellation
      'damage',              -- Order/item damage
      'wrong_delivery',      -- Wrong delivery address/item
      'no_show',             -- Rider didn't show up
      'behavior',            -- Unprofessional behavior
      'other'                -- Other reasons
    );
  END IF;
END $$;

-- ============================================================================
-- 2. ENHANCE DUTY_LOGS TABLE (Add service-specific tracking)
-- ============================================================================

-- Add new columns to duty_logs for comprehensive tracking
ALTER TABLE duty_logs
  ADD COLUMN IF NOT EXISTS service_types JSONB DEFAULT '[]'::jsonb, -- Array of services: ['food', 'parcel', 'person_ride'] - which services rider is online for
  ADD COLUMN IF NOT EXISTS vehicle_id BIGINT REFERENCES rider_vehicles(id) ON DELETE SET NULL, -- Which vehicle rider is using
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION, -- Latitude when going online
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION, -- Longitude when going online
  ADD COLUMN IF NOT EXISTS session_id TEXT, -- Unique session ID to track duty sessions (ON -> OFF cycle)
  ADD COLUMN IF NOT EXISTS device_id TEXT, -- Device ID from which rider went online
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb; -- Additional metadata (battery level, network type, etc.)

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS duty_logs_service_types_idx ON duty_logs USING GIN(service_types);
CREATE INDEX IF NOT EXISTS duty_logs_vehicle_id_idx ON duty_logs(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS duty_logs_session_id_idx ON duty_logs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS duty_logs_rider_timestamp_idx ON duty_logs(rider_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS duty_logs_rider_status_service_idx ON duty_logs(rider_id, status, timestamp DESC) WHERE status = 'ON';

-- Add comments for clarity
COMMENT ON COLUMN duty_logs.service_types IS 'Array of service types rider is online for: [food, parcel, person_ride]. Empty array [] means rider is offline. When status=ON, this array should contain at least one service type.';
COMMENT ON COLUMN duty_logs.vehicle_id IS 'Vehicle ID from rider_vehicles table that rider is using during this duty session';
COMMENT ON COLUMN duty_logs.lat IS 'Latitude coordinate when rider went online/offline';
COMMENT ON COLUMN duty_logs.lon IS 'Longitude coordinate when rider went online/offline';
COMMENT ON COLUMN duty_logs.session_id IS 'Unique session ID to track a complete duty cycle (ON -> OFF). Generated when rider goes online, used until rider goes offline.';
COMMENT ON COLUMN duty_logs.device_id IS 'Device ID from which rider went online/offline';
COMMENT ON COLUMN duty_logs.metadata IS 'Additional metadata: battery level, network type, app version, etc.';

-- Update table comment
COMMENT ON TABLE duty_logs IS 'Tracks every ON/OFF duty status change for riders with service-specific tracking. When rider goes online, service_types array contains which services they are available for (food, parcel, person_ride). Used to calculate total duty active time per service for day/week/month. Every time rider goes online or offline, a new entry should be created.';

-- ============================================================================
-- 3. UPDATE RIDER_PENALTIES TABLE (Use enums instead of TEXT)
-- ============================================================================

-- Update penalty_status to use enum (if column exists and is TEXT)
DO $$
BEGIN
  -- Check if column exists and is TEXT type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_penalties' 
    AND column_name = 'status' 
    AND data_type = 'text'
  ) THEN
    -- Drop the default first
    ALTER TABLE rider_penalties 
      ALTER COLUMN status DROP DEFAULT;
    
    -- Convert existing TEXT values to enum-compatible values
    ALTER TABLE rider_penalties 
      ALTER COLUMN status TYPE penalty_status 
      USING status::penalty_status;
    
    -- Set the default again with enum type
    ALTER TABLE rider_penalties 
      ALTER COLUMN status SET DEFAULT 'active'::penalty_status;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_penalties' 
    AND column_name = 'status'
  ) THEN
    -- Column doesn't exist, create it with enum type
    ALTER TABLE rider_penalties 
      ADD COLUMN status penalty_status NOT NULL DEFAULT 'active'::penalty_status;
  END IF;
END $$;

-- Update penalty_type to use enum (if column exists and is TEXT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_penalties' 
    AND column_name = 'penalty_type' 
    AND data_type = 'text'
  ) THEN
    -- First, update any values that don't match enum to 'other'
    UPDATE rider_penalties 
    SET penalty_type = 'other' 
    WHERE penalty_type NOT IN ('late_delivery', 'customer_complaint', 'fraud', 'cancellation', 'damage', 'wrong_delivery', 'no_show', 'behavior', 'other');
    
    -- Convert existing TEXT values to enum-compatible values
    ALTER TABLE rider_penalties 
      ALTER COLUMN penalty_type TYPE penalty_type 
      USING penalty_type::penalty_type;
  END IF;
END $$;

-- Add comments for clarity
COMMENT ON TABLE rider_penalties IS 'Individual penalty records per service type. Each penalty is a separate record. When penalty is paid, it is deducted from rider_wallet and status is updated to paid. This table tracks the history and details of each penalty.';
COMMENT ON COLUMN rider_penalties.status IS 'Penalty status: active (pending payment), reversed (cancelled), paid (deducted from wallet). When status=paid, the penalty amount has been deducted from rider_wallet.total_balance and the service-specific penalty field.';
COMMENT ON COLUMN rider_penalties.service_type IS 'Service type for which penalty was imposed: food, parcel, or person_ride';
COMMENT ON COLUMN rider_penalties.amount IS 'Penalty amount in INR. This amount is deducted from rider_wallet when status changes to paid.';

-- ============================================================================
-- 4. UPDATE BLACKLIST_HISTORY TABLE (Use enum for service_type)
-- ============================================================================

-- First, drop the view that depends on service_type column (if it exists)
DROP VIEW IF EXISTS blacklist_current_status;

-- Update service_type column to use enum (if column exists and is TEXT)
-- IMPORTANT: Use only enum values that existed before this transaction started.
-- We never add 'all' in this migration, so we only use 'all' if it was already in the enum.
DO $$
DECLARE
  enum_oid OID;
  has_all BOOLEAN;
  default_value TEXT;
BEGIN
  SELECT oid INTO enum_oid FROM pg_type WHERE typname = 'service_type';
  
  IF enum_oid IS NULL THEN
    RAISE EXCEPTION 'service_type enum does not exist';
  END IF;

  -- Use 'all' only if it already existed in the enum (not added in this transaction).
  -- Otherwise use the first existing enum value to avoid "unsafe use of new value".
  SELECT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'all' AND enumtypid = enum_oid
  ) INTO has_all;

  IF has_all THEN
    default_value := 'all';
  ELSE
    SELECT enumlabel INTO default_value 
    FROM pg_enum 
    WHERE enumtypid = enum_oid 
    ORDER BY enumsortorder 
    LIMIT 1;
    IF default_value IS NULL THEN
      RAISE EXCEPTION 'service_type enum has no values';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'blacklist_history' 
    AND column_name = 'service_type' 
    AND data_type = 'text'
  ) THEN
    UPDATE blacklist_history 
    SET service_type = default_value
    WHERE service_type NOT IN (
      SELECT enumlabel FROM pg_enum WHERE enumtypid = enum_oid
    );

    ALTER TABLE blacklist_history 
      ALTER COLUMN service_type DROP DEFAULT;

    ALTER TABLE blacklist_history 
      ALTER COLUMN service_type TYPE service_type 
      USING service_type::service_type;

    EXECUTE format('ALTER TABLE blacklist_history ALTER COLUMN service_type SET DEFAULT %L::service_type', default_value);
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'blacklist_history' 
    AND column_name = 'service_type'
  ) THEN
    EXECUTE format('ALTER TABLE blacklist_history ADD COLUMN service_type service_type NOT NULL DEFAULT %L::service_type', default_value);
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN blacklist_history.service_type IS 'Service type for blacklist: food, parcel, person_ride, or all (for global blacklist across all services)';

-- ============================================================================
-- 5. UPDATE RIDER_VEHICLES TABLE (Use enums and clarify registration_number)
-- ============================================================================

-- Update vehicle_type to use enum (if column exists and is TEXT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_vehicles' 
    AND column_name = 'vehicle_type' 
    AND data_type = 'text'
  ) THEN
    -- First, update any values that don't match enum (this shouldn't happen, but handle it)
    -- Since vehicle_type is NOT NULL, we need to ensure all values are valid
    -- If there are invalid values, we'll need to handle them manually or set a default
    -- For now, we'll just try the conversion and let it fail if there are invalid values
    
    -- Convert existing TEXT values to enum-compatible values
    ALTER TABLE rider_vehicles 
      ALTER COLUMN vehicle_type TYPE vehicle_type 
      USING vehicle_type::vehicle_type;
  END IF;
END $$;

-- Update fuel_type to use enum (if column exists and is TEXT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_vehicles' 
    AND column_name = 'fuel_type' 
    AND data_type = 'text'
  ) THEN
    -- fuel_type is nullable, so we can convert NULL and valid values
    -- Convert existing TEXT values to enum-compatible values
    -- NULL values will remain NULL
    ALTER TABLE rider_vehicles 
      ALTER COLUMN fuel_type TYPE fuel_type 
      USING CASE 
        WHEN fuel_type IS NULL THEN NULL
        WHEN fuel_type IN ('EV', 'Petrol', 'Diesel', 'CNG') THEN fuel_type::fuel_type
        ELSE NULL -- Set invalid values to NULL
      END;
  END IF;
END $$;

-- Update vehicle_category to use enum (if column exists and is TEXT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_vehicles' 
    AND column_name = 'vehicle_category' 
    AND data_type = 'text'
  ) THEN
    -- vehicle_category is nullable, so we can convert NULL and valid values
    ALTER TABLE rider_vehicles 
      ALTER COLUMN vehicle_category TYPE vehicle_category 
      USING CASE 
        WHEN vehicle_category IS NULL THEN NULL
        WHEN vehicle_category IN ('Auto', 'Bike', 'Cab', 'Taxi', 'Bicycle', 'Scooter') THEN vehicle_category::vehicle_category
        ELSE NULL -- Set invalid values to NULL
      END;
  END IF;
END $$;

-- Update ac_type to use enum (if column exists and is TEXT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_vehicles' 
    AND column_name = 'ac_type' 
    AND data_type = 'text'
  ) THEN
    -- ac_type is nullable, so we can convert NULL and valid values
    ALTER TABLE rider_vehicles 
      ALTER COLUMN ac_type TYPE ac_type 
      USING CASE 
        WHEN ac_type IS NULL THEN NULL
        WHEN ac_type IN ('AC', 'Non-AC') THEN ac_type::ac_type
        ELSE NULL -- Set invalid values to NULL
      END;
  END IF;
END $$;

-- Add comments to clarify registration_number usage
COMMENT ON COLUMN rider_vehicles.registration_number IS 'Vehicle registration number (RC number). This is the official vehicle registration number from RTO. Use this field consistently - do NOT use "bike_number" or "vehicle_number" in other tables.';
COMMENT ON TABLE rider_vehicles IS 'Stores vehicle information for riders. Each rider can have multiple vehicles, but only one can be active at a time. The registration_number field is the official RC number and should be used consistently across the system.';

-- ============================================================================
-- 6. CLARIFY PENALTIES VS WALLET RELATIONSHIP
-- ============================================================================

-- Add comprehensive comments to rider_wallet table
COMMENT ON TABLE rider_wallet IS 'Unified wallet for riders with aggregated totals per service. This table stores the CURRENT BALANCE and TOTALS, not individual transactions. Individual penalty records are in rider_penalties table. When a penalty in rider_penalties is paid (status=paid), it is deducted from this wallet.';
COMMENT ON COLUMN rider_wallet.total_balance IS 'Total wallet balance = (sum of all service earnings) - (sum of all service penalties) - (total withdrawals). This is the amount rider can withdraw.';
COMMENT ON COLUMN rider_wallet.earnings_food IS 'Total earnings from food service (aggregated). Individual earning transactions are in wallet_ledger.';
COMMENT ON COLUMN rider_wallet.earnings_parcel IS 'Total earnings from parcel service (aggregated). Individual earning transactions are in wallet_ledger.';
COMMENT ON COLUMN rider_wallet.earnings_person_ride IS 'Total earnings from person_ride service (aggregated). Individual earning transactions are in wallet_ledger.';
COMMENT ON COLUMN rider_wallet.penalties_food IS 'Total penalties from food service (aggregated). Individual penalty records are in rider_penalties table. When a penalty is paid, it is added to this total and deducted from total_balance.';
COMMENT ON COLUMN rider_wallet.penalties_parcel IS 'Total penalties from parcel service (aggregated). Individual penalty records are in rider_penalties table.';
COMMENT ON COLUMN rider_wallet.penalties_person_ride IS 'Total penalties from person_ride service (aggregated). Individual penalty records are in rider_penalties table.';
COMMENT ON COLUMN rider_wallet.total_withdrawn IS 'Total amount withdrawn from wallet (from total_balance, not per service). Withdrawals are tracked in withdrawal_requests table.';

-- Add relationship documentation comment
COMMENT ON TABLE rider_penalties IS 'Individual penalty records per service type. RELATIONSHIP WITH WALLET: When a penalty is created, it is added to rider_penalties with status=active. When the penalty is paid (deducted from wallet), status is updated to paid and the amount is deducted from rider_wallet.total_balance and the service-specific penalty field (penalties_food, penalties_parcel, or penalties_person_ride). The wallet_ledger table also records the penalty transaction.';

-- ============================================================================
-- 7. RECREATE BLACKLIST_CURRENT_STATUS VIEW (was dropped earlier)
-- ============================================================================

-- Recreate the view that was dropped earlier (now with enum type)
CREATE OR REPLACE VIEW blacklist_current_status AS
SELECT DISTINCT ON (rider_id, service_type)
  rider_id,
  service_type,
  banned AS is_banned,
  reason,
  is_permanent,
  expires_at,
  admin_user_id,
  created_at AS blacklisted_at
FROM blacklist_history
WHERE banned = TRUE
  AND (is_permanent = TRUE OR expires_at IS NULL OR expires_at > NOW())
ORDER BY rider_id, service_type, created_at DESC;

COMMENT ON VIEW blacklist_current_status IS 'Current blacklist status per service for each rider. Shows most recent active blacklist entry (permanent or not expired).';

-- ============================================================================
-- 8. CREATE VIEW FOR CURRENT DUTY STATUS PER SERVICE
-- ============================================================================

-- View to get current online status per service for each rider
CREATE OR REPLACE VIEW duty_current_status AS
SELECT DISTINCT ON (rider_id, service_type)
  rider_id,
  service_type,
  status AS is_online,
  vehicle_id,
  lat,
  lon,
  session_id,
  device_id,
  timestamp AS last_status_change
FROM (
  SELECT 
    rider_id,
    jsonb_array_elements_text(COALESCE(service_types, '[]'::jsonb)) AS service_type,
    status,
    vehicle_id,
    lat,
    lon,
    session_id,
    device_id,
    timestamp
  FROM duty_logs
  WHERE status = 'ON'
    AND service_types IS NOT NULL
    AND jsonb_array_length(service_types) > 0
) AS expanded
ORDER BY rider_id, service_type, timestamp DESC;

COMMENT ON VIEW duty_current_status IS 'Current online status per service for each rider. Shows which services each rider is currently online for. If rider is not in this view for a service, they are offline for that service.';

-- ============================================================================
-- 9. UPDATE FUNCTION TO CALCULATE DUTY HOURS PER SERVICE
-- ============================================================================

-- Enhanced function to calculate duty hours per service
CREATE OR REPLACE FUNCTION calculate_rider_duty_hours_by_service(
  p_rider_id INTEGER,
  p_service_type TEXT, -- 'food', 'parcel', 'person_ride', or NULL for all services
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS NUMERIC AS $$
DECLARE
  total_seconds NUMERIC := 0;
  current_status TEXT;
  status_start_time TIMESTAMP WITH TIME ZONE;
  log_record RECORD;
  service_in_array BOOLEAN;
BEGIN
  -- Get all duty logs in the time period, ordered by timestamp
  FOR log_record IN
    SELECT status, timestamp, service_types
    FROM duty_logs
    WHERE rider_id = p_rider_id
      AND timestamp >= p_start_date
      AND timestamp <= p_end_date
    ORDER BY timestamp ASC
  LOOP
    -- Check if service_type is in the service_types JSONB array (or if p_service_type is NULL, count all)
    IF p_service_type IS NULL THEN
      service_in_array := TRUE; -- Count all services
    ELSIF log_record.service_types IS NULL OR jsonb_array_length(log_record.service_types) = 0 THEN
      service_in_array := FALSE;
    ELSE
      service_in_array := (p_service_type IN (SELECT jsonb_array_elements_text(COALESCE(log_record.service_types, '[]'::jsonb))));
    END IF;
    
    -- Only process if service is in the array
    IF service_in_array THEN
      -- If this is the first log or status changed to ON, start tracking
      IF current_status IS NULL OR (current_status != 'ON' AND log_record.status = 'ON') THEN
        current_status := log_record.status;
        status_start_time := log_record.timestamp;
      ELSIF current_status = 'ON' AND log_record.status != 'ON' THEN
        -- Status changed from ON to OFF, calculate duration
        total_seconds := total_seconds + EXTRACT(EPOCH FROM (log_record.timestamp - status_start_time));
        current_status := log_record.status;
        status_start_time := log_record.timestamp;
      END IF;
    END IF;
  END LOOP;
  
  -- If still ON at end of period, calculate until end_date
  IF current_status = 'ON' AND status_start_time IS NOT NULL THEN
    total_seconds := total_seconds + EXTRACT(EPOCH FROM (p_end_date - status_start_time));
  END IF;
  
  -- Convert seconds to hours (with 2 decimal places)
  RETURN ROUND(total_seconds / 3600.0, 2);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_rider_duty_hours_by_service IS 'Calculates total duty hours for a rider in a given time period, optionally filtered by service type. If p_service_type is NULL, calculates for all services combined.';

-- ============================================================================
-- 10. ADD CONSTRAINT TO ENSURE SERVICE_TYPES IS NOT EMPTY WHEN STATUS=ON
-- ============================================================================

-- Add check constraint to ensure service_types is not empty when status=ON
-- Use NOT VALID so existing rows are not checked (avoids migration failure on legacy data)
ALTER TABLE duty_logs
  DROP CONSTRAINT IF EXISTS duty_logs_service_types_check;

ALTER TABLE duty_logs
  ADD CONSTRAINT duty_logs_service_types_check 
  CHECK (
    (status = 'ON' AND COALESCE(jsonb_array_length(service_types), 0) > 0) OR 
    (status != 'ON')
  ) NOT VALID;

COMMENT ON CONSTRAINT duty_logs_service_types_check ON duty_logs IS 'Ensures that when rider is online (status=ON), service_types array contains at least one service type. When rider is offline, service_types can be empty.';

-- ============================================================================
-- 11. SUMMARY COMMENTS
-- ============================================================================

-- Add summary comment at the end
COMMENT ON SCHEMA public IS 'Rider Domain Schema Clarifications:
1. DUTY_LOGS: Tracks service-specific online status. When rider goes online, service_types array contains which services they are available for.
2. RIDER_PENALTIES: Individual penalty records. When penalty is paid, it is deducted from rider_wallet.
3. RIDER_WALLET: Aggregated totals per service. Individual transactions are in wallet_ledger.
4. RIDER_VEHICLES: Use registration_number consistently (official RC number).
5. All enums are now properly defined for type safety and data integrity.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
