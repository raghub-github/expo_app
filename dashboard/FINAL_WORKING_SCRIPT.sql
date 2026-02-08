-- =============================================================================
-- FINAL WORKING SCRIPT - ALL ENUM VALUES CORRECT
-- Copy this ENTIRE file and paste into Supabase SQL Editor
-- =============================================================================

-- Sync referrals
INSERT INTO referrals (referrer_id, referred_id, referral_code_used, referred_city_name, created_at)
SELECT r.referred_by, r.id, ref.referral_code, r.city, r.created_at
FROM riders r
INNER JOIN riders ref ON ref.id = r.referred_by
WHERE r.referred_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM referrals WHERE referred_id = r.id)
ON CONFLICT (referred_id) DO NOTHING;

-- Clean old test data
DELETE FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_vehicles WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_wallet WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM riders WHERE mobile LIKE '9999%';

-- =============================================================================
-- RIDER 1: BIKE (PETROL) - ALL DOCS PENDING
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999001001', '+91', 'Amit Kumar', '123456789012', 'ABCDE1234F', '1995-03-15', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka', '560001', 'MG Road', 'en')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'KA01AB1234', 'KA', 'Honda', 'Activa', 2023, 'White', 'Petrol', 'Bike', '["food", "parcel"]'::jsonb, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Front', 'docs/' || v_rid || '/aadhaar_f.jpg', '123456789012', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=Aadhaar+Back', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/4299E1/fff?text=PAN', 'docs/' || v_rid || '/pan.jpg', 'ABCDE1234F', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Front', 'docs/' || v_rid || '/dl_f.jpg', 'KA0120230012345', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/4299E1/fff?text=DL+Back', 'docs/' || v_rid || '/dl_b.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/4299E1/fff?text=RC', 'docs/' || v_rid || '/rc.jpg', 'KA01AB1234', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/4299E1/fff?text=Selfie', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/4299E1/fff?text=Bank', 'docs/' || v_rid || '/bank.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL);
  
  -- Add onboarding payment (completed)
  INSERT INTO onboarding_payments (rider_id, amount, provider, ref_id, payment_id, status, created_at)
  VALUES (v_rid, 500.00, 'razorpay', 'onb_ref_' || v_rid || '_' || extract(epoch from NOW())::bigint, 'pay_' || v_rid || '_pending', 'completed', NOW() - interval '2 days');
  
  RAISE NOTICE '✓ GMR% - Bike (Petrol) - All pending', v_rid;
END $$;

-- =============================================================================
-- RIDER 2: CAR - IDENTITY APPROVED, VEHICLE PENDING
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999002002', '+91', 'Priya Sharma', '234567890123', 'BCDEF2345G', '1992-07-22', 'KYC', 'APPROVED', 'INACTIVE', 'Mumbai', 'Maharashtra', '400001', 'Andheri', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active)
  VALUES (v_rid, 'car', 'MH02AB5678', 'MH', 'Maruti', 'Swift', 2021, 'Black', 'Petrol', 'Cab', 4, '["person_ride"]'::jsonb, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+APPROVED', 'docs/' || v_rid || '/aadhaar_f.jpg', '234567890123', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/10B981/fff?text=Aadhaar+Back+APPROVED', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/10B981/fff?text=PAN+APPROVED', 'docs/' || v_rid || '/pan.jpg', 'BCDEF2345G', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/10B981/fff?text=Selfie+APPROVED', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Pending', 'docs/' || v_rid || '/dl_f.jpg', 'MH0220210054321', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'dl_back', 'https://via.placeholder.com/400x250/F59E0B/fff?text=DL+Back+Pending', 'docs/' || v_rid || '/dl_b.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'rc', 'https://via.placeholder.com/400x250/F59E0B/fff?text=RC+Pending', 'docs/' || v_rid || '/rc.jpg', 'MH02AB5678', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rid, 'bank_proof', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Bank+Pending', 'docs/' || v_rid || '/bank.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL);
  
  -- Add onboarding payment (completed)
  INSERT INTO onboarding_payments (rider_id, amount, provider, ref_id, payment_id, status, created_at)
  VALUES (v_rid, 500.00, 'razorpay', 'onb_ref_' || v_rid || '_' || extract(epoch from NOW())::bigint, 'pay_' || v_rid || '_success', 'completed', NOW() - interval '3 days');
  
  RAISE NOTICE '✓ GMR% - Car - Identity APPROVED, vehicle pending', v_rid;
END $$;

-- =============================================================================
-- RIDER 3: AUTO (CNG) - FULLY VERIFIED & ACTIVE
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999003003', '+91', 'Rajesh Verma', '345678901234', 'CDEFG3456H', '1988-11-05', 'ACTIVE', 'APPROVED', 'ACTIVE', 'Delhi', 'Delhi', '110001', 'CP', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active, verified, verified_at, is_commercial)
  VALUES (v_rid, 'auto', 'DL1CAC1234', 'DL', 'Bajaj', 'RE', 2020, 'Yellow', 'CNG', 'Auto', 3, '["person_ride"]'::jsonb, true, true, NOW(), true);
  
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
  
  -- Add onboarding payment record
  INSERT INTO onboarding_payments (rider_id, amount, provider, ref_id, payment_id, status, created_at)
  VALUES (v_rid, 500.00, 'razorpay', 'onb_ref_' || v_rid || '_' || extract(epoch from NOW())::bigint, 'pay_' || v_rid || '_success', 'completed', NOW() - interval '5 days');
  
  RAISE NOTICE '✓ GMR% - Auto (CNG) - FULLY ACTIVE', v_rid;
END $$;

-- =============================================================================
-- RIDER 4: BIKE - REJECTED DOCUMENTS
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999004004', '+91', 'Vikram Reddy', '456789012345', 'DEFGH4567I', '1990-09-30', 'KYC', 'REJECTED', 'INACTIVE', 'Hyderabad', 'Telangana', '500001', 'Banjara Hills', 'te')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'TS09CD4321', 'TS', 'Yamaha', 'FZ', 2019, 'Red', 'Petrol', 'Bike', '["food", "parcel"]'::jsonb, true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at, rejected_reason)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/EF4444/fff?text=REJECTED', 'docs/' || v_rid || '/aadhaar_f.jpg', '456789012345', 'MANUAL_UPLOAD', 'rejected', false, NULL, 'Image is blurry, please re-upload'),
    (v_rid, 'aadhaar_back', 'https://via.placeholder.com/400x250/EF4444/fff?text=REJECTED', 'docs/' || v_rid || '/aadhaar_b.jpg', NULL, 'MANUAL_UPLOAD', 'rejected', false, NULL, 'Not clearly visible'),
    (v_rid, 'pan', 'https://via.placeholder.com/400x250/F59E0B/fff?text=PAN+Pending', 'docs/' || v_rid || '/pan.jpg', 'DEFGH4567I', 'MANUAL_UPLOAD', 'pending', false, NULL, NULL),
    (v_rid, 'dl_front', 'https://via.placeholder.com/400x250/EF4444/fff?text=DL+REJECTED', 'docs/' || v_rid || '/dl_f.jpg', 'TS0920190067890', 'MANUAL_UPLOAD', 'rejected', false, NULL, 'Document expired'),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Selfie', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL, NULL);
  
  -- Add onboarding payment (completed - but docs rejected)
  INSERT INTO onboarding_payments (rider_id, amount, provider, ref_id, payment_id, status, created_at)
  VALUES (v_rid, 500.00, 'razorpay', 'onb_ref_' || v_rid || '_' || extract(epoch from NOW())::bigint, 'pay_' || v_rid || '_completed', 'completed', NOW() - interval '1 day');
  
  RAISE NOTICE '✓ GMR% - Bike - REJECTED docs with reasons', v_rid;
END $$;

-- =============================================================================
-- RIDER 5: BICYCLE - MISSING CRITICAL DOCS
-- =============================================================================
DO $$
DECLARE v_rid INTEGER;
BEGIN
  INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
  VALUES ('9999005005', '+91', 'Karan Malhotra', '567890123456', 'EFGHI5678J', '1994-06-08', 'MOBILE_VERIFIED', 'PENDING', 'INACTIVE', 'Jaipur', 'Rajasthan', '302001', 'MI Road', 'hi')
  RETURNING id INTO v_rid;
  
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rid, 'bike', 'RJ14CD6789', 'RJ', 'Hero', 'Splendor', 2020, 'Blue', 'Petrol', 'Bike', '["food", "parcel"]'::jsonb, true);
  
  -- Only 2 documents (missing PAN, DL, RC, Bank)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at, rejected_reason)
  VALUES 
    (v_rid, 'aadhaar_front', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Aadhaar+Only', 'docs/' || v_rid || '/aadhaar_f.jpg', '567890123456', 'MANUAL_UPLOAD', 'pending', false, NULL, NULL),
    (v_rid, 'selfie', 'https://via.placeholder.com/400x250/F59E0B/fff?text=Selfie+Only', 'docs/' || v_rid || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL, NULL);
  
  RAISE NOTICE '✓ GMR% - Bike - INCOMPLETE (missing docs)', v_rid;
END $$;

-- =============================================================================
-- SUMMARY & VIEW RESULTS
-- =============================================================================
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM riders WHERE mobile LIKE '9999%';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '✓✓✓ SUCCESS! ✓✓✓';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created % test riders', v_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Navigate to: /dashboard/riders/{ID}/onboarding';
  RAISE NOTICE '================================================';
END $$;

-- Show created riders
SELECT 
  id,
  'GMR' || id AS rider_id,
  mobile,
  name,
  onboarding_stage AS stage,
  kyc_status AS kyc,
  status
FROM riders 
WHERE mobile LIKE '9999%' 
ORDER BY mobile;
