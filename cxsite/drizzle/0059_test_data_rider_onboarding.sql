-- Test Data for Rider Onboarding Verification System
-- Migration: 0059_test_data_rider_onboarding
-- 
-- This script creates comprehensive test data including:
-- 1. Multiple riders with different onboarding stages
-- 2. Documents with both APP_VERIFIED and MANUAL_UPLOAD methods
-- 3. Mix of verified and unverified documents
-- 4. All document types (aadhaar, pan, dl, rc, selfie, rental_proof, ev_proof)
-- 5. Realistic Indian data (names, mobile numbers, document numbers)
--
-- IMPORTANT: Run migrations 0057 and 0058 before running this script
-- IMPORTANT: This script uses mobile numbers to identify riders (mobile is unique)
-- IMPORTANT: If riders with these mobile numbers already exist, they will be skipped

-- ============================================================================
-- RIDER 1: Mixed verification methods - Some APP_VERIFIED, some MANUAL_UPLOAD pending
-- ============================================================================

DO $$
DECLARE
  rider1_id INTEGER;
BEGIN
  -- Insert or get rider 1
  INSERT INTO riders (
    mobile, country_code, name, aadhaar_number, pan_number, dob,
    onboarding_stage, kyc_status, status, city, state, pincode, address,
    lat, lon, default_language, created_at, updated_at
  ) VALUES (
    '9876543210', '+91', 'Rajesh Kumar', '1234 5678 9012', 'ABCDE1234F',
    '1990-05-15', 'KYC', 'PENDING', 'INACTIVE', 'Mumbai', 'Maharashtra',
    '400001', '123, Andheri West, Mumbai', 19.1364, 72.8297, 'en',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'
  ) ON CONFLICT (mobile) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO rider1_id;
  
  -- If rider exists, get the ID
  IF rider1_id IS NULL THEN
    SELECT id INTO rider1_id FROM riders WHERE mobile = '9876543210';
  END IF;

  -- Delete existing documents for clean test (optional - comment out if you want to keep history)
  -- DELETE FROM rider_documents WHERE rider_id = rider1_id;

  -- Insert documents for rider 1
  INSERT INTO rider_documents (
    rider_id, doc_type, file_url, r2_key, doc_number, verification_method,
    verified, verifier_user_id, rejected_reason, metadata, created_at
  ) VALUES
  -- Aadhaar - APP_VERIFIED (already verified)
  (
    rider1_id, 'aadhaar', 'app-verified://placeholder', NULL, '1234 5678 9012',
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "otp", "verification_date": "2024-01-15"}'::jsonb, NOW() - INTERVAL '25 days'
  ),
  -- PAN - APP_VERIFIED (already verified)
  (
    rider1_id, 'pan', 'app-verified://placeholder', NULL, 'ABCDE1234F',
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "otp"}'::jsonb, NOW() - INTERVAL '24 days'
  ),
  -- DL - MANUAL_UPLOAD (pending agent approval)
  (
    rider1_id, 'dl', 'https://example.com/r2/riders/' || rider1_id || '/documents/dl/1705123456789.jpg',
    'riders/' || rider1_id || '/documents/dl/1705123456789.jpg', 'DL-01-2020-1234567',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '5 days'
  ),
  -- RC - MANUAL_UPLOAD (pending agent approval)
  (
    rider1_id, 'rc', 'https://example.com/r2/riders/' || rider1_id || '/documents/rc/1705123456790.jpg',
    'riders/' || rider1_id || '/documents/rc/1705123456790.jpg', 'MH-01-AB-1234',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '4 days'
  ),
  -- Selfie - MANUAL_UPLOAD (pending agent approval)
  (
    rider1_id, 'selfie', 'https://example.com/r2/riders/' || rider1_id || '/documents/selfie/1705123456791.jpg',
    'riders/' || rider1_id || '/documents/selfie/1705123456791.jpg', NULL,
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '3 days'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- RIDER 2: All APP_VERIFIED documents (already verified through app)
-- ============================================================================

DO $$
DECLARE
  rider2_id INTEGER;
BEGIN
  INSERT INTO riders (
    mobile, country_code, name, aadhaar_number, pan_number, dob,
    onboarding_stage, kyc_status, status, city, state, pincode, address,
    lat, lon, default_language, created_at, updated_at
  ) VALUES (
    '9876543211', '+91', 'Priya Sharma', '2345 6789 0123', 'FGHIJ5678K',
    '1992-08-20', 'PAYMENT', 'APPROVED', 'INACTIVE', 'Delhi', 'Delhi',
    '110001', '456, Connaught Place, New Delhi', 28.6139, 77.2090, 'en',
    NOW() - INTERVAL '25 days', NOW() - INTERVAL '2 days'
  ) ON CONFLICT (mobile) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO rider2_id;
  
  IF rider2_id IS NULL THEN
    SELECT id INTO rider2_id FROM riders WHERE mobile = '9876543211';
  END IF;

  INSERT INTO rider_documents (
    rider_id, doc_type, file_url, r2_key, doc_number, verification_method,
    verified, verifier_user_id, rejected_reason, metadata, created_at
  ) VALUES
  (
    rider2_id, 'aadhaar', 'app-verified://placeholder', NULL, '2345 6789 0123',
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "otp"}'::jsonb, NOW() - INTERVAL '20 days'
  ),
  (
    rider2_id, 'pan', 'app-verified://placeholder', NULL, 'FGHIJ5678K',
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "otp"}'::jsonb, NOW() - INTERVAL '19 days'
  ),
  (
    rider2_id, 'dl', 'app-verified://placeholder', NULL, 'DL-02-2019-7654321',
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "otp"}'::jsonb, NOW() - INTERVAL '18 days'
  ),
  (
    rider2_id, 'rc', 'app-verified://placeholder', NULL, 'DL-01-CD-5678',
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "otp"}'::jsonb, NOW() - INTERVAL '17 days'
  ),
  (
    rider2_id, 'selfie', 'app-verified://placeholder', NULL, NULL,
    'APP_VERIFIED', TRUE, NULL, NULL, '{"verified_via": "biometric"}'::jsonb, NOW() - INTERVAL '16 days'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- RIDER 3: All MANUAL_UPLOAD documents - Pending agent approval
-- ============================================================================

DO $$
DECLARE
  rider3_id INTEGER;
BEGIN
  INSERT INTO riders (
    mobile, country_code, name, aadhaar_number, pan_number, dob,
    onboarding_stage, kyc_status, status, city, state, pincode, address,
    lat, lon, default_language, created_at, updated_at
  ) VALUES (
    '9876543212', '+91', 'Amit Patel', '3456 7890 1234', 'KLMNO9012P',
    '1988-12-10', 'KYC', 'PENDING', 'INACTIVE', 'Bangalore', 'Karnataka',
    '560001', '789, MG Road, Bangalore', 12.9716, 77.5946, 'en',
    NOW() - INTERVAL '20 days', NOW() - INTERVAL '1 day'
  ) ON CONFLICT (mobile) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO rider3_id;
  
  IF rider3_id IS NULL THEN
    SELECT id INTO rider3_id FROM riders WHERE mobile = '9876543212';
  END IF;

  INSERT INTO rider_documents (
    rider_id, doc_type, file_url, r2_key, doc_number, verification_method,
    verified, verifier_user_id, rejected_reason, metadata, created_at
  ) VALUES
  (
    rider3_id, 'aadhaar', 'https://example.com/r2/riders/' || rider3_id || '/documents/aadhaar/1705123456792.jpg',
    'riders/' || rider3_id || '/documents/aadhaar/1705123456792.jpg', '3456 7890 1234',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '15 days'
  ),
  (
    rider3_id, 'pan', 'https://example.com/r2/riders/' || rider3_id || '/documents/pan/1705123456793.jpg',
    'riders/' || rider3_id || '/documents/pan/1705123456793.jpg', 'KLMNO9012P',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '14 days'
  ),
  (
    rider3_id, 'dl', 'https://example.com/r2/riders/' || rider3_id || '/documents/dl/1705123456794.jpg',
    'riders/' || rider3_id || '/documents/dl/1705123456794.jpg', 'KA-03-EF-9012',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '13 days'
  ),
  (
    rider3_id, 'rc', 'https://example.com/r2/riders/' || rider3_id || '/documents/rc/1705123456795.jpg',
    'riders/' || rider3_id || '/documents/rc/1705123456795.jpg', 'KA-19-GH-3456',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '12 days'
  ),
  (
    rider3_id, 'selfie', 'https://example.com/r2/riders/' || rider3_id || '/documents/selfie/1705123456796.jpg',
    'riders/' || rider3_id || '/documents/selfie/1705123456796.jpg', NULL,
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '11 days'
  ),
  -- Additional documents for EV bike
  (
    rider3_id, 'rental_proof', 'https://example.com/r2/riders/' || rider3_id || '/documents/rental_proof/1705123456797.jpg',
    'riders/' || rider3_id || '/documents/rental_proof/1705123456797.jpg', 'RENT-2024-001',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '10 days'
  ),
  (
    rider3_id, 'ev_proof', 'https://example.com/r2/riders/' || rider3_id || '/documents/ev_proof/1705123456798.jpg',
    'riders/' || rider3_id || '/documents/ev_proof/1705123456798.jpg', 'EV-2024-001',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '9 days'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- RIDER 4: Partially verified - Some documents missing
-- ============================================================================

DO $$
DECLARE
  rider4_id INTEGER;
BEGIN
  INSERT INTO riders (
    mobile, country_code, name, aadhaar_number, pan_number, dob,
    onboarding_stage, kyc_status, status, city, state, pincode, address,
    lat, lon, default_language, created_at, updated_at
  ) VALUES (
    '9876543213', '+91', 'Sneha Reddy', '4567 8901 2345', 'PQRST3456U',
    '1995-03-25', 'KYC', 'PENDING', 'INACTIVE', 'Hyderabad', 'Telangana',
    '500001', '321, Hitech City, Hyderabad', 17.4486, 78.3908, 'en',
    NOW() - INTERVAL '15 days', NOW()
  ) ON CONFLICT (mobile) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO rider4_id;
  
  IF rider4_id IS NULL THEN
    SELECT id INTO rider4_id FROM riders WHERE mobile = '9876543213';
  END IF;

  INSERT INTO rider_documents (
    rider_id, doc_type, file_url, r2_key, doc_number, verification_method,
    verified, verifier_user_id, rejected_reason, metadata, created_at
  ) VALUES
  -- Only some documents uploaded and verified
  (
    rider4_id, 'aadhaar', 'https://example.com/r2/riders/' || rider4_id || '/documents/aadhaar/1705123456799.jpg',
    'riders/' || rider4_id || '/documents/aadhaar/1705123456799.jpg', '4567 8901 2345',
    'MANUAL_UPLOAD', TRUE, 1, NULL, '{}'::jsonb, NOW() - INTERVAL '12 days'
  ),
  (
    rider4_id, 'pan', 'https://example.com/r2/riders/' || rider4_id || '/documents/pan/1705123456800.jpg',
    'riders/' || rider4_id || '/documents/pan/1705123456800.jpg', 'PQRST3456U',
    'MANUAL_UPLOAD', TRUE, 1, NULL, '{}'::jsonb, NOW() - INTERVAL '11 days'
  ),
  -- DL, RC, Selfie are missing - rider hasn't uploaded yet
  -- Additional document (rental proof) uploaded but not verified
  (
    rider4_id, 'rental_proof', 'https://example.com/r2/riders/' || rider4_id || '/documents/rental_proof/1705123456801.jpg',
    'riders/' || rider4_id || '/documents/rental_proof/1705123456801.jpg', 'RENT-2024-002',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '5 days'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- RIDER 5: Rejected documents - Need re-upload
-- ============================================================================

DO $$
DECLARE
  rider5_id INTEGER;
BEGIN
  INSERT INTO riders (
    mobile, country_code, name, aadhaar_number, pan_number, dob,
    onboarding_stage, kyc_status, status, city, state, pincode, address,
    lat, lon, default_language, created_at, updated_at
  ) VALUES (
    '9876543214', '+91', 'Vikram Singh', '5678 9012 3456', 'UVWXY7890Z',
    '1991-07-18', 'KYC', 'REJECTED', 'INACTIVE', 'Pune', 'Maharashtra',
    '411001', '654, Koregaon Park, Pune', 18.5204, 73.8567, 'en',
    NOW() - INTERVAL '10 days', NOW() - INTERVAL '3 days'
  ) ON CONFLICT (mobile) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO rider5_id;
  
  IF rider5_id IS NULL THEN
    SELECT id INTO rider5_id FROM riders WHERE mobile = '9876543214';
  END IF;

  INSERT INTO rider_documents (
    rider_id, doc_type, file_url, r2_key, doc_number, verification_method,
    verified, verifier_user_id, rejected_reason, metadata, created_at
  ) VALUES
  -- Documents that were rejected
  (
    rider5_id, 'aadhaar', 'https://example.com/r2/riders/' || rider5_id || '/documents/aadhaar/1705123456802.jpg',
    'riders/' || rider5_id || '/documents/aadhaar/1705123456802.jpg', '5678 9012 3456',
    'MANUAL_UPLOAD', FALSE, 1, 'Aadhaar image is blurry and unreadable. Please upload a clear image.', '{}'::jsonb, NOW() - INTERVAL '8 days'
  ),
  (
    rider5_id, 'pan', 'https://example.com/r2/riders/' || rider5_id || '/documents/pan/1705123456803.jpg',
    'riders/' || rider5_id || '/documents/pan/1705123456803.jpg', 'UVWXY7890Z',
    'MANUAL_UPLOAD', FALSE, 1, 'PAN number does not match the image. Please verify and re-upload.', '{}'::jsonb, NOW() - INTERVAL '7 days'
  ),
  -- New upload after rejection (latest version)
  (
    rider5_id, 'aadhaar', 'https://example.com/r2/riders/' || rider5_id || '/documents/aadhaar/1705123456804.jpg',
    'riders/' || rider5_id || '/documents/aadhaar/1705123456804.jpg', '5678 9012 3456',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{"reupload_after_rejection": true}'::jsonb, NOW() - INTERVAL '2 days'
  ),
  (
    rider5_id, 'dl', 'https://example.com/r2/riders/' || rider5_id || '/documents/dl/1705123456805.jpg',
    'riders/' || rider5_id || '/documents/dl/1705123456805.jpg', 'MH-12-IJ-7890',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '6 days'
  ),
  (
    rider5_id, 'rc', 'https://example.com/r2/riders/' || rider5_id || '/documents/rc/1705123456806.jpg',
    'riders/' || rider5_id || '/documents/rc/1705123456806.jpg', 'MH-12-KL-1234',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '5 days'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- RIDER 6: Mix with some documents already approved by agent
-- ============================================================================

DO $$
DECLARE
  rider6_id INTEGER;
BEGIN
  INSERT INTO riders (
    mobile, country_code, name, aadhaar_number, pan_number, dob,
    onboarding_stage, kyc_status, status, city, state, pincode, address,
    lat, lon, default_language, created_at, updated_at
  ) VALUES (
    '9876543215', '+91', 'Rahul Mehta', '6789 0123 4567', 'ZABCD1234E',
    '1989-11-30', 'KYC', 'REVIEW', 'INACTIVE', 'Chennai', 'Tamil Nadu',
    '600001', '987, T Nagar, Chennai', 13.0827, 80.2707, 'en',
    NOW() - INTERVAL '18 days', NOW() - INTERVAL '1 day'
  ) ON CONFLICT (mobile) DO UPDATE SET 
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO rider6_id;
  
  IF rider6_id IS NULL THEN
    SELECT id INTO rider6_id FROM riders WHERE mobile = '9876543215';
  END IF;

  INSERT INTO rider_documents (
    rider_id, doc_type, file_url, r2_key, doc_number, verification_method,
    verified, verifier_user_id, rejected_reason, metadata, created_at
  ) VALUES
  -- Approved by agent
  (
    rider6_id, 'aadhaar', 'https://example.com/r2/riders/' || rider6_id || '/documents/aadhaar/1705123456807.jpg',
    'riders/' || rider6_id || '/documents/aadhaar/1705123456807.jpg', '6789 0123 4567',
    'MANUAL_UPLOAD', TRUE, 1, NULL, '{}'::jsonb, NOW() - INTERVAL '15 days'
  ),
  (
    rider6_id, 'pan', 'https://example.com/r2/riders/' || rider6_id || '/documents/pan/1705123456808.jpg',
    'riders/' || rider6_id || '/documents/pan/1705123456808.jpg', 'ZABCD1234E',
    'MANUAL_UPLOAD', TRUE, 1, NULL, '{}'::jsonb, NOW() - INTERVAL '14 days'
  ),
  (
    rider6_id, 'selfie', 'https://example.com/r2/riders/' || rider6_id || '/documents/selfie/1705123456809.jpg',
    'riders/' || rider6_id || '/documents/selfie/1705123456809.jpg', NULL,
    'MANUAL_UPLOAD', TRUE, 1, NULL, '{}'::jsonb, NOW() - INTERVAL '13 days'
  ),
  -- Still pending
  (
    rider6_id, 'dl', 'https://example.com/r2/riders/' || rider6_id || '/documents/dl/1705123456810.jpg',
    'riders/' || rider6_id || '/documents/dl/1705123456810.jpg', 'TN-09-MN-5678',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '12 days'
  ),
  (
    rider6_id, 'rc', 'https://example.com/r2/riders/' || rider6_id || '/documents/rc/1705123456811.jpg',
    'riders/' || rider6_id || '/documents/rc/1705123456811.jpg', 'TN-09-OP-9012',
    'MANUAL_UPLOAD', FALSE, NULL, NULL, '{}'::jsonb, NOW() - INTERVAL '11 days'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================

-- After inserting this data, you can test:
-- 
-- 1. Rider with mobile 9876543210 (Rajesh Kumar):
--    - Mix of APP_VERIFIED (aadhaar, pan) and MANUAL_UPLOAD (dl, rc, selfie) - pending
--    - Test: Should show APP_VERIFIED docs with only numbers, MANUAL_UPLOAD with images
--
-- 2. Rider with mobile 9876543211 (Priya Sharma):
--    - All APP_VERIFIED - should show only doc numbers, no images, no actions
--    - Test: Verify UI shows "App Verified" badge, no edit/approve buttons
--
-- 3. Rider with mobile 9876543212 (Amit Patel):
--    - All MANUAL_UPLOAD - should show all images, allow edit/approve/reject
--    - Test: Approve all docs → should update KYC status to APPROVED
--
-- 4. Rider with mobile 9876543213 (Sneha Reddy):
--    - Partial documents - only aadhaar and pan uploaded and verified
--    - Test: Verify missing documents are shown as "No document uploaded"
--
-- 5. Rider with mobile 9876543214 (Vikram Singh):
--    - Rejected documents - shows rejection reasons, has re-uploaded aadhaar
--    - Test: Verify rejection reasons are displayed, latest version is shown
--
-- 6. Rider with mobile 9876543215 (Rahul Mehta):
--    - Partially approved - some docs approved by agent, some pending
--    - Test: Verify approved docs show verified status, pending docs show actions
--
-- Test scenarios:
-- - Approve all MANUAL_UPLOAD docs for Rider 9876543212 → should update KYC status to APPROVED
-- - Edit document number/image for Rider 9876543212 → should replace old R2 file
-- - Reject a document for Rider 9876543212 → should set rejected_reason
-- - View APP_VERIFIED documents for Rider 9876543211 → should show only doc numbers
-- - Check onboarding status upgrade after approving all required docs
--
-- To find rider IDs after insertion:
-- SELECT id, mobile, name FROM riders WHERE mobile IN ('9876543210', '9876543211', '9876543212', '9876543213', '9876543214', '9876543215');
