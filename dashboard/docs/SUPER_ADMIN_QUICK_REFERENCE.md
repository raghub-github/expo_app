# Super Admin Creation - Quick Reference

## ✅ Fields You MUST Fill (Required)

| Field | Example Value | Notes |
|-------|--------------|-------|
| `system_user_id` | `SUPER_ADMIN_001` | Unique identifier (text) |
| `full_name` | `John Doe` | Full name (text) |
| `email` | `john.doe@example.com` | **Must match Supabase Auth email if using OAuth** |
| `mobile` | `+919876543210` | 10-15 digits, `+` optional |
| `primary_role` | `SUPER_ADMIN` | Use exactly: `'SUPER_ADMIN'` |
| `status` | `ACTIVE` | Use `'ACTIVE'` for immediate access |

## ⏭️ Fields You Can SKIP (Leave NULL)

- `first_name` - NULL
- `last_name` - NULL  
- `alternate_mobile` - NULL
- `role_display_name` - NULL (or set to "Super Administrator")
- `department` - NULL
- `team` - NULL
- `reports_to_id` - NULL (first user has no manager)
- `manager_name` - NULL
- `status_reason` - NULL
- `created_by` - NULL (first user)
- `created_by_name` - NULL
- `approved_by` - NULL (first user)
- `approved_at` - NULL
- `deleted_at` - NULL
- `deleted_by` - NULL

## 📝 Optional Fields (Recommended to Set)

| Field | Recommended Value | Why |
|-------|------------------|-----|
| `is_email_verified` | `true` | If email is verified |
| `is_mobile_verified` | `true` | If mobile is verified |
| `role_display_name` | `'Super Administrator'` | For UI display |

## 🔑 Critical: Email Matching

**If you're using Google OAuth login**, the `email` field **MUST match exactly** with the email in your Supabase Auth users table.

To check your Supabase Auth email:
1. Go to Supabase Dashboard
2. Navigate to Authentication → Users
3. Find your Google OAuth user
4. Copy the email exactly
5. Use that exact email in the `system_users` table

## 📱 Mobile Number Format

The mobile number must match this pattern: `^\+?[0-9]{10,15}$`

✅ **Valid Examples:**
- `+919876543210` (with country code)
- `9876543210` (10 digits)
- `919876543210` (11 digits)

❌ **Invalid Examples:**
- `98765` (too short, less than 10 digits)
- `+1-234-567-8900` (has dashes/spaces)
- `abc123` (has letters)

## 🚀 Quick SQL Template

```sql
INSERT INTO public.system_users (
  system_user_id,      -- ⚠️ CHANGE: Your unique ID
  full_name,           -- ⚠️ CHANGE: Your name
  email,               -- ⚠️ CHANGE: Your email (match Supabase Auth)
  mobile,              -- ⚠️ CHANGE: Your mobile (10-15 digits)
  primary_role,        -- ✅ Keep: 'SUPER_ADMIN'
  status,              -- ✅ Keep: 'ACTIVE'
  is_email_verified,   -- ✅ Set: true
  is_mobile_verified   -- ✅ Set: true
) VALUES (
  'SUPER_ADMIN_001',
  'Your Name',
  'your.email@example.com',
  '+919876543210',
  'SUPER_ADMIN',
  'ACTIVE',
  true,
  true
);
```

## ✅ After Creation

1. Verify the user was created:
   ```sql
   SELECT * FROM system_users WHERE email = 'your.email@example.com';
   ```

2. Try logging in with:
   - Email/password (if set up in Supabase Auth)
   - Google OAuth (if email matches)

3. You should now be able to access the dashboard!
