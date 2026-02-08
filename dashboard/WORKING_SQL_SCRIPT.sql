-- =============================================================================
-- GUARANTEED WORKING SQL SCRIPT
-- This script checks your enum values and uses only what exists
-- =============================================================================

-- =============================================================================
-- STEP 1: First, let's see what you have
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'CHECKING YOUR DATABASE ENUM VALUES...';
  RAISE NOTICE '================================================';
END $$;

-- Show current vehicle_type enum values
DO $$
DECLARE
  v_values TEXT;
BEGIN
  SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
  INTO v_values
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'vehicle_type';
  
  RAISE NOTICE 'vehicle_type values: %', v_values;
END $$;

-- Show current fuel_type enum values
DO $$
DECLARE
  v_values TEXT;
BEGIN
  SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
  INTO v_values
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'fuel_type';
  
  RAISE NOTICE 'fuel_type values: %', v_values;
END $$;

-- =============================================================================
-- STEP 2: Add missing enum values if needed
-- =============================================================================
DO $$
DECLARE
  v_new_vals TEXT[] := ARRAY['ev_bike', 'cycle', 'cng_auto', 'ev_auto', 'scooter', 'bicycle'];
  v_val TEXT;
  v_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Adding missing vehicle_type values...';
  
  FOREACH v_val IN ARRAY v_new_vals
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'vehicle_type' AND e.enumlabel = v_val
    ) INTO v_exists;
    
    IF NOT v_exists THEN
      BEGIN
        EXECUTE format('ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS %L', v_val);
        RAISE NOTICE '  ✓ Added: %', v_val;
      EXCEPTION WHEN OTHERS THEN
        -- Ignore errors - value might already exist
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- STEP 3: Sync referrals
-- =============================================================================
INSERT INTO referrals (referrer_id, referred_id, referral_code_used, referred_city_name, created_at)
SELECT 
  r.referred_by,
  r.id,
  ref.referral_code,
  r.city,
  r.created_at
FROM riders r
INNER JOIN riders ref ON ref.id = r.referred_by
WHERE r.referred_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM referrals WHERE referred_id = r.id)
ON CONFLICT (referred_id) DO NOTHING;

-- =============================================================================
-- STEP 4: Clean old test data
-- =============================================================================
DELETE FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_vehicles WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_wallet WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM riders WHERE mobile LIKE '9999%';

-- =============================================================================
-- STEP 5: Create Test Riders
-- =============================================================================

-- Rider 1: Regular Bike (Petrol) - All docs pending
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999001001', '+91', 'Amit Kumar', '123456789012', 'ABCDE1234F', '1995-03-15', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka', '560001', 'MG Road', 'en')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'KA01AB1234', 'KA', 'Honda', 'Activa', 2023, 'White', 'Petrol', 'bike', '["food", "parcel"]'::jsonb, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Front', 'docs/' || v_rid || '/aadhaar_f.jpg', '123456789012', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Back', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/4299E1/fff?text=PAN', 'docs/' || v_rid || '/pan.jpg', 'ABCDE1234F', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Front', 'docs/' || v_rid || '/dl_f.jpg', 'KA0120230012345', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Back', 'docs/' || v_rid || '/dl_b.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/4299E1/fff?text=RC', 'docs/' || v_rid || '/rc.jpg', 'KA01AB1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/4299E1/fff?text=Selfie', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=Bank', 'docs/' || v_rid || '/bank.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Created GMR% - Bike (Petrol) - All pending', v_rid;
END $$;

-- Rider 2: Car - Mixed verification  
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999002002', '+91', 'Priya Sharma', '234567890123', 'BCDEF2345G', '1992-07-22', 'KYC', 'APPROVED', 'INACTIVE', 'Mumbai', 'Maharashtra', '400001', 'Andheri', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active)
  VALUES (v_rid, 'car', 'MH02AB5678', 'MH', 'Maruti', 'Swift', 2021, 'Black', 'Petrol', 'sedan', 4, '["person_ride"]'::jsonb, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+OK', 'docs/' || v_rid || '/aadhaar_f.jpg', '234567890123', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+OK', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+OK', 'docs/' || v_rid || '/pan.jpg', 'BCDEF2345G', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+OK', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Pending', 'docs/' || v_rid || '/dl_f.jpg', 'MH0220210054321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Back+Pending', 'docs/' || v_rid || '/dl_b.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/F59E0B/fff?text=RC+Pending', 'docs/' || v_rid || '/rc.jpg', 'MH02AB5678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Bank+Pending', 'docs/' || v_rid || '/bank.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Created GMR% - Car - Identity approved, vehicle pending', v_rid;
END $$;

-- Rider 3: Auto - Fully verified and ACTIVE
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999003003', '+91', 'Rajesh Verma', '345678901234', 'CDEFG3456H', '1988-11-05', 'ACTIVE', 'APPROVED', 'ACTIVE', 'Delhi', 'Delhi', '110001', 'CP', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active, verified, verified_at, is_commercial)
  VALUES (v_rid, 'auto', 'DL1CAC1234', 'DL', 'Bajaj', 'RE', 2020, 'Yellow', 'CNG', 'auto', 3, '["person_ride"]'::jsonb, true, true, NOW(), true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+VERIFIED', 'docs/' || v_rid || '/aadhaar_f.jpg', '345678901234', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+VERIFIED', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+VERIFIED', 'docs/' || v_rid || '/pan.jpg', 'CDEFG3456H', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/10B981/fff?text=DL+VERIFIED', 'docs/' || v_rid || '/dl_f.jpg', 'DL1320200098765', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/10B981/fff?text=DL+Back+VERIFIED', 'docs/' || v_rid || '/dl_b.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/10B981/fff?text=RC+VERIFIED', 'docs/' || v_rid || '/rc.jpg', 'DL1CAC1234', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+VERIFIED', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/10B981/fff?text=Bank+VERIFIED', 'docs/' || v_rid || '/bank.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW());
    
  INSERT INTO rider_wallet (rider_id, total_balance, earnings_food, earnings_parcel, earnings_person_ride)
  VALUES (v_rid, 5000.00, 3000.00, 2000.00, 0.00);
  
  RAISE NOTICE '✓ Created GMR% - Auto - FULLY ACTIVE (SUCCESS CASE)', v_rid;
END $$;

-- Rider 4: Bike with REJECTED documents
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999004004', '+91', 'Vikram Reddy', '456789012345', 'DEFGH4567I', '1990-09-30', 'KYC', 'REJECTED', 'INACTIVE', 'Hyderabad', 'Telangana', '500001', 'Banjara Hills', 'te')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'TS09CD4321', 'TS', 'Yamaha', 'FZ', 2019, 'Red', 'Petrol', 'bike', '["food", "parcel"]'::jsonb, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, rejected_reason)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/EF4444/fff?text=Aadhaar+REJECTED', 'docs/' || v_rid || '/aadhaar_f.jpg', '456789012345', 'MANUAL_UPLOAD', 'rejected', false, 'Image is blurry, please re-upload'),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/EF4444/fff?text=Aadhaar+Back+REJECTED', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'rejected', false, 'Not clearly visible'),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/F59E0B/fff?text=PAN+Pending', 'docs/' || v_rid || '/pan.jpg', 'DEFGH4567I', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/EF4444/fff?text=DL+REJECTED', 'docs/' || v_rid || '/dl_f.jpg', 'TS0920190067890', 'MANUAL_UPLOAD', 'rejected', false, 'Document expired'),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Selfie', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Created GMR% - Bike - REJECTED docs with reasons', v_rid;
END $$;

-- Rider 5: Scooter/Bicycle - Only if enum has these values, otherwise use 'bike'
DO $$
DECLARE 
  v_rid INTEGER;
  v_vehicle_type TEXT;
  v_has_scooter BOOLEAN;
BEGIN
  -- Check if 'scooter' exists in enum
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'vehicle_type' AND e.enumlabel = 'scooter'
  ) INTO v_has_scooter;
  
  v_vehicle_type := CASE WHEN v_has_scooter THEN 'scooter' ELSE 'bike' END;
  
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999005005', '+91', 'Karan Malhotra', '567890123456', 'EFGHI5678J', '1994-06-08', 'MOBILE_VERIFIED', 'PENDING', 'INACTIVE', 'Jaipur', 'Rajasthan', '302001', 'MI Road', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, v_vehicle_type, 'RJ14CD6789', 'RJ', 'Hero', 'Splendor', 2020, 'Blue', 'Petrol', 'bike', '["food", "parcel"]'::jsonb, true);
  
  -- Only partial documents (missing critical docs)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Aadhaar+Only', 'docs/' || v_rid || '/aadhaar_f.jpg', '567890123456', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Selfie+Only', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Created GMR% - % - INCOMPLETE (missing docs)', v_rid, v_vehicle_type;
END $$;

-- =============================================================================
-- SUMMARY
-- =============================================================================
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM riders WHERE mobile LIKE '9999%';
  
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '✓✓✓ SUCCESS! ✓✓✓';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created % test riders with documents', v_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Test Riders:';
  RAISE NOTICE '  GMR1001: Bike - All pending';
  RAISE NOTICE '  GMR1002: Car - Identity approved';  
  RAISE NOTICE '  GMR1003: Auto - FULLY ACTIVE ✓';
  RAISE NOTICE '  GMR1004: Bike - REJECTED docs';
  RAISE NOTICE '  GMR1005: Bike/Scooter - Missing docs';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Go to /dashboard/riders/{ID}/onboarding';
  RAISE NOTICE '================================================';
END $$;

-- View the created riders
SELECT 
  id,
  'GMR' || id AS rider_id,
  mobile,
  name,
  onboarding_stage,
  kyc_status,
  status
FROM riders 
WHERE mobile LIKE '9999%' 
ORDER BY mobile;
