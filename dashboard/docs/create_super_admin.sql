-- ============================================================================
-- CREATE SUPER ADMIN USER
-- ============================================================================
-- This script creates the first super admin user in the system_users table.
-- 
-- IMPORTANT: Replace the placeholder values with your actual data:
-- 1. system_user_id: A unique identifier (e.g., SUPER_ADMIN_001)
-- 2. full_name: Your full name
-- 3. email: Your email (MUST match the email in Supabase Auth if using OAuth)
-- 4. mobile: Your mobile number (10-15 digits, + optional)
-- ============================================================================

INSERT INTO public.system_users (
  system_user_id,
  full_name,
  email,
  mobile,
  primary_role,
  status,
  is_email_verified,
  is_mobile_verified,
  role_display_name
) VALUES (
  'SUPER_ADMIN_001',                    -- ⚠️ CHANGE THIS: Your unique system user ID
  'Super Administrator',                -- ⚠️ CHANGE THIS: Your full name
  'admin@gatimitra.com',                -- ⚠️ CHANGE THIS: Your email (must match Supabase Auth email)
  '+919876543210',                      -- ⚠️ CHANGE THIS: Your mobile (10-15 digits, + optional)
  'SUPER_ADMIN',                        -- ✅ Keep as SUPER_ADMIN
  'ACTIVE',                             -- ✅ Use ACTIVE for immediate access
  true,                                 -- ✅ Set to true if email is verified
  true,                                 -- ✅ Set to true if mobile is verified
  'Super Administrator'                 -- Optional: Display name
);

-- ============================================================================
-- VERIFY THE USER WAS CREATED
-- ============================================================================
SELECT 
  id,
  system_user_id,
  full_name,
  email,
  mobile,
  primary_role,
  status,
  created_at
FROM public.system_users
WHERE system_user_id = 'SUPER_ADMIN_001';  -- Change to match your system_user_id

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. Email Matching: If you're using Google OAuth, the email in system_users
--    MUST match the email in your Supabase Auth users table exactly.
--    
-- 2. Mobile Format: Must be 10-15 digits with optional + prefix
--    Valid: +919876543210, 9876543210, 919876543210
--    Invalid: 98765 (too short), +1-234-567-8900 (has dashes)
--
-- 3. First User: Since this is the first user, these fields are NULL:
--    - created_by (no one created this user)
--    - approved_by (self-approved or no approver needed)
--    - reports_to_id (no manager)
--
-- 4. After Creation: You can now log in with:
--    - Email/password (if set up in Supabase Auth)
--    - Google OAuth (if email matches)
--
-- ============================================================================
