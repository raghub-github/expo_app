# How to Create a Super Admin User

This guide will help you create the first super admin user in the `system_users` table.

## Required Fields (Must Fill)

These fields are **REQUIRED** and cannot be NULL:

1. **`system_user_id`** (text, unique)
   - Format: Any unique identifier (e.g., `SUPER_ADMIN_001`, `ADMIN_001`, `SA_001`)
   - Example: `SUPER_ADMIN_001`

2. **`full_name`** (text)
   - The user's full name
   - Example: `John Doe`

3. **`email`** (text, unique)
   - Must be a valid email format
   - Must be unique (not already in the table)
   - Example: `admin@gatimitra.com`

4. **`mobile`** (text)
   - Must match format: `^\+?[0-9]{10,15}$`
   - Can start with `+` (optional) followed by 10-15 digits
   - Examples:
     - `+919876543210` (with country code)
     - `9876543210` (without +, but must be 10-15 digits)
     - `919876543210` (without +)

5. **`primary_role`** (enum, NOT NULL)
   - Must be one of: `'SUPER_ADMIN'`, `'ADMIN'`, `'AGENT'`, `'AREA_MANAGER_MERCHANT'`, `'AREA_MANAGER_RIDER'`, `'SALES_TEAM'`, `'ADVERTISEMENT_TEAM'`, `'AUDIT_TEAM'`, `'COMPLIANCE_TEAM'`, `'SUPPORT_L1'`, `'SUPPORT_L2'`, `'SUPPORT_L3'`, `'FINANCE_TEAM'`, `'OPERATIONS_TEAM'`, `'DEVELOPER'`, `'READ_ONLY'`
   - For super admin: Use `'SUPER_ADMIN'`

6. **`status`** (enum, defaults to 'PENDING_ACTIVATION')
   - Must be one of: `'ACTIVE'`, `'SUSPENDED'`, `'DISABLED'`, `'PENDING_ACTIVATION'`, `'LOCKED'`
   - For immediate access: Use `'ACTIVE'`

## Optional Fields (Can Skip or Leave NULL)

These fields can be left NULL for the first user:

- `first_name` - NULL
- `last_name` - NULL
- `alternate_mobile` - NULL
- `role_display_name` - NULL (or set to something like "Super Administrator")
- `department` - NULL
- `team` - NULL
- `reports_to_id` - NULL (first user has no manager)
- `manager_name` - NULL
- `status_reason` - NULL
- `is_email_verified` - NULL or `true`
- `is_mobile_verified` - NULL or `true`
- `two_factor_enabled` - NULL or `false`
- `last_login_at` - NULL
- `last_activity_at` - NULL
- `login_count` - NULL (defaults to 0)
- `failed_login_attempts` - NULL (defaults to 0)
- `account_locked_until` - NULL
- `created_by` - NULL (first user, no creator)
- `created_by_name` - NULL
- `approved_by` - NULL (first user, self-approved or no approver)
- `approved_at` - NULL
- `deleted_at` - NULL
- `deleted_by` - NULL

## SQL Insert Statement

Here's a ready-to-use SQL statement. **Replace the values** with your actual data:

```sql
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
  'SUPER_ADMIN_001',                    -- Replace with your unique ID
  'Your Full Name',                     -- Replace with actual name
  'your.email@example.com',             -- Replace with actual email (must match Supabase Auth email if using OAuth)
  '+919876543210',                      -- Replace with actual mobile (10-15 digits, + optional)
  'SUPER_ADMIN',                        -- Keep as SUPER_ADMIN
  'ACTIVE',                             -- Use ACTIVE for immediate access
  true,                                 -- Set to true if email is verified
  true,                                 -- Set to true if mobile is verified
  'Super Administrator'                 -- Optional display name
);
```

## Important Notes

1. **Email Must Match Supabase Auth**: If you're using Google OAuth or email/password login, the `email` field **must match** the email in your Supabase Auth users table. Otherwise, the middleware won't be able to link the Supabase Auth user to the system user.

2. **Mobile Format**: The mobile number must be exactly 10-15 digits (with optional `+` prefix). Common formats:
   - Indian: `+919876543210` or `9876543210`
   - International: `+1234567890` or `1234567890`

3. **First User**: Since this is the first user, `created_by`, `approved_by`, and `reports_to_id` should be NULL.

4. **After Creating**: Once you create the user, you can:
   - Log in with the email/password if you've set it up in Supabase Auth
   - Or log in with Google OAuth if the email matches

## Verify the User Was Created

```sql
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
WHERE email = 'your.email@example.com';
```

## Link Existing Supabase Auth User

If you've already logged in with Google OAuth and have a Supabase Auth user, make sure:

1. The `email` in `system_users` matches the `email` in Supabase Auth
2. Or you can add a `supabase_auth_id` column (if it exists) and link them

To check your Supabase Auth users:
- Go to Supabase Dashboard → Authentication → Users
- Find your user and note the email
- Make sure the `system_users.email` matches exactly
