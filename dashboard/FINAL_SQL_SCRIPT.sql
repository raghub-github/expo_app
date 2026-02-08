-- =============================================================================
-- COMPLETE SETUP - FINAL WORKING VERSION
-- Copy this ENTIRE file and paste into Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- PART 1: SYNC REFERRALS
-- =============================================================================
INSERT INTO referrals (referrer_id, referred_id, referral_code_used, referred_city_name, created_at)
SELECT 
  r.referred_by AS referrer_id,
  r.id AS referred_id,
  ref.referral_code AS referral_code_used,
  r.city AS referred_city_name,
  r.created_at
FROM riders r
INNER JOIN riders ref ON ref.id = r.referred_by
WHERE r.referred_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM referrals ref_table WHERE ref_table.referred_id = r.id)
ON CONFLICT (referred_id) DO NOTHING;

-- =============================================================================
-- PART 2: CLEAN UP OLD TEST DATA (optional)
-- =============================================================================
DELETE FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_vehicles WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_wallet WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM riders WHERE mobile LIKE '9999%';

-- =============================================================================
-- TEST RIDER 1: EV BIKE - ALL DOCS PENDING (Test Fresh Verification)
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999001001', '+91', 'Amit Kumar Singh', '123456789012', 'ABCDE1234F', '1995-03-15', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka', '560001', 'MG Road, Bangalore', 'en')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'ev_bike', 'KA01EV1234', 'KA', 'Ather', '450X', 2023, 'White', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Front', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '123456789012', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Back', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/4299E1/fff?text=PAN+Card', 'docs/rider_' || v_rid || '/pan.jpg', 'ABCDE1234F', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Front', 'docs/rider_' || v_rid || '/dl_front.jpg', 'KA0120230012345', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Back', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/4299E1/fff?text=RC+Certificate', 'docs/rider_' || v_rid || '/rc.jpg', 'KA01EV1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/4299E1/fff?text=Selfie', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'ev_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=EV+Proof', 'docs/rider_' || v_rid || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=Bank+Proof', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 1 (GMR%) created: EV Bike - All docs PENDING', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 2: PETROL BIKE - MIXED VERIFICATION (Test Partial Flow)
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999002002', '+91', 'Priya Sharma', '234567890123', 'BCDEF2345G', '1992-07-22', 'KYC', 'APPROVED', 'INACTIVE', 'Mumbai', 'Maharashtra', '400001', 'Andheri East, Mumbai', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'MH02AB5678', 'MH', 'Honda', 'Activa', 2021, 'Black', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+APPROVED', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '234567890123', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+APPROVED', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+APPROVED', 'docs/rider_' || v_rid || '/pan.jpg', 'BCDEF2345G', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Front+Pending', 'docs/rider_' || v_rid || '/dl_front.jpg', 'MH0220210054321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Back+Pending', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/F59E0B/fff?text=RC+Pending', 'docs/rider_' || v_rid || '/rc.jpg', 'MH02AB5678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+APPROVED', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Bank+Pending', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 2 (GMR%) created: Petrol Bike - Identity APPROVED, Vehicle PENDING', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 3: FULLY VERIFIED & ACTIVE (Success Case)
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999003003', '+91', 'Anjali Gupta', '345678901234', 'CDEFG3456H', '1993-12-25', 'ACTIVE', 'APPROVED', 'ACTIVE', 'Pune', 'Maharashtra', '411001', 'Koregaon Park, Pune', 'mr')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active, verified, verified_at)
  VALUES (v_rid, 'ev_bike', 'MH12EV9999', 'MH', 'Bajaj', 'Chetak', 2023, 'Green', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true, true, NOW());
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+VERIFIED', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '345678901234', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+VERIFIED', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+VERIFIED', 'docs/rider_' || v_rid || '/pan.jpg', 'CDEFG3456H', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/10B981/fff?text=DL+VERIFIED', 'docs/rider_' || v_rid || '/dl_front.jpg', 'MH1220230023456', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/10B981/fff?text=DL+Back+VERIFIED', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/10B981/fff?text=RC+VERIFIED', 'docs/rider_' || v_rid || '/rc.jpg', 'MH12EV9999', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+VERIFIED', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'ev_proof', 'https://via.placeholder.com/400x250/10B981/fff?text=EV+Proof+VERIFIED', 'docs/rider_' || v_rid || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/10B981/fff?text=Bank+VERIFIED', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW());
    
  INSERT INTO rider_wallet (rider_id, total_balance, earnings_food, earnings_parcel, earnings_person_ride)
  VALUES (v_rid, 5000.00, 3000.00, 2000.00, 0.00);
  
  RAISE NOTICE '✓ Rider 3 (GMR%) created: FULLY VERIFIED & ACTIVE', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 4: REJECTED DOCUMENTS (Test Rejection Flow)
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999004004', '+91', 'Vikram Reddy', '456789012345', 'DEFGH4567I', '1990-09-30', 'KYC', 'REJECTED', 'INACTIVE', 'Hyderabad', 'Telangana', '500001', 'Banjara Hills, Hyderabad', 'te')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'TS09CD4321', 'TS', 'Yamaha', 'FZ', 2019, 'Red', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, rejected_reason)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/EF4444/fff?text=Aadhaar+REJECTED', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '456789012345', 'MANUAL_UPLOAD', 'rejected', false, 'Image is blurry, please re-upload'),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/EF4444/fff?text=Aadhaar+Back+REJECTED', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'rejected', false, 'Not clearly visible'),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/F59E0B/fff?text=PAN+Pending', 'docs/rider_' || v_rid || '/pan.jpg', 'DEFGH4567I', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/EF4444/fff?text=DL+REJECTED', 'docs/rider_' || v_rid || '/dl_front.jpg', 'TS0920190067890', 'MANUAL_UPLOAD', 'rejected', false, 'Document expired'),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Back+Pending', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/F59E0B/fff?text=RC+Pending', 'docs/rider_' || v_rid || '/rc.jpg', 'TS09CD4321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Selfie+Pending', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 4 (GMR%) created: REJECTED DOCS with reasons', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 5: MISSING CRITICAL DOCS (Test Incomplete)
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999005005', '+91', 'Karan Malhotra', '567890123456', 'EFGHI5678J', '1994-06-08', 'MOBILE_VERIFIED', 'PENDING', 'INACTIVE', 'Jaipur', 'Rajasthan', '302001', 'MI Road, Jaipur', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'RJ14CD6789', 'RJ', 'Hero', 'Splendor Plus', 2020, 'Blue', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Only partial documents uploaded (missing PAN, DL, RC, Bank)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Aadhaar+Only', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '567890123456', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Selfie+Only', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 5 (GMR%) created: MISSING CRITICAL DOCS (incomplete)', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 6: AUTO RICKSHAW - PERSON RIDE SERVICE
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999006006', '+91', 'Rajesh Verma', '678901234567', 'FGHIJ6789K', '1988-11-05', 'KYC', 'PENDING', 'INACTIVE', 'Delhi', 'Delhi', '110001', 'Connaught Place, Delhi', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active, is_commercial)
  VALUES (v_rid, 'auto', 'DL1CAC1234', 'DL', 'Bajaj', 'RE Compact', 2020, 'Yellow-Black', 'cng', 'auto', 3, ARRAY['person_ride']::TEXT[], true, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Front', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '678901234567', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Back', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/4299E1/fff?text=PAN', 'docs/rider_' || v_rid || '/pan.jpg', 'FGHIJ6789K', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Front', 'docs/rider_' || v_rid || '/dl_front.jpg', 'DL1320200098765', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Back', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/4299E1/fff?text=RC+Certificate', 'docs/rider_' || v_rid || '/rc.jpg', 'DL1CAC1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/4299E1/fff?text=Selfie', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=Bank+Proof', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 6 (GMR%) created: Auto Rickshaw - Person Ride service', v_rid;
END $$;

-- =============================================================================
-- TEST RIDER 7: CAR - PERSON RIDE SERVICE
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999007007', '+91', 'Mohammed Ali', '789012345678', 'GHIJK7890L', '1987-04-12', 'KYC', 'PENDING', 'INACTIVE', 'Chennai', 'Tamil Nadu', '600001', 'T Nagar, Chennai', 'ta')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, ac_type, service_types, is_active, is_commercial)
  VALUES (v_rid, 'car', 'TN01AB1111', 'TN', 'Maruti', 'Swift Dzire', 2022, 'Silver', 'petrol', 'sedan', 4, 'ac', ARRAY['person_ride']::TEXT[], true, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Front', 'docs/rider_' || v_rid || '/aadhaar_front.jpg', '789012345678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Back', 'docs/rider_' || v_rid || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/4299E1/fff?text=PAN', 'docs/rider_' || v_rid || '/pan.jpg', 'GHIJK7890L', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Front', 'docs/rider_' || v_rid || '/dl_front.jpg', 'TN0120220034567', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Back', 'docs/rider_' || v_rid || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/4299E1/fff?text=RC', 'docs/rider_' || v_rid || '/rc.jpg', 'TN01AB1111', 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/4299E1/fff?text=Selfie', 'docs/rider_' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'insurance', 'https://via.placeholder.com/400x250/4299E1/fff?text=Insurance', 'docs/rider_' || v_rid || '/insurance.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=Bank+Proof', 'docs/rider_' || v_rid || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  
  RAISE NOTICE '✓ Rider 7 (GMR%) created: Car - Person Ride service', v_rid;
END $$;

-- =============================================================================
-- SUMMARY
-- =============================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM riders WHERE mobile LIKE '9999%';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓✓✓ SETUP COMPLETE! ✓✓✓';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Created % test riders', v_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Test Riders:';
  RAISE NOTICE '  • GMR1001 (9999001001): EV Bike - All pending';
  RAISE NOTICE '  • GMR1002 (9999002002): Petrol Bike - Mixed';
  RAISE NOTICE '  • GMR1003 (9999003003): EV Bike - FULLY ACTIVE ✓';
  RAISE NOTICE '  • GMR1004 (9999004004): Petrol Bike - REJECTED';
  RAISE NOTICE '  • GMR1005 (9999005005): Bike - INCOMPLETE';
  RAISE NOTICE '  • GMR1006 (9999006006): Auto - Pending';
  RAISE NOTICE '  • GMR1007 (9999007007): Car - Pending';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Navigate to /dashboard/riders/{ID}/onboarding';
  RAISE NOTICE '========================================';
END $$;

-- View created test riders
SELECT 
  id,
  'GMR' || id AS rider_id,
  mobile,
  name,
  onboarding_stage,
  kyc_status,
  status,
  city
FROM riders 
WHERE mobile LIKE '9999%' 
ORDER BY mobile;
