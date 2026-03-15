-- SQL Script to Clean Up Stale Progress Rows
-- Run this in your Supabase SQL Editor to mark orphaned progress rows as COMPLETED

-- This fixes the "Incomplete onboarding draft found" banner showing incorrectly
-- when all stores have actually completed their onboarding (step 9/9)

UPDATE merchant_store_registration_progress
SET 
  registration_status = 'COMPLETED',
  updated_at = NOW()
WHERE 
  -- Only update progress rows that are:
  -- 1. Not yet marked as COMPLETED
  registration_status != 'COMPLETED'
  -- 2. Have no associated store_id (orphaned draft records)
  AND store_id IS NULL
  -- 3. Belong to a parent that has NO incomplete stores
  AND parent_id IN (
    SELECT DISTINCT parent_id
    FROM merchant_stores
    WHERE parent_id NOT IN (
      -- Exclude parents that have stores with incomplete onboarding
      SELECT DISTINCT parent_id
      FROM merchant_stores
      WHERE 
        approval_status = 'DRAFT'
        OR (current_onboarding_step IS NOT NULL AND current_onboarding_step < 9)
    )
  );

-- Check how many rows were affected
-- The result should show the number of stale progress rows that were cleaned up
