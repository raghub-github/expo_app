# Fix: "Incomplete onboarding draft found" Banner Issue

## Problem
The "Incomplete onboarding draft found. Resume and complete remaining steps" banner was showing on the post-login page even when all child stores had completed their onboarding (step 9/9) and were either VERIFIED or SUBMITTED.

## Root Cause
The query to fetch onboarding progress in `resolve-session/route.ts` was NOT filtering by `registration_status != 'COMPLETED'`. It was fetching ALL progress rows with `store_id = null`, including completed ones.

Even though a progress row had `registration_status = 'COMPLETED'`, if it had `current_step < 9`, the banner logic would still show it.

## Solution Implemented

### 1. Updated `/api/auth/resolve-session/route.ts`
**MAIN FIX:** Added `.neq("registration_status", "COMPLETED")` to the query:

```typescript
const { data: progress, error: progressError } = await db
  .from("merchant_store_registration_progress")
  .select("*")
  .eq("parent_id", parentId)
  .is("store_id", null)
  .neq("registration_status", "COMPLETED")  // ← CRITICAL FIX
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Also added check for stores that actually have incomplete steps:

```typescript
const hasIncompleteStore = storeList.some((s) => {
  const step = s.current_onboarding_step;
  return typeof step === "number" && step < 9;
});
```

The banner now only shows when:
- There's a progress row with `store_id = NULL` AND `registration_status != 'COMPLETED'`, AND
- Either: a DRAFT store exists, OR a store has `current_onboarding_step < 9`, OR the progress row has `current_step < 9`

### 2. Updated `/api/register-store/route.ts`
Added automatic cleanup when a store is submitted:

```typescript
// Mark the registration progress as COMPLETED after submission
await db
  .from('merchant_store_registration_progress')
  .update({ 
    registration_status: 'COMPLETED',
    store_id: storeData.id,
    updated_at: new Date().toISOString()
  })
  .eq('parent_id', parentId)
  .is('store_id', null)
  .neq('registration_status', 'COMPLETED');
```

This prevents new orphaned progress rows from causing the issue.

### 3. Created Diagnostic Tools
- `check-progress.js` - Script to inspect all progress rows
- `run-cleanup.js` - Script to mark stale progress as COMPLETED
- `cleanup-stale-progress.sql` - SQL cleanup script
- `/api/cleanup-stale-progress/route.ts` - Cleanup API endpoint

## Testing
1. Refresh the page at `http://localhost:3000/auth/post-login`
2. The "Incomplete onboarding draft" banner should no longer appear
3. The banner will only show when there's an actual incomplete store

## Verification Results
Running `node check-progress.js` showed:
```
Progress ID: 9
Parent ID: 43
Store ID: NULL ⚠️
Current Step: 7
Completed Steps: 6
Registration Status: COMPLETED ✅

Parent 43 stores:
- GMMC1001: APPROVED, step 9 ✅
- GMMC1003: SUBMITTED, step 9 ✅
- GMMC1002: SUBMITTED, step 9 ✅
```

The fix ensures this COMPLETED progress row is now filtered out.

## Files Changed
- ✅ `src/app/api/auth/resolve-session/route.ts` - Added filter for COMPLETED status + improved logic
- ✅ `src/app/api/register-store/route.ts` - Auto-mark progress as COMPLETED on submission
- ✅ `src/app/api/cleanup-stale-progress/route.ts` - New cleanup endpoint
- ✅ `check-progress.js` - Diagnostic script
- ✅ `run-cleanup.js` - Cleanup script
- ✅ `cleanup-stale-progress.sql` - SQL cleanup

## Future Prevention
With these changes:
1. ✅ Progress rows with `registration_status = 'COMPLETED'` are excluded from draft checks
2. ✅ New submissions automatically mark progress as COMPLETED
3. ✅ Banner only shows for actual incomplete work
4. ✅ No false "draft found" messages
