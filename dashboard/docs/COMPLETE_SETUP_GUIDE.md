# Complete Dashboard Setup Guide

This guide walks you through setting up the dashboard from scratch, step by step.

## Step 1: Environment Variables Setup

### 1.1 Create `.env.local` File

**Location**: `dashboard/.env.local` (NOT in root directory)

Create this file in the `dashboard` directory with the following content:

```env
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://uoxkwznciiibubtiiffh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Database Configuration (Required)
DATABASE_URL=postgresql://postgres.uoxkwznciiibubtiiffh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

### 1.2 Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `uoxkwznciiibubtiiffh`
3. Navigate to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

### 1.3 Get Database Connection String

1. In Supabase Dashboard, go to **Settings** → **Database**
2. Find **Connection string** section
3. Select **Connection pooling** tab
4. Copy the **URI** format (port 6543)
5. Replace `[YOUR-PASSWORD]` with your actual database password
6. Format: `postgresql://postgres.uoxkwznciiibubtiiffh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`

### 1.4 Verify Environment File

- ✅ File location: `dashboard/.env.local`
- ✅ All variables are set (no empty values)
- ✅ No quotes around values (unless needed for special characters)
- ✅ Restart dev server after creating/updating `.env.local`

## Step 2: Test Database Connectivity

### 2.1 Install Dependencies

First, install `tsx` if not already installed:

```bash
cd dashboard
npm install --save-dev tsx
```

### 2.2 Run Database Test

```bash
npm run test:db
```

**Expected Output**:
- ✅ Connection successful
- ✅ Table `system_users` exists
- ✅ Current user count: X
- ✅ Super admin count: X

**If you see errors**:
- Check `DATABASE_URL` in `.env.local`
- Verify database password is correct
- Ensure connection string uses port 6543 (pooler)

## Step 3: Create Super Admin User

### 3.1 Method 1: Supabase Dashboard SQL Editor (Recommended)

1. **Open SQL Editor**:
   - Go to Supabase Dashboard → **SQL Editor**
   - Click **New query**

2. **Run Super Admin Creation SQL**:
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

3. **Verify Creation**:
   ```sql
   SELECT 
     id,
     system_user_id,
     full_name,
     email,
     mobile,
     primary_role,
     status
   FROM public.system_users
   WHERE email = 'raghubhunia53@gmail.com';
   ```

### 3.2 Method 2: psql Command Line

1. **Connect to Database**:
   ```bash
   psql "postgresql://postgres.uoxkwznciiibubtiiffh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require"
   ```

2. **Run Insert Statement** (same SQL as Method 1)

3. **Verify** (same SELECT query as Method 1)

### 3.3 Important Notes

- **Email must match**: The `email` in `system_users` must exactly match the email in Supabase Auth (if using OAuth)
- **Mobile format**: 10-15 digits, `+` prefix optional
- **Status**: Use `'ACTIVE'` for immediate access
- **First user**: `created_by`, `approved_by`, `reports_to_id` can be NULL

## Step 4: Verify OAuth Configuration

### 4.1 Supabase Dashboard Settings

1. Go to **Authentication** → **URL Configuration**
2. **Site URL**: `http://localhost:3000`
3. **Redirect URLs**: Add `http://localhost:3000/auth/callback`

### 4.2 Google Cloud Console Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Find your OAuth 2.0 Client ID
4. **Authorized JavaScript origins**: `http://localhost:3000` ✅
5. **Authorized redirect URIs**: `https://uoxkwznciiibubtiiffh.supabase.co/auth/v1/callback` ✅

### 4.3 Supabase OAuth Provider

1. Go to Supabase Dashboard → **Authentication** → **Providers**
2. Click **Google**
3. Verify:
   - ✅ Enabled
   - ✅ Client ID is set
   - ✅ Client Secret is set

## Step 5: Test Complete Flow

### 5.1 Start Dev Server

```bash
cd dashboard
npm run dev
```

### 5.2 Test Authentication Flow

1. Navigate to `http://localhost:3000/login`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Verify redirect to `/dashboard`
5. Check dashboard page loads

### 5.3 Expected Results

- ✅ No database errors in terminal
- ✅ No 404 errors
- ✅ Successful OAuth redirect
- ✅ Dashboard page loads
- ✅ User can see dashboard content

## Step 6: Troubleshooting

### Database Connection Issues

**Error**: "Failed query" or "Connection refused"
- Check `DATABASE_URL` format
- Verify password is correct
- Ensure using pooler port (6543)
- Test with `npm run test:db`

### OAuth Issues

**Error**: "authentication_failed" or stuck on login page
- Verify redirect URL in Supabase Dashboard
- Check Google OAuth client configuration
- Ensure email in `system_users` matches Supabase Auth email

### 404 Errors

**Error**: "This page could not be found" on `/dashboard`
- Check middleware is not blocking access
- Verify session cookies are set
- Check browser console for errors

### Permission Issues

**Error**: User not found in system_users
- Create user in `system_users` table
- Ensure email matches exactly
- Set status to `'ACTIVE'`

## Quick Reference

### Environment Variables Checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` - From Supabase Dashboard → Settings → API
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - From Supabase Dashboard → Settings → API
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Dashboard → Settings → API
- [ ] `DATABASE_URL` - From Supabase Dashboard → Settings → Database (Pooler)

### Database Test Command

```bash
npm run test:db
```

### Create Super Admin SQL

See `docs/create_super_admin.sql` for ready-to-use SQL script.

### Verify User Exists

```sql
SELECT * FROM public.system_users WHERE email = 'your-email@example.com';
```

## Next Steps

After completing setup:

1. ✅ Test database connectivity
2. ✅ Create super admin user
3. ✅ Test OAuth login
4. ✅ Verify dashboard access
5. ✅ Configure additional users as needed
