-- ============================================================================
-- RLS POLICIES FOR AREA MANAGER DATA ACCESS
-- Migration: 0027_area_manager_rls_policies
-- Purpose: Allow merchants to read area manager information for their stores
-- ============================================================================

-- ============================================================================
-- 1. MERCHANT_STORES - Allow authenticated users to read area_manager_id
-- ============================================================================

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Allow read area_manager_id" ON public.merchant_stores;

-- Create simple read policy for area_manager_id field
-- This allows any authenticated user to read area_manager_id
CREATE POLICY "Allow read area_manager_id"
ON public.merchant_stores
FOR SELECT
USING (true); -- Allow all authenticated users to read

-- ============================================================================
-- 2. AREA_MANAGERS - Allow authenticated users to read area manager data
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.area_managers ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Allow read area managers" ON public.area_managers;

-- Create simple read policy
CREATE POLICY "Allow read area managers"
ON public.area_managers
FOR SELECT
USING (true); -- Allow all authenticated users to read

-- ============================================================================
-- 3. SYSTEM_USERS - Allow authenticated users to read user details for area managers
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Allow read system users for area managers" ON public.system_users;

-- Create read-only policy (SELECT only)
CREATE POLICY "Allow read system users for area managers"
ON public.system_users
FOR SELECT
USING (true); -- Allow all authenticated users to read

-- ============================================================================
-- 4. GRANT NECESSARY PERMISSIONS
-- ============================================================================

-- Grant SELECT permission to authenticated role (table-level grants)
-- RLS policies will control what data can be accessed
GRANT SELECT ON public.merchant_stores TO authenticated;
GRANT SELECT ON public.area_managers TO authenticated;
GRANT SELECT ON public.system_users TO authenticated;

-- Grant to service_role (if using service role key)
GRANT SELECT ON public.merchant_stores TO service_role;
GRANT SELECT ON public.area_managers TO service_role;
GRANT SELECT ON public.system_users TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Allow read area_manager_id" ON public.merchant_stores IS 
'Allows authenticated users to read the area_manager_id field';

COMMENT ON POLICY "Allow read area managers" ON public.area_managers IS 
'Allows authenticated users to read area manager data';

COMMENT ON POLICY "Allow read system users for area managers" ON public.system_users IS 
'Allows authenticated users to read system user details (name, email, phone) for area managers';
