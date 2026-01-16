# Fix Plan: OAuth Login & Dashboard Access Issues

## Issues Identified

### 1. **Database Query Error in Middleware** (CRITICAL)
**Error**: `Failed query: select "id", "system_user_id", "email"... from "system_users"`
**Root Cause**: Middleware runs in **Edge Runtime** which doesn't support Node.js APIs like `postgres-js`. The `getUserPermissions()` function calls `getDb()` which uses `postgres-js`, causing the query to fail.

**Evidence from logs**:
```
[getSystemUserByEmail] ===== ERROR ===== Error fetching system user by email: 
Error: Failed query: select "id", "system_user_id", "email"...
```

### 2. **404 Error on /dashboard**
**Error**: `GET /dashboard 404`
**Root Cause**: The page exists at `(dashboard)/page.tsx` but middleware is allowing access, then Next.js returns 404. This might be because:
- The database error is causing middleware to fail
- Or there's a routing issue

**Evidence**: Terminal shows middleware allows access but then 404:
```
[middleware] User not found in system_users, allowing dashboard home only
GET /dashboard 404
```

### 3. **Google OAuth Configuration** (VERIFIED CORRECT)
✅ **Authorized JavaScript origins**: `http://localhost:3000` - **CORRECT**
✅ **Authorized redirect URIs**: `https://uoxkwznciiibubtiiffh.supabase.co/auth/v1/callback` - **CORRECT**

## Fix Plan (Step by Step)

### Step 1: Remove Database Calls from Middleware
**Action**: 
- Middleware should ONLY check for Supabase session existence
- Remove all `getUserPermissions()` calls from middleware
- Move permission checks to page-level or create API route

**Files to modify**:
- `dashboard/src/middleware.ts` - Remove permission checks, only verify session

### Step 2: Create Permission Check API Route
**Action**:
- Create `/api/auth/permissions` route that runs in Node.js runtime
- This route can use `postgres-js` safely
- Pages can call this API to check permissions

**Files to create**:
- `dashboard/src/app/api/auth/permissions/route.ts`

### Step 3: Update Dashboard Pages to Check Permissions
**Action**:
- Each dashboard page should check permissions client-side or server-side
- Use the new API route for permission checks
- Show appropriate error if user doesn't have access

**Files to modify**:
- `dashboard/src/app/(dashboard)/page.tsx` - Add permission check
- Other dashboard pages as needed

### Step 4: Simplify Middleware Logic
**Action**:
- Middleware only checks: "Does user have a valid Supabase session?"
- If yes → allow access to `/dashboard/*` routes
- If no → redirect to `/login`
- Remove all database queries and permission logic

**Files to modify**:
- `dashboard/src/middleware.ts` - Simplify to session-only check

### Step 5: Test OAuth Flow
**Action**:
- Verify Google OAuth redirects correctly
- Test cookie setting
- Test dashboard access after login

## Implementation Order

1. ✅ **First**: Fix middleware to remove database calls (Step 1 & 4)
2. ✅ **Second**: Create permission API route (Step 2)
3. ✅ **Third**: Update dashboard page to use permission API (Step 3)
4. ✅ **Fourth**: Test full flow (Step 5)

## Expected Outcome

After fixes:
- ✅ Middleware only checks session (no database errors)
- ✅ Dashboard page loads successfully
- ✅ Permission checks happen at page level (not blocking)
- ✅ OAuth flow completes and redirects to dashboard
- ✅ User sees dashboard home page
