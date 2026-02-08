-- =============================================================================
-- COMPLETE SETUP SQL - Run this entire file in Supabase SQL Editor
-- This includes: referral sync + test data creation
-- =============================================================================

-- =============================================================================
-- PART 1: SYNC REFERRALS FROM RIDERS.REFERRED_BY
-- =============================================================================

-- Insert referrals for all riders that have referred_by set but don't have
-- a corresponding entry in the referrals table
INSERT INTO referrals (
  referrer_id,
  referred_id,
  referral_code_used,
  referred_city_name,
  created_at
)
SELECT 
  r.referred_by AS referrer_id,
  r.id AS referred_id,
  ref.referral_code AS referral_code_used,
  r.city AS referred_city_name,
  r.created_at
FROM riders r
INNER JOIN riders ref ON ref.id = r.referred_by
WHERE r.referred_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM referrals ref_table 
    WHERE ref_table.referred_id = r.id
  )
ON CONFLICT (referred_id) DO NOTHING;

-- Log the sync results
DO $$
DECLARE
  v_synced_count INTEGER;
  v_total_referrals INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_synced_count
  FROM riders r
  WHERE r.referred_by IS NOT NULL;
  
  SELECT COUNT(*) INTO v_total_referrals
  FROM referrals;
  
  RAISE NOTICE '✓ Referral sync complete. Riders with referred_by: %, Total referrals in table: %', v_synced_count, v_total_referrals;
END $$;

-- =============================================================================
-- PART 2: CREATE 10 TEST RIDERS WITH COMPLETE DOCUMENT DATA
-- =============================================================================

-- Clean up existing test data (optional - comment this out if you want to keep existing data)
DELETE FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_vehicles WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM rider_wallet WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
DELETE FROM riders WHERE mobile LIKE '9999%';

-- Test Rider 1: Complete EV Bike - All docs uploaded, ready for verification
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999001001', '+91', 'Amit Kumar Singh', '123456789012', 'ABCDE1234F', '1995-03-15', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka', '560001', 'MG Road, Bangalore', 'en');

DO $$
DECLARE v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999001001';
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'ev_bike', 'KA01EV1234', 'KA', 'Ather', '450X', 2023, 'White', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://via.placeholder.com/400x250?text=Aadhaar+Front', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '123456789012', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'aadhaar_back', 'https://via.placeholder.com/400x250?text=Aadhaar+Back', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'pan', 'https://via.placeholder.com/400x250?text=PAN+Card', 'docs/rider_' || v_rider_id || '/pan.jpg', 'ABCDE1234F', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://via.placeholder.com/400x250?text=DL+Front', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'KA0120230012345', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://via.placeholder.com/400x250?text=DL+Back', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://via.placeholder.com/400x250?text=RC+Certificate', 'docs/rider_' || v_rider_id || '/rc.jpg', 'KA01EV1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://via.placeholder.com/400x250?text=Selfie', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'ev_proof', 'https://via.placeholder.com/400x250?text=EV+Proof', 'docs/rider_' || v_rider_id || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'bank_proof', 'https://via.placeholder.com/400x250?text=Bank+Proof', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  RAISE NOTICE '✓ Created Rider 1 (GMR%): Complete EV Bike - All docs pending', v_rider_id;
END $$;

-- Test Rider 2: Petrol Bike - Some docs verified, some pending
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999002002', '+91', 'Priya Sharma', '234567890123', 'BCDEF2345G', '1992-07-22', 'KYC', 'PENDING', 'INACTIVE', 'Mumbai', 'Maharashtra', '400001', 'Andheri East, Mumbai', 'hi');

DO $$
DECLARE v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999002002';
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'bike', 'MH02AB5678', 'MH', 'Honda', 'Activa', 2021, 'Black', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://via.placeholder.com/400x250?text=Aadhaar+Front+APPROVED', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '234567890123', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'aadhaar_back', 'https://via.placeholder.com/400x250?text=Aadhaar+Back+APPROVED', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'pan', 'https://via.placeholder.com/400x250?text=PAN+APPROVED', 'docs/rider_' || v_rider_id || '/pan.jpg', 'BCDEF2345G', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'dl_front', 'https://via.placeholder.com/400x250?text=DL+Front+Pending', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'MH0220210054321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://via.placeholder.com/400x250?text=DL+Back+Pending', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://via.placeholder.com/400x250?text=RC+Pending', 'docs/rider_' || v_rider_id || '/rc.jpg', 'MH02AB5678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://via.placeholder.com/400x250?text=Selfie+APPROVED', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'bank_proof', 'https://via.placeholder.com/400x250?text=Bank+Proof+Pending', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  RAISE NOTICE '✓ Created Rider 2 (GMR%): Petrol Bike - Mixed verification status', v_rider_id;
END $$;

-- Test Rider 3: Fully Verified & Active
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999003003', '+91', 'Anjali Gupta', '345678901234', 'CDEFG3456H', '1993-12-25', 'ACTIVE', 'APPROVED', 'ACTIVE', 'Pune', 'Maharashtra', '411001', 'Koregaon Park, Pune', 'mr');

DO $$
DECLARE v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999003003';
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active, verified, verified_at)
  VALUES (v_rider_id, 'ev_bike', 'MH12EV9999', 'MH', 'Bajaj', 'Chetak', 2023, 'Green', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true, true, NOW());
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://via.placeholder.com/400x250?text=Aadhaar+Front+VERIFIED', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '345678901234', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'aadhaar_back', 'https://via.placeholder.com/400x250?text=Aadhaar+Back+VERIFIED', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'pan', 'https://via.placeholder.com/400x250?text=PAN+VERIFIED', 'docs/rider_' || v_rider_id || '/pan.jpg', 'CDEFG3456H', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'dl_front', 'https://via.placeholder.com/400x250?text=DL+Front+VERIFIED', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'MH1220230023456', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'dl_back', 'https://via.placeholder.com/400x250?text=DL+Back+VERIFIED', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'rc', 'https://via.placeholder.com/400x250?text=RC+VERIFIED', 'docs/rider_' || v_rider_id || '/rc.jpg', 'MH12EV9999', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'selfie', 'https://via.placeholder.com/400x250?text=Selfie+VERIFIED', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'ev_proof', 'https://via.placeholder.com/400x250?text=EV+Proof+VERIFIED', 'docs/rider_' || v_rider_id || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'bank_proof', 'https://via.placeholder.com/400x250?text=Bank+Proof+VERIFIED', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW());
    
  INSERT INTO rider_wallet (rider_id, total_balance, earnings_food, earnings_parcel, earnings_person_ride)
  VALUES (v_rider_id, 5000.00, 3000.00, 2000.00, 0.00);
  
  RAISE NOTICE '✓ Created Rider 3 (GMR%): Fully Verified & ACTIVE - Success Case', v_rider_id;
END $$;

-- Test Rider 4: Rejected Documents - Needs re-upload
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999004004', '+91', 'Vikram Reddy', '456789012345', 'DEFGH4567I', '1990-09-30', 'KYC', 'REJECTED', 'INACTIVE', 'Hyderabad', 'Telangana', '500001', 'Banjara Hills, Hyderabad', 'te');

DO $$
DECLARE v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999004004';
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'bike', 'TS09CD4321', 'TS', 'Yamaha', 'FZ', 2019, 'Red', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, rejected_reason)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://via.placeholder.com/400x250?text=Aadhaar+REJECTED', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '456789012345', 'MANUAL_UPLOAD', 'rejected', false, 'Image is blurry, please re-upload'),
    (v_rider_id, 'aadhaar_back', 'https://via.placeholder.com/400x250?text=Aadhaar+Back+REJECTED', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'rejected', false, 'Not clearly visible'),
    (v_rider_id, 'pan', 'https://via.placeholder.com/400x250?text=PAN+Pending', 'docs/rider_' || v_rider_id || '/pan.jpg', 'DEFGH4567I', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://via.placeholder.com/400x250?text=DL+REJECTED', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'TS0920190067890', 'MANUAL_UPLOAD', 'rejected', false, 'Document expired'),
    (v_rider_id, 'dl_back', 'https://via.placeholder.com/400x250?text=DL+Back+Pending', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://via.placeholder.com/400x250?text=RC+Pending', 'docs/rider_' || v_rider_id || '/rc.jpg', 'TS09CD4321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://via.placeholder.com/400x250?text=Selfie+Pending', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  RAISE NOTICE '✓ Created Rider 4 (GMR%): Rejected Documents - Test rejection flow', v_rider_id;
END $$;

-- Test Rider 5: Missing Critical Documents
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999005005', '+91', 'Karan Malhotra', '567890123456', 'EFGHI5678J', '1994-06-08', 'MOBILE_VERIFIED', 'PENDING', 'INACTIVE', 'Jaipur', 'Rajasthan', '302001', 'MI Road, Jaipur', 'hi');

DO $$
DECLARE v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999005005';
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'bike', 'RJ14CD6789', 'RJ', 'Hero', 'Splendor Plus', 2020, 'Blue', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://via.placeholder.com/400x250?text=Aadhaar+Only', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '567890123456', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://via.placeholder.com/400x250?text=Selfie+Only', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  -- Missing: PAN, DL, RC, Bank Proof
  RAISE NOTICE '✓ Created Rider 5 (GMR%): Missing Critical Docs - Incomplete', v_rider_id;
END $$;

-- =============================================================================
-- FINAL SUMMARY
-- =============================================================================
DO $$
DECLARE
  v_rider_count INTEGER;
  v_doc_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_rider_count FROM riders WHERE mobile LIKE '9999%';
  SELECT COUNT(*) INTO v_doc_count FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Setup Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Referrals synced from riders.referred_by';
  RAISE NOTICE 'Test riders created: %', v_rider_count;
  RAISE NOTICE 'Test documents created: %', v_doc_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Test Riders:';
  RAISE NOTICE '  GMR1001 (9999001001): EV Bike - All docs pending';
  RAISE NOTICE '  GMR1002 (9999002002): Petrol Bike - Mixed verification';
  RAISE NOTICE '  GMR1003 (9999003003): Fully ACTIVE - Success case';
  RAISE NOTICE '  GMR1004 (9999004004): Rejected docs - Test rejection';
  RAISE NOTICE '  GMR1005 (9999005005): Missing docs - Incomplete';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Navigate to /dashboard/riders/1001/onboarding';
  RAISE NOTICE '========================================';
END $$;

-- View created riders
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
