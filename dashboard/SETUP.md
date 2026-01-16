# Dashboard Setup Guide

## Environment Variables

**IMPORTANT**: Create `.env.local` file in the `./dashboard` directory (not in the root).

Location: `./dashboard/.env.local`

Required variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database

# App Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_a_random_secret_here
```

## Getting Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`
4. Navigate to Settings > API > JWT Settings
5. Copy JWT Secret → `SUPABASE_JWT_SECRET`

## Database Connection

The `DATABASE_URL` should be the same connection string used by your backend. It should use the Supabase pooler connection for production.

Format: `postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-REGION.pooler.supabase.com:6543/postgres`

## Running the Dashboard

```bash
# From the root directory
npm run dev:dashboard

# Or from the dashboard directory
cd dashboard
npm run dev
```

The dashboard will be available at http://localhost:3000

## First Login

1. A Super Admin user must be created in the database first (via backend or direct database access)
2. The Super Admin user should have an entry in `system_users` table
3. The user's email should match a Supabase Auth user
4. Login with email/password or OTP

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` exists in `./dashboard/` directory
- Check that all required variables are set
- Restart the dev server after adding variables

### "Database connection error"
- Verify `DATABASE_URL` is correct
- Check database is accessible
- Ensure connection pool limits are not exceeded

### "Permission denied" errors
- Check user has proper roles assigned in `system_users` and `user_roles` tables
- Verify permissions are set in `role_permissions` table
- Check middleware is correctly checking permissions
