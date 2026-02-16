# Rider Blocking Status Bug Fix

**Date:** February 8, 2026  
**Status:** FIXED  
**Severity:** Major - Security & Business Logic Issue

## Problem Summary

A critical bug was discovered in the rider dashboard's service blocking/unblocking system that allowed unverified riders to become ACTIVE without completing the onboarding process.

### Symptoms Reported by User

1. **Issue 1: Status incorrectly set to INACTIVE when blocking**
   - When blocking a rider for all services (permanent blacklist), the rider's status was changed to `INACTIVE` instead of `BLOCKED`
   - This made it unclear whether the rider was blocked or just not onboarded

2. **Issue 2: Status set to ACTIVE when unblocking without verification check**
   - When unblocking a rider (either manually or automatically by the system), the status was immediately set to `ACTIVE`
   - This happened even if the rider's onboarding was not complete (`onboardingStage != 'ACTIVE'`)
   - **Critical:** This allowed unverified riders to bypass the entire onboarding verification process

3. **Issue 3: Onboarding verification button appearing for already-verified riders**
   - After blocking and unblocking a verified rider, the onboarding verification button would reappear
   - This suggested the rider needed re-verification even though they were already verified

## Root Cause Analysis

### Code Location
File: `dashboard/src/app/api/riders/[id]/blacklist/route.ts`  
Lines: 218-223 (before fix)

### Original Problematic Code

```typescript
// Update riders.status: INACTIVE when permanently blacklisted for all services; ACTIVE when whitelisted (any or all)
if (action === "blacklist" && isPermanent && serviceType === "all") {
  await db.update(riders).set({ status: "INACTIVE" }).where(eq(riders.id, riderId));
} else if (action === "whitelist") {
  await db.update(riders).set({ status: "ACTIVE" }).where(eq(riders.id, riderId));
}
```

### Problems with Original Code

1. **Wrong status on blocking:** Used `INACTIVE` instead of `BLOCKED` for permanent blacklists
2. **No onboarding check on unblock:** Set status to `ACTIVE` without verifying if `onboardingStage === 'ACTIVE'`
3. **Security vulnerability:** Allowed unauthorized account activation

## The Fix

### Backend Changes

#### 1. Updated Blacklist API Route
**File:** `dashboard/src/app/api/riders/[id]/blacklist/route.ts`

```typescript
// Update riders.status: BLOCKED when permanently blacklisted for all services
// When unblocking: only set ACTIVE if onboarding is complete (onboardingStage = ACTIVE), otherwise keep current status or set INACTIVE
if (action === "blacklist" && isPermanent && serviceType === "all") {
  // Permanent blacklist for all services → status = BLOCKED
  await db.update(riders).set({ status: "BLOCKED" }).where(eq(riders.id, riderId));
} else if (action === "whitelist") {
  // Unblocking: Only activate if rider has completed onboarding
  // If onboardingStage is ACTIVE, set status to ACTIVE
  // Otherwise, keep INACTIVE (rider must complete onboarding first)
  const newStatus = rider.onboardingStage === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  await db.update(riders).set({ status: newStatus }).where(eq(riders.id, riderId));
}
```

**Key improvements:**
- Blocking all services now sets status to `BLOCKED` (proper enum value)
- Unblocking checks `onboardingStage` before setting status to `ACTIVE`
- Prevents unverified riders from becoming active through the unblock action

### Frontend Changes

#### 2. Updated Onboarding Verification Page
**File:** `dashboard/src/app/dashboard/riders/[id]/onboarding/page.tsx`

**Added warning banners:**
- Green banner when rider is already verified (prevents re-verification confusion)
- Red banner when rider is blocked (explains that unblocking is required first)

**Disabled verification actions for blocked riders:**
- Edit, Approve, and Reject buttons are disabled when `status === 'BLOCKED' || status === 'BANNED'`
- Tooltips explain why actions are disabled
- View button remains enabled (read-only access)

```typescript
const isAlreadyVerified = riderData.rider.onboardingStage === "ACTIVE" && riderData.rider.kycStatus === "APPROVED";
const isBlocked = riderData.rider.status === "BLOCKED" || riderData.rider.status === "BANNED";

// Disable verification actions when blocked
<button
  onClick={onApprove}
  disabled={isLoading || isDisabled}
  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  title={isDisabled ? "Cannot approve - rider is blocked" : "Approve this document"}
>
```

### Database Migration

#### 3. SQL Migration Script
**File:** `dashboard/drizzle/0091_fix_rider_blocking_status.sql`

**What it does:**
1. Fixes riders with `status = 'INACTIVE'` who should be `'BLOCKED'` (permanent all-service blocks)
2. Fixes riders with `status = 'ACTIVE'` who haven't completed onboarding (sets to `'INACTIVE'`)
3. Adds documentation comments explaining the status logic
4. Provides verification queries to validate the fix

**Run this migration to fix existing data:**
```bash
# From the dashboard directory
psql $DATABASE_URL -f drizzle/0091_fix_rider_blocking_status.sql
```

## Status Enum Values

The `rider_status` enum in the database schema:

```typescript
export const riderStatusEnum = pgEnum("rider_status", [
  "INACTIVE",  // Not yet onboarded or deactivated
  "ACTIVE",    // Fully onboarded and operational
  "BLOCKED",   // Blocked from services (can be unblocked)
  "BANNED",    // Permanently banned (cannot be unblocked)
]);
```

## Correct Status Flow

### New Rider (Onboarding)
1. Registration: `status = 'INACTIVE'`, `onboardingStage = 'MOBILE_VERIFIED'`
2. Documents uploaded: `status = 'INACTIVE'`, `onboardingStage = 'KYC'`
3. All docs verified + payment complete: `status = 'ACTIVE'`, `onboardingStage = 'ACTIVE'`

### Blocking Flow
1. Block some services (temporary): `status` unchanged
2. Block all services (permanent): `status = 'BLOCKED'`
3. **Critical:** Status should never be `INACTIVE` when blocked; always `BLOCKED` or `BANNED`

### Unblocking Flow
1. Unblock rider who completed onboarding:
   - Before: `status = 'BLOCKED'`, `onboardingStage = 'ACTIVE'`
   - After: `status = 'ACTIVE'`, `onboardingStage = 'ACTIVE'` ✅

2. Unblock rider who didn't complete onboarding:
   - Before: `status = 'BLOCKED'`, `onboardingStage = 'KYC'` (or any stage != ACTIVE)
   - After: `status = 'INACTIVE'`, `onboardingStage = 'KYC'` ✅
   - **Must complete onboarding** to become `ACTIVE`

## Testing Checklist

- [ ] Block a verified rider for all services → status should be `BLOCKED`
- [ ] Unblock a verified rider → status should be `ACTIVE`
- [ ] Block an unverified rider for all services → status should be `BLOCKED`
- [ ] Unblock an unverified rider → status should be `INACTIVE` (NOT `ACTIVE`)
- [ ] Try to verify documents for a blocked rider → buttons should be disabled
- [ ] View onboarding page for already-verified rider → should show green warning banner
- [ ] View onboarding page for blocked rider → should show red warning banner
- [ ] Complete onboarding for previously-blocked rider → should become `ACTIVE`

## Files Changed

### Backend
1. `dashboard/src/app/api/riders/[id]/blacklist/route.ts` - Fixed status update logic

### Frontend
2. `dashboard/src/app/dashboard/riders/[id]/onboarding/page.tsx` - Added warnings and disabled actions for blocked riders

### Database
3. `dashboard/drizzle/0091_fix_rider_blocking_status.sql` - Migration to fix existing data

## Impact Assessment

### Security
- **High:** Fixed vulnerability that allowed unverified users to become active
- **Medium:** Properly enforces onboarding completion requirements

### Business Logic
- **High:** Blocking now uses correct status enum (`BLOCKED` instead of `INACTIVE`)
- **High:** Unblocking respects onboarding completion status
- **Medium:** Clearer distinction between blocked, inactive, and active riders

### User Experience
- **Positive:** Warning banners prevent confusion about verification status
- **Positive:** Disabled buttons with tooltips explain why actions are unavailable
- **Positive:** Agents can clearly see if a rider is blocked vs. not onboarded

## Deployment Notes

1. **Deploy backend changes first** (blacklist route fix)
2. **Run SQL migration** to fix existing data
3. **Deploy frontend changes** (onboarding page updates)
4. **Verify** with test cases above
5. **Monitor** rider status transitions in production logs

## Future Improvements

1. Add automated tests for blocking/unblocking flows
2. Add status transition validation at the database level (PostgreSQL constraints)
3. Create audit trail for status changes (already exists for blacklist, expand to status)
4. Consider adding a `statusReason` field to explain why a rider is INACTIVE/BLOCKED
