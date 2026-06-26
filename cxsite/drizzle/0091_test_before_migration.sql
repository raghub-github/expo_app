-- Pre-Migration Test Script
-- Run this BEFORE running the migration to see what will be affected

-- ============================================================================
-- Test 1: Check service_type values and their types
-- ============================================================================
SELECT 
  'service_type values in database:' as test,
  service_type,
  service_type::text as as_text,
  LOWER(service_type::text) as lowercase,
  COUNT(*) as count
FROM blacklist_history
GROUP BY service_type
ORDER BY service_type;

-- ============================================================================
-- Test 2: Riders that will be updated from INACTIVE to BLOCKED
-- ============================================================================
SELECT 
  'Riders to update: INACTIVE → BLOCKED' as test,
  COUNT(*) as count
FROM riders r
WHERE r.status = 'INACTIVE'
AND r.deleted_at IS NULL
AND EXISTS (
  SELECT 1 FROM blacklist_history bh
  WHERE bh.rider_id = r.id
  AND LOWER(bh.service_type::text) = 'all'
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

-- Show details of riders that will be updated
SELECT 
  r.id,
  r.name,
  r.mobile,
  r.status as current_status,
  'BLOCKED' as will_become,
  r.onboarding_stage,
  r.kyc_status
FROM riders r
WHERE r.status = 'INACTIVE'
AND r.deleted_at IS NULL
AND EXISTS (
  SELECT 1 FROM blacklist_history bh
  WHERE bh.rider_id = r.id
  AND LOWER(bh.service_type::text) = 'all'
  AND bh.banned = true
  AND bh.is_permanent = true
  AND NOT EXISTS (
    SELECT 1 FROM blacklist_history bh2
    WHERE bh2.rider_id = r.id
    AND LOWER(bh2.service_type::text) = 'all'
    AND bh2.banned = false
    AND bh2.created_at > bh.created_at
  )
)
LIMIT 10;

-- ============================================================================
-- Test 3: Riders that will be updated from ACTIVE to INACTIVE
-- ============================================================================
SELECT 
  'Riders to update: ACTIVE → INACTIVE (onboarding incomplete)' as test,
  COUNT(*) as count
FROM riders r
WHERE r.status = 'ACTIVE'
AND r.deleted_at IS NULL
AND r.onboarding_stage != 'ACTIVE';

-- Show details
SELECT 
  id,
  name,
  mobile,
  status as current_status,
  'INACTIVE' as will_become,
  onboarding_stage,
  kyc_status,
  'Reason: Onboarding not complete' as reason
FROM riders
WHERE status = 'ACTIVE'
AND deleted_at IS NULL
AND onboarding_stage != 'ACTIVE'
LIMIT 10;

-- ============================================================================
-- Test 4: Summary of current status distribution
-- ============================================================================
SELECT 
  'Current status distribution:' as test,
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN onboarding_stage = 'ACTIVE' THEN 1 END) as onboarding_complete
FROM riders
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- ============================================================================
-- Summary
-- ============================================================================
SELECT 
  '=== MIGRATION SUMMARY ===' as info,
  (SELECT COUNT(*) FROM riders WHERE status = 'INACTIVE' AND deleted_at IS NULL 
   AND EXISTS (
     SELECT 1 FROM blacklist_history bh
     WHERE bh.rider_id = riders.id
     AND LOWER(bh.service_type::text) = 'all'
     AND bh.banned = true
     AND bh.is_permanent = true
   )) as will_be_blocked,
  (SELECT COUNT(*) FROM riders WHERE status = 'ACTIVE' AND deleted_at IS NULL 
   AND onboarding_stage != 'ACTIVE') as will_be_inactive,
  (SELECT COUNT(*) FROM riders WHERE deleted_at IS NULL) as total_riders;
