-- Migration: Fix Rider Blocking Status Logic
-- Date: 2026-02-08
-- Description: Fix the rider status update logic when blocking/unblocking services
-- 
-- IMPORTANT: This migration uses LOWER(service_type::text) for case-insensitive matching
-- to handle both uppercase ('ALL') and lowercase ('all') service_type values.
-- The ::text cast is required because service_type may be stored as an enum or custom type.

-- ============================================================================
-- Fix 1: Riders with permanent all-service blocks should have status = BLOCKED
-- ============================================================================

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
    -- Ensure there's no more recent whitelist
    SELECT 1 FROM blacklist_history bh2
    WHERE bh2.rider_id = r.id
    AND LOWER(bh2.service_type::text) = 'all'
    AND bh2.banned = false
    AND bh2.created_at > bh.created_at
  )
);

-- ============================================================================
-- Fix 2: ACTIVE riders must have completed onboarding (onboarding_stage = ACTIVE)
-- ============================================================================

UPDATE riders r
SET status = 'INACTIVE',
    updated_at = NOW()
WHERE r.status = 'ACTIVE'
AND r.deleted_at IS NULL
AND r.onboarding_stage != 'ACTIVE';

-- ============================================================================
-- Verification Queries (for manual checking)
-- ============================================================================

-- Check 1: Riders with permanent blocks should be BLOCKED
-- Run this after migration - should return 0 incorrect rows
/*
SELECT 
  r.id, r.name, r.mobile, r.status, r.onboarding_stage,
  CASE WHEN r.status = 'BLOCKED' THEN 'OK' ELSE 'ERROR' END as check_status
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
AND r.status != 'BLOCKED';
*/

-- Check 2: ACTIVE riders must have onboarding_stage = ACTIVE
-- Run this after migration - should return 0 rows
/*
SELECT id, name, mobile, status, onboarding_stage, kyc_status
FROM riders
WHERE status = 'ACTIVE'
AND deleted_at IS NULL
AND onboarding_stage != 'ACTIVE';
*/

-- Add documentation
COMMENT ON TABLE blacklist_history IS 
'Blacklist/whitelist history for riders. When permanently blocking all services, rider status should be BLOCKED. When unblocking, status should only be ACTIVE if onboarding_stage = ACTIVE.';
