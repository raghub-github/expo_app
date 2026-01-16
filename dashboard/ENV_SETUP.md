# Environment Variables Setup

## Quick Setup

### Step 1: Create `.env.local` File

Create a file named `.env.local` in the `dashboard` directory (same level as `package.json`).

**File location**: `dashboard/.env.local`

### Step 2: Add Required Variables

Copy this template and fill in your actual values:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://uoxkwznciiibubtiiffh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Database Configuration
DATABASE_URL=postgresql://postgres.uoxkwznciiibubtiiffh:[YOUR_PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

### Step 3: Get Your Values

#### Supabase Credentials:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

#### Database Connection String:
1. In Supabase Dashboard, go to **Settings** → **Database**
2. Find **Connection string** section
3. Select **Connection pooling** tab
4. Copy the **URI** format
5. Replace `[YOUR-PASSWORD]` with your actual database password

**Format**:
```
postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

**Example** (replace with your actual password):
```
postgresql://postgres.uoxkwznciiibubtiiffh:YourPassword123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

### Step 4: Verify

After creating `.env.local`, test the connection:

```bash
cd dashboard
npm run test:db
```

**Expected output**:
```
✅ Loaded X environment variable(s) from .env.local
✅ Connection successful
✅ Table 'system_users' exists
```

## Important Notes

- ✅ File must be named exactly `.env.local` (with the dot at the start)
- ✅ File must be in the `dashboard` directory (not root)
- ✅ No quotes around values (unless the value itself contains spaces)
- ✅ Restart dev server after creating/updating `.env.local`
- ❌ Never commit `.env.local` to git (it's in .gitignore)

## Troubleshooting

### "DATABASE_URL environment variable is not set"
- Check that `.env.local` exists in `dashboard/` directory
- Verify file name is exactly `.env.local` (not `.env.local.txt`)
- Check that `DATABASE_URL=` line is present and has a value
- Make sure there are no syntax errors (no extra spaces around `=`)

### "Failed to load .env.local file"
- Verify file exists: `ls dashboard/.env.local` (or check in file explorer)
- Check file permissions (should be readable)
- Ensure you're running the script from the dashboard directory

### Connection Errors
- Verify `DATABASE_URL` format is correct
- Check that password is correct (no extra spaces)
- Ensure using pooler port (6543, not 5432)
- Verify database is accessible from your network

## Example .env.local File

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://uoxkwznciiibubtiiffh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVveGt3em5jaWlpYnVidGlpZmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1NjgwMDAsImV4cCI6MjA1MDE0NDAwMH0.example
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVveGt3em5jaWlpYnVidGlpZmZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDU2ODAwMCwiZXhwIjoyMDUwMTQ0MDAwfQ.example

# Database Configuration
DATABASE_URL=postgresql://postgres.uoxkwznciiibubtiiffh:YourActualPassword@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

**Note**: Replace the example values with your actual keys and password!
