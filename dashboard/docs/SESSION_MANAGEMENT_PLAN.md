# Session Management System - Implementation Plan

## Requirements

1. **Session Duration**: 24 hours after login
2. **Activity-Based Renewal**: If user accesses page within 24 hours, session renews for another 24 hours
3. **Inactivity Expiration**: If user inactive for 24 hours, session expires
4. **Maximum Session**: 7 days total - after 7 days, user must login again
5. **Immediate Expiration**: If user signs out, session expires immediately

## Architecture

### Session Data Storage
We'll store session metadata in cookies (since middleware runs in Edge Runtime):
- `session_start_time`: Timestamp when session was created
- `last_activity_time`: Timestamp of last user activity
- `session_id`: Unique session identifier

### Flow

```
Login → Set session_start_time = now, last_activity_time = now
  ↓
User accesses page → Middleware checks:
  ↓
  ├─ Is session expired? (inactive > 24h OR total > 7 days)
  │   └─ YES → Redirect to login
  │   └─ NO → Continue
  ↓
  ├─ Is last_activity > 24h ago?
  │   └─ YES → Expire session
  │   └─ NO → Update last_activity_time = now
  ↓
  ├─ Is total session time > 7 days?
  │   └─ YES → Expire session
  │   └─ NO → Allow access
```

## Implementation Steps

### 1. Create Session Management Utilities
- `src/lib/auth/session-manager.ts`
  - `initializeSession()` - Set session cookies on login
  - `checkSessionValidity()` - Check if session is valid
  - `updateActivity()` - Update last activity time
  - `expireSession()` - Clear session cookies
  - `getSessionMetadata()` - Get session metadata from cookies

### 2. Update Middleware
- `src/middleware.ts`
  - Check session validity on every request
  - Update last activity time if valid
  - Expire session if invalid
  - Redirect to login if expired

### 3. Update Login Flow
- `src/app/(auth)/auth/callback/page.tsx`
  - Initialize session on successful login
  - Set session_start_time and last_activity_time

### 4. Update Logout Flow
- `src/app/api/auth/logout/route.ts`
  - Expire session immediately
  - Clear all session cookies

### 5. Create Session Status API
- `src/app/api/auth/session-status/route.ts`
  - Return session status, time remaining, etc.
  - For client-side session monitoring

## Constants

```typescript
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms
const MAX_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in ms
```

## Cookie Names

- `session_start_time` - Session creation timestamp
- `last_activity_time` - Last activity timestamp
- `session_id` - Unique session identifier

## Edge Cases

1. **Clock Skew**: Use server time, not client time
2. **Cookie Size**: Keep metadata minimal
3. **Multiple Tabs**: Same session across tabs
4. **Network Issues**: Graceful handling of cookie read/write failures

## Testing Scenarios

1. ✅ Login → Session created with 24h duration
2. ✅ Access page within 24h → Session renewed
3. ✅ Inactive for 25h → Session expired
4. ✅ Active for 6 days → Still valid
5. ✅ Active for 8 days → Session expired (7 day limit)
6. ✅ Sign out → Session expired immediately
