# Quick Deploy Instructions

## Problem: Drizzle Interactive Prompt

When running `npm run db:push`, Drizzle gets stuck asking about enum conflicts. This is because there's an existing `onboarding_status` enum in your database.

## Solution: Use SQL Migration Directly

Instead of using `drizzle-kit push`, use the SQL migration file directly.

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `backend/drizzle/0002_enterprise_rider_schema.sql`
4. Copy the entire contents
5. Paste into SQL Editor
6. Click **Run** or press `Ctrl+Enter`

### Option 2: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push

# Or directly execute SQL
supabase db execute -f backend/drizzle/0002_enterprise_rider_schema.sql
```

### Option 3: Using psql

```bash
# Set your DATABASE_URL in .env first
psql $DATABASE_URL -f backend/drizzle/0002_enterprise_rider_schema.sql
```

### Option 4: Cancel and Use SQL Directly

1. **Cancel the current process**: Press `Ctrl+C` in the terminal
2. **Use SQL migration directly** (see Option 1 above)

## Why This Happens

- Your database already has `onboarding_status` enum from previous migration
- New schema has `onboarding_stage` (different name) and `document_type` (new enum)
- Drizzle asks interactively which is which, but can't proceed without input

## After Deployment

Verify the schema:

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check rider ID is INTEGER
\d riders
```
