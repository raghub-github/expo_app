-- ============================================================================
-- Rider Domain Schema Enhancements
-- Migration: 0060_rider_domain_enhancements
-- 
-- This migration enhances the rider domain schema to support:
-- 1. Service-specific blacklist/whitelist (food, parcel, person_ride) with current status tracking
-- 2. Penalties table with service-type support
-- 3. Enhanced vehicle information (fuel type, category, AC type, service types)
-- 4. Vehicle choice tracking during onboarding
-- 5. Enhanced document verification logic support
-- 6. Unified wallet management with service-specific earnings tracking
-- 7. Duty logs tracking for calculating duty hours (day/week/month)
-- 8. Blacklist/whitelist history with current status view
--
-- IMPORTANT: This is a non-breaking migration - adds new columns with defaults
-- IMPORTANT: Duty logs should be created every time rider goes online/offline
-- IMPORTANT: Wallet is unified - withdrawals are from total balance, not per service
-- ============================================================================

-- ============================================================================
-- 1. ENHANCE RIDERS TABLE
-- ============================================================================

-- Add vehicle choice (temporary during onboarding)
ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS vehicle_choice TEXT, -- 'EV' or 'Petrol'
  ADD COLUMN IF NOT EXISTS preferred_service_types JSONB DEFAULT '[]'::jsonb; -- ['food', 'parcel', 'person_ride']

-- Add index for vehicle choice
CREATE INDEX IF NOT EXISTS riders_vehicle_choice_idx ON riders(vehicle_choice) WHERE vehicle_choice IS NOT NULL;

-- ============================================================================
-- 2. ENHANCE BLACKLIST_HISTORY TABLE
-- ============================================================================

-- Add service-specific blacklist support
ALTER TABLE blacklist_history
  ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'all', -- 'food', 'parcel', 'person_ride', 'all'
  ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE; -- For temporary blacklists

-- Add indexes for service-specific queries
CREATE INDEX IF NOT EXISTS blacklist_history_service_type_idx ON blacklist_history(service_type);
CREATE INDEX IF NOT EXISTS blacklist_history_rider_service_idx ON blacklist_history(rider_id, service_type);
CREATE INDEX IF NOT EXISTS blacklist_history_expires_at_idx ON blacklist_history(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 3. CREATE RIDER_PENALTIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rider_penalties (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  service_type order_type NOT NULL, -- 'food', 'parcel', 'person_ride'
  penalty_type TEXT NOT NULL, -- 'late_delivery', 'customer_complaint', 'fraud', 'cancellation', etc.
  amount NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'reversed', 'paid'
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  imposed_by INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  imposed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for penalties
CREATE INDEX IF NOT EXISTS rider_penalties_rider_id_idx ON rider_penalties(rider_id);
CREATE INDEX IF NOT EXISTS rider_penalties_service_type_idx ON rider_penalties(service_type);
CREATE INDEX IF NOT EXISTS rider_penalties_status_idx ON rider_penalties(status);
CREATE INDEX IF NOT EXISTS rider_penalties_order_id_idx ON rider_penalties(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rider_penalties_imposed_at_idx ON rider_penalties(imposed_at);
CREATE INDEX IF NOT EXISTS rider_penalties_rider_service_idx ON rider_penalties(rider_id, service_type);

-- ============================================================================
-- 4. ENHANCE RIDER_VEHICLES TABLE (if exists, else create)
-- ============================================================================

-- Check if table exists, if not create it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rider_vehicles') THEN
    CREATE TABLE rider_vehicles (
      id BIGSERIAL PRIMARY KEY,
      rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
      vehicle_type TEXT NOT NULL, -- 'bike', 'car', 'bicycle', 'scooter', 'auto'
      registration_number TEXT NOT NULL,
      make TEXT, -- e.g., 'Honda', 'Hero'
      model TEXT, -- e.g., 'Activa', 'Splendor'
      year INTEGER,
      color TEXT,
      insurance_expiry DATE,
      rc_document_url TEXT,
      insurance_document_url TEXT,
      verified BOOLEAN DEFAULT FALSE,
      verified_at TIMESTAMP WITH TIME ZONE,
      verified_by INTEGER, -- Admin user ID
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Add new columns to existing rider_vehicles table
ALTER TABLE rider_vehicles
  ADD COLUMN IF NOT EXISTS fuel_type TEXT, -- 'EV', 'Petrol', 'Diesel', 'CNG'
  ADD COLUMN IF NOT EXISTS vehicle_category TEXT, -- 'Auto', 'Bike', 'Cab', 'Taxi', 'Bicycle', 'Scooter'
  ADD COLUMN IF NOT EXISTS ac_type TEXT, -- 'AC', 'Non-AC' (for person_ride)
  ADD COLUMN IF NOT EXISTS service_types JSONB DEFAULT '[]'::jsonb; -- Array: ['food', 'parcel', 'person_ride']

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS rider_vehicles_fuel_type_idx ON rider_vehicles(fuel_type) WHERE fuel_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS rider_vehicles_vehicle_category_idx ON rider_vehicles(vehicle_category) WHERE vehicle_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS rider_vehicles_service_types_idx ON rider_vehicles USING GIN(service_types);

-- Ensure unique constraint for one active vehicle per rider (if not exists)
-- Check for index existence, not constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'rider_vehicles_rider_active_idx'
  ) THEN
    CREATE UNIQUE INDEX rider_vehicles_rider_active_idx 
    ON rider_vehicles(rider_id) 
    WHERE is_active = TRUE;
  END IF;
END $$;

-- ============================================================================
-- 5. ENHANCE RIDER_DOCUMENTS TABLE
-- ============================================================================

-- Add vehicle_id reference (link RC document to vehicle)
ALTER TABLE rider_documents
  ADD COLUMN IF NOT EXISTS vehicle_id BIGINT; -- Link RC document to vehicle

-- Create index for vehicle_id
CREATE INDEX IF NOT EXISTS rider_documents_vehicle_id_idx ON rider_documents(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- Add comment for doc_number requirement
COMMENT ON COLUMN rider_documents.doc_number IS 'Document identification number - REQUIRED for RC and DL documents';

-- ============================================================================
-- 6. UPDATE EXISTING DATA (if any)
-- ============================================================================

-- Set default service_type for existing blacklist_history records (only if column was just added)
-- This is safe to run multiple times as it only updates NULL/empty values
UPDATE blacklist_history 
SET service_type = 'all' 
WHERE service_type IS NULL OR service_type = '';

-- Set default is_permanent for existing blacklist_history records (only if column was just added)
-- This is safe to run multiple times as it only updates NULL values
UPDATE blacklist_history 
SET is_permanent = FALSE 
WHERE is_permanent IS NULL;

-- ============================================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE rider_penalties IS 'Tracks penalties per service type (food, parcel, person_ride) for each rider';
COMMENT ON COLUMN rider_penalties.service_type IS 'Service type: food, parcel, or person_ride';
COMMENT ON COLUMN rider_penalties.status IS 'Penalty status: active (pending payment), reversed (cancelled), paid (deducted from wallet)';

COMMENT ON TABLE rider_vehicles IS 'Stores vehicle information for riders with enhanced fields for service matching';
COMMENT ON COLUMN rider_vehicles.fuel_type IS 'Fuel type: EV, Petrol, Diesel, CNG';
COMMENT ON COLUMN rider_vehicles.vehicle_category IS 'Vehicle category: Auto, Bike, Cab, Taxi, Bicycle, Scooter';
COMMENT ON COLUMN rider_vehicles.ac_type IS 'AC type: AC or Non-AC (for person_ride service)';
COMMENT ON COLUMN rider_vehicles.service_types IS 'Array of service types this vehicle can serve: [food, parcel, person_ride]';

COMMENT ON COLUMN blacklist_history.service_type IS 'Service type for blacklist: food, parcel, person_ride, or all';
COMMENT ON COLUMN blacklist_history.is_permanent IS 'Whether blacklist is permanent (true) or temporary (false)';
COMMENT ON COLUMN blacklist_history.expires_at IS 'Expiration timestamp for temporary blacklists';

COMMENT ON COLUMN riders.vehicle_choice IS 'Vehicle choice during onboarding: EV or Petrol (temporary, will be moved to rider_vehicles)';
COMMENT ON COLUMN riders.preferred_service_types IS 'Array of preferred service types: [food, parcel, person_ride]';

-- ============================================================================
-- 8. ENHANCE DUTY_LOGS TABLE (Ensure proper tracking)
-- ============================================================================

-- Verify duty_logs table structure (should already exist)
-- Add comment to ensure it's used for tracking every ON/OFF transition
COMMENT ON TABLE duty_logs IS 'Tracks every ON/OFF duty status change for riders. Used to calculate total duty active time for day/week/month. Every time rider goes online or offline, a new entry should be created.';

-- Add index for efficient duty time calculations
CREATE INDEX IF NOT EXISTS duty_logs_rider_timestamp_idx ON duty_logs(rider_id, timestamp DESC);

-- ============================================================================
-- 9. CREATE RIDER_WALLET TABLE (Unified wallet with service-specific earnings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rider_wallet (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL UNIQUE REFERENCES riders(id) ON DELETE CASCADE,
  total_balance NUMERIC(10, 2) NOT NULL DEFAULT 0, -- Total balance (sum of all services)
  -- Service-specific earnings (separate tracking)
  earnings_food NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_parcel NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_person_ride NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Service-specific penalties
  penalties_food NUMERIC(10, 2) NOT NULL DEFAULT 0,
  penalties_parcel NUMERIC(10, 2) NOT NULL DEFAULT 0,
  penalties_person_ride NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Withdrawals (from total balance, not per service)
  total_withdrawn NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Metadata
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes (rider_id is already unique, so we don't need a separate index for it)
-- The unique constraint on rider_id already creates an index
CREATE INDEX IF NOT EXISTS rider_wallet_total_balance_idx ON rider_wallet(total_balance);

-- ============================================================================
-- 10. ENHANCE WALLET_LEDGER TABLE (Add service_type support)
-- ============================================================================

-- Add service_type to wallet_ledger for service-specific tracking
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS service_type TEXT; -- 'food', 'parcel', 'person_ride', NULL for non-service-specific entries

-- Add index for service-specific queries
CREATE INDEX IF NOT EXISTS wallet_ledger_service_type_idx ON wallet_ledger(service_type) WHERE service_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_ledger_rider_service_idx ON wallet_ledger(rider_id, service_type) WHERE service_type IS NOT NULL;

-- ============================================================================
-- 11. CREATE BLACKLIST_CURRENT_STATUS VIEW (Current status per service)
-- ============================================================================

-- Create a view to get current blacklist status per service
-- This view shows the most recent blacklist entry per service for each rider
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

-- Create index to support the view
CREATE INDEX IF NOT EXISTS blacklist_history_rider_service_created_idx 
ON blacklist_history(rider_id, service_type, created_at DESC);

-- ============================================================================
-- 12. CREATE FUNCTION TO CALCULATE DUTY HOURS
-- ============================================================================

-- Function to calculate total duty hours for a rider in a time period
CREATE OR REPLACE FUNCTION calculate_rider_duty_hours(
  p_rider_id INTEGER,
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS NUMERIC AS $$
DECLARE
  total_seconds NUMERIC := 0;
  current_status TEXT;
  status_start_time TIMESTAMP WITH TIME ZONE;
  log_record RECORD;
BEGIN
  -- Get all duty logs in the time period, ordered by timestamp
  FOR log_record IN
    SELECT status, timestamp
    FROM duty_logs
    WHERE rider_id = p_rider_id
      AND timestamp >= p_start_date
      AND timestamp <= p_end_date
    ORDER BY timestamp ASC
  LOOP
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
  END LOOP;
  
  -- If still ON at end of period, calculate until end_date
  IF current_status = 'ON' AND status_start_time IS NOT NULL THEN
    total_seconds := total_seconds + EXTRACT(EPOCH FROM (p_end_date - status_start_time));
  END IF;
  
  -- Convert seconds to hours (with 2 decimal places)
  RETURN ROUND(total_seconds / 3600.0, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. CREATE FUNCTION TO UPDATE RIDER WALLET
-- ============================================================================

-- Function to update rider wallet when earnings/penalties are added
CREATE OR REPLACE FUNCTION update_rider_wallet(
  p_rider_id INTEGER,
  p_service_type TEXT, -- 'food', 'parcel', 'person_ride', or NULL
  p_amount NUMERIC,
  p_entry_type TEXT -- 'earning', 'penalty', 'withdrawal', etc.
)
RETURNS VOID AS $$
DECLARE
  current_balance NUMERIC;
BEGIN
  -- Insert or update wallet record
  INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
  VALUES (p_rider_id, 0, NOW())
  ON CONFLICT (rider_id) DO NOTHING;
  
  -- Update service-specific earnings/penalties
  IF p_entry_type = 'earning' AND p_service_type IS NOT NULL THEN
    IF p_service_type = 'food' THEN
      UPDATE rider_wallet 
      SET earnings_food = earnings_food + p_amount,
          total_balance = total_balance + p_amount,
          last_updated_at = NOW()
      WHERE rider_id = p_rider_id;
    ELSIF p_service_type = 'parcel' THEN
      UPDATE rider_wallet 
      SET earnings_parcel = earnings_parcel + p_amount,
          total_balance = total_balance + p_amount,
          last_updated_at = NOW()
      WHERE rider_id = p_rider_id;
    ELSIF p_service_type = 'person_ride' THEN
      UPDATE rider_wallet 
      SET earnings_person_ride = earnings_person_ride + p_amount,
          total_balance = total_balance + p_amount,
          last_updated_at = NOW()
      WHERE rider_id = p_rider_id;
    END IF;
  ELSIF p_entry_type = 'penalty' AND p_service_type IS NOT NULL THEN
    IF p_service_type = 'food' THEN
      UPDATE rider_wallet 
      SET penalties_food = penalties_food + p_amount,
          total_balance = total_balance - p_amount,
          last_updated_at = NOW()
      WHERE rider_id = p_rider_id;
    ELSIF p_service_type = 'parcel' THEN
      UPDATE rider_wallet 
      SET penalties_parcel = penalties_parcel + p_amount,
          total_balance = total_balance - p_amount,
          last_updated_at = NOW()
      WHERE rider_id = p_rider_id;
    ELSIF p_service_type = 'person_ride' THEN
      UPDATE rider_wallet 
      SET penalties_person_ride = penalties_person_ride + p_amount,
          total_balance = total_balance - p_amount,
          last_updated_at = NOW()
      WHERE rider_id = p_rider_id;
    END IF;
  ELSIF p_entry_type = 'withdrawal' THEN
    -- Withdrawal from total balance (not service-specific)
    UPDATE rider_wallet 
    SET total_withdrawn = total_withdrawn + ABS(p_amount),
        total_balance = total_balance - ABS(p_amount),
        last_updated_at = NOW()
    WHERE rider_id = p_rider_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. CREATE TRIGGER TO AUTO-UPDATE WALLET ON LEDGER INSERT
-- ============================================================================

-- Trigger function to automatically update rider_wallet when wallet_ledger entry is created
CREATE OR REPLACE FUNCTION trigger_update_wallet_from_ledger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update wallet for earnings and penalties (withdrawals handled separately)
  IF NEW.entry_type IN ('earning', 'penalty') THEN
    PERFORM update_rider_wallet(
      NEW.rider_id,
      NEW.service_type,
      CASE 
        WHEN NEW.entry_type = 'earning' THEN NEW.amount
        WHEN NEW.entry_type = 'penalty' THEN -NEW.amount
        ELSE 0
      END,
      NEW.entry_type::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS wallet_ledger_update_wallet_trigger ON wallet_ledger;
CREATE TRIGGER wallet_ledger_update_wallet_trigger
  AFTER INSERT ON wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_wallet_from_ledger();

-- ============================================================================
-- 15. ADD COMMENTS FOR NEW TABLES AND FUNCTIONS
-- ============================================================================

COMMENT ON TABLE rider_wallet IS 'Unified wallet for riders with total balance and service-specific earnings tracking. Total balance is sum of all service earnings minus penalties. Withdrawals are from total balance, not per service.';
COMMENT ON COLUMN rider_wallet.total_balance IS 'Total wallet balance (sum of all service earnings minus penalties minus withdrawals)';
COMMENT ON COLUMN rider_wallet.earnings_food IS 'Total earnings from food service';
COMMENT ON COLUMN rider_wallet.earnings_parcel IS 'Total earnings from parcel service';
COMMENT ON COLUMN rider_wallet.earnings_person_ride IS 'Total earnings from person_ride service';
COMMENT ON COLUMN rider_wallet.penalties_food IS 'Total penalties from food service';
COMMENT ON COLUMN rider_wallet.penalties_parcel IS 'Total penalties from parcel service';
COMMENT ON COLUMN rider_wallet.penalties_person_ride IS 'Total penalties from person_ride service';
COMMENT ON COLUMN rider_wallet.total_withdrawn IS 'Total amount withdrawn (from total balance, not per service)';

COMMENT ON COLUMN wallet_ledger.service_type IS 'Service type for earnings/penalties: food, parcel, person_ride, or NULL for non-service-specific entries';

COMMENT ON VIEW blacklist_current_status IS 'Current blacklist status per service for each rider. Shows most recent active blacklist entry (permanent or not expired).';

COMMENT ON FUNCTION calculate_rider_duty_hours IS 'Calculates total duty hours (time spent with status ON) for a rider in a given time period. Used for daily/weekly/monthly duty time calculations.';

COMMENT ON FUNCTION update_rider_wallet IS 'Updates rider wallet when earnings, penalties, or withdrawals are added. Automatically updates service-specific amounts and total balance.';

-- ============================================================================
-- 16. INITIALIZE WALLET FOR EXISTING RIDERS (Optional - can be run separately)
-- ============================================================================

-- Create wallet records for existing riders with zero balance
-- This can be run separately if needed
-- INSERT INTO rider_wallet (rider_id, total_balance)
-- SELECT id, 0 FROM riders
-- WHERE id NOT IN (SELECT rider_id FROM rider_wallet)
-- ON CONFLICT (rider_id) DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
