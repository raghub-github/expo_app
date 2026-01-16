# Quick Start Guide

## 1. Environment Setup (5 minutes)

Create `dashboard/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://uoxkwznciiibubtiiffh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_supabase_dashboard
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_supabase_dashboard
DATABASE_URL=postgresql://postgres.uoxkwznciiibubtiiffh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

**Where to get values**:
- Supabase Dashboard → Settings → API (for Supabase keys)
- Supabase Dashboard → Settings → Database → Connection string → Pooler (for DATABASE_URL)

## 2. Test Database Connection (2 minutes)

```bash
cd dashboard
npm install  # Install dependencies including tsx
npm run test:db
```

**Expected**: ✅ Connection successful, table exists, user count shown

## 3. Create Super Admin (3 minutes)

### Option A: Supabase Dashboard (Easiest)

1. Go to Supabase Dashboard → **SQL Editor**
2. Click **New query**
3. Paste and run:

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
  'SUPER_ADMIN_001',
  'Raghu Bhunia',
  'raghubhunia53@gmail.com',
  '8972157515',
  'SUPER_ADMIN',
  'ACTIVE',
  true,
  true,
  'Super Administrator'
);
```

4. Verify:
```sql
SELECT * FROM public.system_users WHERE email = 'raghubhunia53@gmail.com';
```

### Option B: psql Command Line

```bash
psql "postgresql://postgres.uoxkwznciiibubtiiffh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require"
```

Then run the same SQL as Option A.

## 4. Verify OAuth Configuration (2 minutes)

### Supabase:
- Authentication → URL Configuration
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

### Google Cloud Console:
- APIs & Services → Credentials
- Authorized JavaScript origins: `http://localhost:3000`
- Authorized redirect URIs: `https://uoxkwznciiibubtiiffh.supabase.co/auth/v1/callback`

## 5. Test Login (2 minutes)

```bash
npm run dev
```

1. Open `http://localhost:3000/login`
2. Click "Sign in with Google"
3. Complete OAuth
4. Should redirect to `/dashboard` ✅

## Troubleshooting

**Database errors?**
- Check `DATABASE_URL` format
- Verify password
- Run `npm run test:db`

**404 on /dashboard?**
- Check middleware logs
- Verify session cookies are set
- Check browser console

**OAuth not working?**
- Verify redirect URLs in both Supabase and Google Console
- Check email matches between Supabase Auth and system_users

**User not found?**
- Create user in `system_users` table
- Ensure email matches exactly
- Set status to `'ACTIVE'`

## Full Documentation

- Complete Setup: `docs/COMPLETE_SETUP_GUIDE.md`
- Super Admin Creation: `docs/CREATE_SUPER_ADMIN.md`
- OAuth Setup: `docs/GOOGLE_OAUTH_SETUP.md`
- Troubleshooting: `docs/OAUTH_TROUBLESHOOTING.md`
