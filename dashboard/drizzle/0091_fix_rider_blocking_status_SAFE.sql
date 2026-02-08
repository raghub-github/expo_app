-- Migration: Fix Rider Blocking Status Logic (SAFE VERSION)
-- Date: 2026-02-08
-- Description: Fix the rider status update logic when blocking/unblocking services

-- This is a safer version that:
-- 1. First checks what data exists in the database
-- 2. Only updates rows that actually need fixing
-- 3. Provides verification queries to run before and after

-- ============================================================================
-- STEP 0: DIAGNOSTIC QUERIES (Run these first to understand your data)
-- ============================================================================

-- Check what service_type values exist in blacklist_history
-- This tells us if the DB uses uppercase (ALL, FOOD) or lowercase (all, food)
DO $$ 
BEGIN
  RAISE NOTICE 'Checking service_type values in blacklist_history...';
END $$;

SELECT 
  service_type,
  COUNT(*) as count,
  COUNT(CASE WHEN banned = true THEN 1 END) as banned_count,
  COUNT(CASE WHEN banned = false THEN 1 END) as unbanned_count
FROM blacklist_history
GROUP BY service_type
ORDER BY service_type;

-- Check current rider statuses
DO $$ 
BEGIN
  RAISE NOTICE 'Checking current rider statuses...';
END $$;

SELECT 
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN onboarding_stage = 'ACTIVE' THEN 1 END) as onboarding_complete
FROM riders
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- ============================================================================
-- STEP 1: Fix riders who should be BLOCKED but are INACTIVE
-- ============================================================================

-- First, let's see how many riders would be affected (DRY RUN)
DO $$ 
BEGIN
  RAISE NOTICE 'Riders that will be updated from INACTIVE to BLOCKED:';
END $$;

SELECT 
  r.id,
  r.name,
  r.mobile,
  r.status as current_status,
  r.onboarding_stage,
  'BLOCKED' as new_status,
  bh.service_type,
  bh.created_at as blocked_at
FROM riders r
JOIN blacklist_history bh ON bh.rider_id = r.id
WHERE r.status = 'INACTIVE'
AND r.deleted_at IS NULL
  AND LOWER(bh.service_type::text) = 'all'  -- Cast to text and compare lowercase
AND bh.banned = true
AND bh.is_permanent = true
AND NOT EXISTS (
  -- Ensure there's no more recent whitelist
  SELECT 1 FROM blacklist_history bh2
  WHERE bh2.rider_id = r.id
  AND LOWER(bh2.service_type::text) = 'all'
  AND bh2.banned = false
  AND bh2.created_at > bh.created_at
)
ORDER BY bh.created_at DESC;

-- Now do the actual update
DO $$ 
BEGIN
  RAISE NOTICE 'Updating riders from INACTIVE to BLOCKED...';
END $$;

UPDATE riders r
SET status = 'BLOCKED',
    updated_at = NOW()
WHERE r.status = 'INACTIVE'
AND r.deleted_at IS NULL
AND EXISTS (
  SELECT 1 FROM blacklist_history bh
  WHERE bh.rider_id = r.id
  AND LOWER(bh.service_type::text) = 'all'  -- Cast to text and compare lowercase
  AND bh.banned = true
  AND bh.is_permanent = true
  AND NOT EXISTS (
    SELECT 1 FROM blacklist_history bh2
    WHERE bh2.rider_id = r.id
    AND LOWER(bh2.service_type::text) = 'all'
    AND bh2.banned = false
    AND bh2.created_at > bh.created_at
  )
);

-- ============================================================================
-- STEP 2: Fix riders who are ACTIVE but haven't completed onboarding
-- ============================================================================

-- First, let's see how many riders would be affected (DRY RUN)
DO $$ 
BEGIN
  RAISE NOTICE 'Riders that will be updated from ACTIVE to INACTIVE (onboarding not complete):';
END $$;

SELECT 
  r.id,
  r.name,
  r.mobile,
  r.status as current_status,
  r.onboarding_stage,
  r.kyc_status,
  'INACTIVE' as new_status
FROM riders r
WHERE r.status = 'ACTIVE'
AND r.deleted_at IS NULL
AND r.onboarding_stage != 'ACTIVE'
AND NOT EXISTS (
  -- Make sure they're not currently blocked (if they are, they should stay ACTIVE until blocked)
  SELECT 1 FROM blacklist_history bh
  WHERE bh.rider_id = r.id
  AND bh.banned = true
  AND (bh.is_permanent = true OR (bh.expires_at IS NOT NULL AND bh.expires_at > NOW()))
  AND NOT EXISTS (
    SELECT 1 FROM blacklist_history bh2
    WHERE bh2.rider_id = r.id
    AND bh2.service_type = bh.service_type
    AND bh2.banned = false
    AND bh2.created_at > bh.created_at
  )
);

-- Now do the actual update
DO $$ 
BEGIN
  RAISE NOTICE 'Updating riders from ACTIVE to INACTIVE (onboarding incomplete)...';
END $$;

UPDATE riders r
SET status = 'INACTIVE',
    updated_at = NOW()
WHERE r.status = 'ACTIVE'
AND r.deleted_at IS NULL
AND r.onboarding_stage != 'ACTIVE'
AND NOT EXISTS (
  SELECT 1 FROM blacklist_history bh
  WHERE bh.rider_id = r.id
  AND bh.banned = true
  AND (bh.is_permanent = true OR (bh.expires_at IS NOT NULL AND bh.expires_at > NOW()))
  AND NOT EXISTS (
    SELECT 1 FROM blacklist_history bh2
    WHERE bh2.rider_id = r.id
    AND bh2.service_type = bh.service_type
    AND bh2.banned = false
    AND bh2.created_at > bh.created_at
  )
);

-- ============================================================================
-- STEP 3: VERIFICATION QUERIES (Run after migration)
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE 'Migration complete! Running verification queries...';
END $$;

-- Verify: All riders with permanent all-service blocks should have status = BLOCKED
DO $$ 
BEGIN
  RAISE NOTICE 'Checking riders with permanent all-service blocks:';
END $$;

SELECT 
  r.id,
  r.name,
  r.mobile,
  r.status,
  r.onboarding_stage,
  r.kyc_status,
  CASE 
    WHEN r.status = 'BLOCKED' THEN '✓ Correct'
    ELSE '✗ INCORRECT - Should be BLOCKED!'
  END as validation
FROM riders r
JOIN blacklist_history bh ON bh.rider_id = r.id
WHERE LOWER(bh.service_type::text) = 'all'
AND bh.banned = true
AND bh.is_permanent = true
AND r.deleted_at IS NULL
AND NOT EXISTS (
  SELECT 1 FROM blacklist_history bh2
  WHERE bh2.rider_id = r.id
  AND LOWER(bh2.service_type::text) = 'all'
  AND bh2.banned = false
  AND bh2.created_at > bh.created_at
)
ORDER BY bh.created_at DESC;

-- Verify: All ACTIVE riders should have onboarding_stage = ACTIVE
DO $$ 
BEGIN
  RAISE NOTICE 'Checking all ACTIVE riders:';
END $$;

SELECT 
  id,
  name,
  mobile,
  status,
  onboarding_stage,
  kyc_status,
  CASE 
    WHEN onboarding_stage = 'ACTIVE' THEN '✓ Correct'
    ELSE '✗ INCORRECT - Onboarding not complete!'
  END as validation
FROM riders
WHERE status = 'ACTIVE'
AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Summary counts
DO $$ 
BEGIN
  RAISE NOTICE 'Final summary:';
END $$;

SELECT 
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN onboarding_stage = 'ACTIVE' THEN 1 END) as onboarding_complete,
  COUNT(CASE WHEN onboarding_stage != 'ACTIVE' THEN 1 END) as onboarding_incomplete
FROM riders
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- Add helpful comment to table
COMMENT ON TABLE blacklist_history IS 
'Blacklist/whitelist history for riders. 
When permanently blocking all services (service_type = ALL/all, is_permanent = true), 
rider status should be BLOCKED. 
When unblocking, status should only be ACTIVE if onboarding_stage = ACTIVE.';

-- Success message
DO $$ 
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Review the verification queries above.';
  RAISE NOTICE '========================================';
END $$;
