-- =============================================================================
-- TEST DATA: Diverse Riders with Complete Documents for Onboarding Testing
-- Run this in PostgreSQL/Supabase SQL Editor
-- Creates 10 riders with various document states, vehicle types, and scenarios
-- =============================================================================

-- Clean up test data (optional - comment out if you want to keep existing data)
-- DELETE FROM rider_documents WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
-- DELETE FROM rider_vehicles WHERE rider_id IN (SELECT id FROM riders WHERE mobile LIKE '9999%');
-- DELETE FROM riders WHERE mobile LIKE '9999%';

-- =============================================================================
-- RIDER 1: Complete EV Bike - All docs uploaded, ready for verification
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999001001', '+91', 'Amit Kumar Singh', '123456789012', 'ABCDE1234F', '1995-03-15', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka', '560001', 'MG Road, Bangalore', 'en')
RETURNING id;

-- Get the rider ID (replace XXX with actual ID from above query)
DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999001001';
  
  -- Vehicle: EV Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'ev_bike', 'KA01EV1234', 'KA', 'Ather', '450X', 2023, 'White', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Documents
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_1.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '123456789012', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_1.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_1.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'ABCDE1234F', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_1.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'KA0120230012345', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_1.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_1.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'KA01EV1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_1.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'ev_proof', 'https://placeholder-url.com/ev_proof_1.jpg', 'docs/rider_' || v_rider_id || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_1.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 2: Petrol Bike - Some docs verified, some pending
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999002002', '+91', 'Priya Sharma', '234567890123', 'BCDEF2345G', '1992-07-22', 'KYC', 'PENDING', 'INACTIVE', 'Mumbai', 'Maharashtra', '400001', 'Andheri East, Mumbai', 'hi')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999002002';
  
  -- Vehicle: Petrol Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'bike', 'MH02AB5678', 'MH', 'Honda', 'Activa', 2021, 'Black', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Documents (some approved, some pending)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_2.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '234567890123', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_2.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_2.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'BCDEF2345G', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_2.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'MH0220210054321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_2.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_2.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'MH02AB5678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_2.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_2.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 3: Auto Rickshaw - Person Ride service
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999003003', '+91', 'Rajesh Verma', '345678901234', 'CDEFG3456H', '1988-11-05', 'KYC', 'PENDING', 'INACTIVE', 'Delhi', 'Delhi', '110001', 'Connaught Place, Delhi', 'hi')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999003003';
  
  -- Vehicle: Auto Rickshaw (CNG)
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, service_types, is_active, is_commercial)
  VALUES (v_rider_id, 'auto', 'DL1CAC1234', 'DL', 'Bajaj', 'RE Compact', 2020, 'Yellow-Black', 'cng', 'auto', 3, ARRAY['person_ride']::TEXT[], true, true);
  
  -- Documents
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_3.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '345678901234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_3.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_3.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'CDEFG3456H', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_3.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'DL1320200098765', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_3.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_3.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'DL1CAC1234', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_3.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_3.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 4: EV Rental - Using rental proof
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999004004', '+91', 'Sneha Patel', '456789012345', 'DEFGH4567I', '1998-05-18', 'KYC', 'PENDING', 'INACTIVE', 'Ahmedabad', 'Gujarat', '380001', 'Ellis Bridge, Ahmedabad', 'gu')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999004004';
  
  -- Vehicle: EV Rental
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'ev_bike', 'GJ01EV7890', 'GJ', 'Ola', 'S1 Pro', 2024, 'Blue', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Documents (using rental proof instead of RC)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_4.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '456789012345', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_4.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_4.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'DEFGH4567I', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_4.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'GJ0120240011111', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_4.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rental_proof', 'https://placeholder-url.com/rental_proof_4.jpg', 'docs/rider_' || v_rider_id || '/rental_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_4.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_4.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 5: Rejected Documents - Needs re-upload
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999005005', '+91', 'Vikram Reddy', '567890123456', 'EFGHI5678J', '1990-09-30', 'KYC', 'REJECTED', 'INACTIVE', 'Hyderabad', 'Telangana', '500001', 'Banjara Hills, Hyderabad', 'te')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999005005';
  
  -- Vehicle: Petrol Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'bike', 'TS09CD4321', 'TS', 'Yamaha', 'FZ', 2019, 'Red', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Documents (some rejected)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, rejected_reason)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_5.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '567890123456', 'MANUAL_UPLOAD', 'rejected', false, 'Image is blurry, please re-upload'),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_5.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'rejected', false, 'Not clearly visible'),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_5.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'EFGHI5678J', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_5.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'TS0920190067890', 'MANUAL_UPLOAD', 'rejected', false, 'Document expired'),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_5.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_5.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'TS09CD4321', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_5.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 6: Fully Verified - Active Rider
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999006006', '+91', 'Anjali Gupta', '678901234567', 'FGHIJ6789K', '1993-12-25', 'ACTIVE', 'APPROVED', 'ACTIVE', 'Pune', 'Maharashtra', '411001', 'Koregaon Park, Pune', 'mr')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999006006';
  
  -- Vehicle: EV Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active, verified, verified_at)
  VALUES (v_rider_id, 'ev_bike', 'MH12EV9999', 'MH', 'Bajaj', 'Chetak', 2023, 'Green', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true, true, NOW());
  
  -- All Documents Approved
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_6.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '678901234567', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_6.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_6.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'FGHIJ6789K', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_6.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'MH1220230023456', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_6.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_6.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'MH12EV9999', 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_6.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'ev_proof', 'https://placeholder-url.com/ev_proof_6.jpg', 'docs/rider_' || v_rider_id || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW()),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_6.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'approved', true, NOW());
    
  -- Initialize wallet
  INSERT INTO rider_wallet (rider_id, total_balance, earnings_food, earnings_parcel, earnings_person_ride)
  VALUES (v_rider_id, 5000.00, 3000.00, 2000.00, 0.00);
END $$;

-- =============================================================================
-- RIDER 7: Car - Person Ride + multiple services
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999007007', '+91', 'Mohammed Ali', '789012345678', 'GHIJK7890L', '1987-04-12', 'KYC', 'PENDING', 'INACTIVE', 'Chennai', 'Tamil Nadu', '600001', 'T Nagar, Chennai', 'ta')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999007007';
  
  -- Vehicle: Car
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, seating_capacity, ac_type, service_types, is_active, is_commercial)
  VALUES (v_rider_id, 'car', 'TN01AB1111', 'TN', 'Maruti', 'Swift Dzire', 2022, 'Silver', 'petrol', 'sedan', 4, 'ac', ARRAY['person_ride']::TEXT[], true, true);
  
  -- Documents
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_7.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '789012345678', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_7.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_7.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'GHIJK7890L', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_7.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'TN0120220034567', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_7.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_7.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'TN01AB1111', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_7.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'insurance', 'https://placeholder-url.com/insurance_7.jpg', 'docs/rider_' || v_rider_id || '/insurance.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_7.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 8: APP_VERIFIED Documents - DigiLocker integration
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999008008', '+91', 'Lakshmi Iyer', '890123456789', 'HIJKL8901M', '1996-08-20', 'KYC', 'PENDING', 'INACTIVE', 'Coimbatore', 'Tamil Nadu', '641001', 'RS Puram, Coimbatore', 'ta')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999008008';
  
  -- Vehicle: EV Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'ev_bike', 'TN37EV2222', 'TN', 'TVS', 'iQube', 2024, 'White', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Documents (APP_VERIFIED via DigiLocker)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, verified_at)
  VALUES 
    (v_rider_id, 'aadhaar_front', '', NULL, '890123456789', 'APP_VERIFIED', 'approved', true, NOW()),
    (v_rider_id, 'dl_front', '', NULL, 'TN3720240045678', 'APP_VERIFIED', 'approved', true, NOW()),
    (v_rider_id, 'rc', '', NULL, 'TN37EV2222', 'APP_VERIFIED', 'approved', true, NOW()),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_8.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'HIJKL8901M', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_8.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_8.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
END $$;

-- =============================================================================
-- RIDER 9: Missing Critical Documents
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999009009', '+91', 'Karan Malhotra', '901234567890', 'IJKLM9012N', '1994-06-08', 'MOBILE_VERIFIED', 'PENDING', 'INACTIVE', 'Jaipur', 'Rajasthan', '302001', 'MI Road, Jaipur', 'hi')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999009009';
  
  -- Vehicle: Petrol Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'bike', 'RJ14CD6789', 'RJ', 'Hero', 'Splendor Plus', 2020, 'Blue', 'petrol', 'bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Partial Documents (missing RC and DL)
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_9.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '901234567890', 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_9.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_9.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false);
  -- Missing: PAN, DL, RC, Bank Proof
END $$;

-- =============================================================================
-- RIDER 10: Multi-service EV with complete setup
-- =============================================================================
INSERT INTO riders (mobile, country_code, name, aadhaar_number, pan_number, dob, onboarding_stage, kyc_status, status, city, state, pincode, address, default_language)
VALUES ('9999010010', '+91', 'Deepika Rao', '012345678901', 'JKLMN0123O', '1991-10-14', 'KYC', 'PENDING', 'INACTIVE', 'Kochi', 'Kerala', '682001', 'MG Road, Kochi', 'ml')
RETURNING id;

DO $$
DECLARE
  v_rider_id INTEGER;
BEGIN
  SELECT id INTO v_rider_id FROM riders WHERE mobile = '9999010010';
  
  -- Vehicle: EV Bike
  INSERT INTO rider_vehicles (rider_id, vehicle_type, registration_number, registration_state, make, model, year, color, fuel_type, vehicle_category, service_types, is_active)
  VALUES (v_rider_id, 'ev_bike', 'KL07EV3333', 'KL', 'Hero', 'Vida V1', 2024, 'Purple', 'electric', 'ev_bike', ARRAY['food', 'parcel']::TEXT[], true);
  
  -- Complete Documents
  INSERT INTO rider_documents (rider_id, doc_type, file_url, r2_key, doc_number, verification_method, verification_status, verified, expiry_date)
  VALUES 
    (v_rider_id, 'aadhaar_front', 'https://placeholder-url.com/aadhaar_front_10.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_front.jpg', '012345678901', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'aadhaar_back', 'https://placeholder-url.com/aadhaar_back_10.jpg', 'docs/rider_' || v_rider_id || '/aadhaar_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'pan', 'https://placeholder-url.com/pan_10.jpg', 'docs/rider_' || v_rider_id || '/pan.jpg', 'JKLMN0123O', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'dl_front', 'https://placeholder-url.com/dl_front_10.jpg', 'docs/rider_' || v_rider_id || '/dl_front.jpg', 'KL0720240056789', 'MANUAL_UPLOAD', 'pending', false, '2044-10-14'),
    (v_rider_id, 'dl_back', 'https://placeholder-url.com/dl_back_10.jpg', 'docs/rider_' || v_rider_id || '/dl_back.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'rc', 'https://placeholder-url.com/rc_10.jpg', 'docs/rider_' || v_rider_id || '/rc.jpg', 'KL07EV3333', 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'selfie', 'https://placeholder-url.com/selfie_10.jpg', 'docs/rider_' || v_rider_id || '/selfie.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'ev_proof', 'https://placeholder-url.com/ev_proof_10.jpg', 'docs/rider_' || v_rider_id || '/ev_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'bank_proof', 'https://placeholder-url.com/bank_proof_10.jpg', 'docs/rider_' || v_rider_id || '/bank_proof.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, NULL),
    (v_rider_id, 'insurance', 'https://placeholder-url.com/insurance_10.jpg', 'docs/rider_' || v_rider_id || '/insurance.jpg', NULL, 'MANUAL_UPLOAD', 'pending', false, '2025-12-31');
END $$;

-- =============================================================================
-- SUMMARY OF TEST DATA
-- =============================================================================
-- Rider 1 (9999001001): Complete EV Bike - All docs pending verification
-- Rider 2 (9999002002): Petrol Bike - Mixed verification status (some approved, some pending)
-- Rider 3 (9999003003): Auto Rickshaw - Person Ride service, all docs pending
-- Rider 4 (9999004004): EV Rental - Using rental proof instead of RC
-- Rider 5 (9999005005): Rejected Documents - Needs re-upload
-- Rider 6 (9999006006): Fully Verified - Active rider (SUCCESS CASE)
-- Rider 7 (9999007007): Car for Person Ride - All docs pending
-- Rider 8 (9999008008): APP_VERIFIED via DigiLocker - Mixed verification
-- Rider 9 (9999009009): Missing Critical Documents (only Aadhaar and Selfie)
-- Rider 10 (9999010010): Complete EV setup with expiry dates

-- To view test riders:
-- SELECT id, mobile, name, onboarding_stage, kyc_status, status FROM riders WHERE mobile LIKE '9999%' ORDER BY mobile;

-- To view documents for a specific rider:
-- SELECT doc_type, verification_status, verified, rejected_reason FROM rider_documents WHERE rider_id = XXX;
