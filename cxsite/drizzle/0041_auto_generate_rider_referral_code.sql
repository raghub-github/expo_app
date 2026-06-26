-- ============================================================================
-- AUTO-GENERATE UNIQUE REFERRAL CODE FOR RIDERS
-- Migration: 0041_auto_generate_rider_referral_code
-- Database: Supabase PostgreSQL
-- 
-- This migration automatically generates a unique referral code for each rider
-- when a new rider is created. The referral code includes both characters and
-- numbers, is unique, and is automatically generated on INSERT.
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE FUNCTION TO GENERATE UNIQUE REFERRAL CODE
-- ============================================================================

-- Function to generate a unique referral code with both characters and numbers
-- Format: RIDER + alphanumeric code (e.g., RIDER1A2B, RIDER3C4D, etc.)
CREATE OR REPLACE FUNCTION generate_unique_rider_referral_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INTEGER := 0;
  v_max_attempts INTEGER := 100;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Excludes confusing chars (0, O, I, 1)
  v_code_length INTEGER := 6; -- Length of random part (total will be "RIDER" + 6 chars = 11 chars)
  v_random_part TEXT := '';
  v_i INTEGER;
BEGIN
  -- Generate referral code with format: RIDER + random alphanumeric
  LOOP
    -- Generate random alphanumeric part
    v_random_part := '';
    FOR v_i IN 1..v_code_length LOOP
      v_random_part := v_random_part || substr(v_chars, floor(random() * length(v_chars) + 1)::INTEGER, 1);
    END LOOP;
    
    -- Combine prefix with random part
    v_code := 'RIDER' || v_random_part;
    
    -- Check if code already exists
    SELECT EXISTS (
      SELECT 1 FROM riders 
      WHERE referral_code = v_code
    ) INTO v_exists;
    
    -- If code doesn't exist, we're done
    EXIT WHEN NOT v_exists;
    
    -- Increment attempts counter
    v_attempts := v_attempts + 1;
    
    -- Safety check to prevent infinite loop
    IF v_attempts >= v_max_attempts THEN
      -- Fallback: Use rider ID + timestamp for uniqueness
      v_code := 'RIDER' || to_char(EXTRACT(EPOCH FROM NOW())::BIGINT, 'FM9999999999') || 
                substr(v_chars, floor(random() * length(v_chars) + 1)::INTEGER, 1);
      EXIT;
    END IF;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: CREATE TRIGGER FUNCTION TO AUTO-GENERATE REFERRAL CODE
-- ============================================================================

-- Function that automatically generates referral code on INSERT if not provided
CREATE OR REPLACE FUNCTION auto_generate_rider_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate referral code if it's NULL or empty
  IF NEW.referral_code IS NULL OR TRIM(NEW.referral_code) = '' THEN
    NEW.referral_code := generate_unique_rider_referral_code();
    RAISE NOTICE 'Auto-generated referral code for rider ID %: %', NEW.id, NEW.referral_code;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: CREATE TRIGGER
-- ============================================================================

-- Drop trigger if exists
DROP TRIGGER IF EXISTS riders_auto_generate_referral_code_trigger ON riders;

-- Create trigger that fires BEFORE INSERT
CREATE TRIGGER riders_auto_generate_referral_code_trigger
  BEFORE INSERT ON riders
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_rider_referral_code();

-- ============================================================================
-- STEP 4: UPDATE EXISTING RIDERS WITHOUT REFERRAL CODES
-- ============================================================================

-- Update existing riders that don't have referral codes
DO $$
DECLARE
  v_rider_record RECORD;
  v_new_code TEXT;
BEGIN
  -- Loop through riders without referral codes
  FOR v_rider_record IN 
    SELECT id FROM riders 
    WHERE referral_code IS NULL OR TRIM(referral_code) = ''
  LOOP
    -- Generate unique referral code
    v_new_code := generate_unique_rider_referral_code();
    
    -- Update the rider with the new referral code
    UPDATE riders
    SET referral_code = v_new_code
    WHERE id = v_rider_record.id;
    
    RAISE NOTICE 'Generated referral code for existing rider ID %: %', v_rider_record.id, v_new_code;
  END LOOP;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION generate_unique_rider_referral_code() IS 'Generates a unique referral code with format RIDER + 6 alphanumeric characters. Excludes confusing characters (0, O, I, 1) for better readability.';
COMMENT ON FUNCTION auto_generate_rider_referral_code() IS 'Trigger function that automatically generates a unique referral code for new riders if one is not provided during INSERT.';
COMMENT ON TRIGGER riders_auto_generate_referral_code_trigger ON riders IS 'Automatically generates a unique referral code (alphanumeric) for each new rider on INSERT if referral_code is NULL or empty.';
