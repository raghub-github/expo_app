-- =============================================================================
-- CHECK CURRENT ENUM VALUES
-- Run this FIRST to see what values your database actually has
-- =============================================================================

-- Check vehicle_type enum
SELECT 
  '=== VEHICLE_TYPE ENUM VALUES ===' AS info,
  enumlabel AS value,
  enumsortorder AS order_num
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'vehicle_type'
ORDER BY e.enumsortorder;

-- Check onboarding_stage enum
SELECT 
  '=== ONBOARDING_STAGE ENUM VALUES ===' AS info,
  enumlabel AS value,
  enumsortorder AS order_num
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'onboarding_stage'
ORDER BY e.enumsortorder;

-- Check kyc_status enum
SELECT 
  '=== KYC_STATUS ENUM VALUES ===' AS info,
  enumlabel AS value,
  enumsortorder AS order_num
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'kyc_status'
ORDER BY e.enumsortorder;

-- Check fuel_type enum
SELECT 
  '=== FUEL_TYPE ENUM VALUES ===' AS info,
  enumlabel AS value,
  enumsortorder AS order_num
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'fuel_type'
ORDER BY e.enumsortorder;
