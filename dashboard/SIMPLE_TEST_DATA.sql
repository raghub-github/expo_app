-- =============================================================================
-- SIMPLE TEST DATA - USING ONLY BASIC ENUM VALUES
-- This uses ONLY the basic values that should exist in any database
-- =============================================================================

-- Clean up old test data
DELETE FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_vehicles WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_wallet WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM riders WHERE mobile LIKE '9999%');

-- =============================================================================
-- TEST RIDER 1: BIKE (BASIC) - ALL DOCS PENDING
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999001001', '+91', 'Amit Kumar', '123456789012', 'ABCDE1234F', '1995-03-15', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka', '560001', 'MG Road, Bangalore', 'en')
  RETURNING id INTO v_rid;
  
  -- Using 'bike' which should exist in all databases
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'KA01AB1234', 'KA', 'Honda', 'Activa', 2023, 'White', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Front', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '123456789012', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Back', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/4299E1/fff?text=PAN', 'docs/rider_' || v_rid || '/pan.jpg', 'ABCDE1234F', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Front', 'docs/rider_' || v_rid || '/dl_front.jpg', 'KA0120230012345', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Back', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/4299E1/fff?text=RC', 'docs/rider_' || v_rid || '/rc.jpg', 'KA01AB1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/4299E1/fff?text=Selfie', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=Bank', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 1 (GMR%) - Bike - All docs PENDING', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 2: CAR - MIXED VERIFICATION
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999002002', '+91', 'Priya Sharma', '234567890123', 'BCDEF2345G', '1992-07-22', 'KYC', 'APPROVED', 'INACTIVE', 'Mumbai', 'Maharashtra', '400001', 'Andheri, Mumbai', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'car', 'MH02AB5678', 'MH', 'Maruti', 'Swift', 2021, 'Black', 'petrol', 'sedan', ARRAY['person_ride']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+APPROVED', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '234567890123', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+APPROVED', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+APPROVED', 'docs/rider_' || v_rid || '/pan.jpg', 'BCDEF2345G', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+APPROVED', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Pending', 'docs/rider_' || v_rid || '/dl_front.jpg', 'MH0220210054321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Back+Pending', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/F59E0B/fff?text=RC+Pending', 'docs/rider_' || v_rid || '/rc.jpg', 'MH02AB5678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Bank+Pending', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 2 (GMR%) - Car - Identity APPROVED', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 3: AUTO - FULLY VERIFIED
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999003003', '+91', 'Rajesh Verma', '345678901234', 'CDEFG3456H', '1988-11-05', 'ACTIVE', 'APPROVED', 'ACTIVE', 'Delhi', 'Delhi', '110001', 'CP, Delhi', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active, verified, verified_at, is_commercial)
  VALUES (v_rid, 'auto', 'DL1CAC1234', 'DL', 'Bajaj', 'RE', 2020, 'Yellow', 'cng', 'auto', 3, ARRAY['person_ride']::TEXT[], true, true, NOW(), true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+VERIFIED', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '345678901234', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+VERIFIED', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+VERIFIED', 'docs/rider_' || v_rid || '/pan.jpg', 'CDEFG3456H', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/10B981/fff?text=DL+VERIFIED', 'docs/rider_' || v_rid || '/dl_front.jpg', 'DL1320200098765', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/10B981/fff?text=DL+Back+VERIFIED', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/10B981/fff?text=RC+VERIFIED', 'docs/rider_' || v_rid || '/rc.jpg', 'DL1CAC1234', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+VERIFIED', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/10B981/fff?text=Bank+VERIFIED', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW());
    
  INSERT INTO rider_wallet (rider_id, total_balance, earnings_food, earnings_parcel, earnings_person_ride)
  VALUES (v_rid, 5000.00, 3000.00, 2000.00, 0.00);
  
  RAISE NOTICE '✓ Rider 3 (GMR%) - Auto - FULLY ACTIVE', v_rid;
END $$;

-- =============================================================================
-- SUMMARY
-- =============================================================================
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

RAISE NOTICE '✓ Test riders created using basic enum values (bike, car, auto)';
RAISE NOTICE 'Navigate to /dashboard/riders/{ID}/onboarding to test';
