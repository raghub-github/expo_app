# ⚡ SIMPLE 2-STEP GUIDE

## Problem
Your database's `vehicle_type` enum doesn't have all the values we need (like `ev_bike`).

## Solution (2 SQL scripts to run in order)

### STEP 1: Fix the Enum (Run this FIRST!)
**File**: `dashboard/FIX_ENUMS_FIRST.sql`

1. Open file `dashboard/FIX_ENUMS_FIRST.sql`
2. Copy ALL contents
3. Paste into Supabase SQL Editor
4. Click **Run**
5. Wait for success message

**What it does**: Adds missing values (`ev_bike`, `cycle`, `cng_auto`, etc.) to your `vehicle_type` enum.

### STEP 2: Create Test Data
**File**: `dashboard/FINAL_SQL_SCRIPT.sql`

1. Open file `dashboard/FINAL_SQL_SCRIPT.sql`  
2. Copy ALL contents
3. Paste into Supabase SQL Editor
4. Click **Run**
5. Note the rider IDs from output

**What it does**: Creates 7 test riders with complete document data.

---

## That's It!

After running both scripts, navigate to:
```
http://localhost:3000/dashboard/riders/[ID]/onboarding
```

Replace `[ID]` with a rider ID from the SQL output.

Start clicking "Approve" on documents and watch the status update automatically! ✅
