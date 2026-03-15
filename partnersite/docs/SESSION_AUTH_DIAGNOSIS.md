# Session, Auth & Device Management – Diagnosis and Flow

## Current flow (before fixes)

### 1. Login (email or phone OTP)

1. User signs in with Supabase (Google or phone OTP).
2. Supabase returns `access_token` + `refresh_token`.
3. Client calls `POST /api/auth/set-cookie` with those tokens.
4. **set-cookie** route:
   - Calls `supabase.auth.setSession(access_token, refresh_token)` → sets **Supabase cookies** (`sb-*`) in the response.
   - Validates merchant via `validateMerchantFromSession(user)` (merchant_parents by user id / phone / email).
   - Deactivates any existing **merchant_sessions** row for this **device_id** (from cookie or new).
   - Inserts a new **merchant_sessions** row: `merchant_id`, `device_id`, `refresh_token_hash = NULL`, `expires_at`, `is_active = true`.
   - Sets **custom cookies**: `partner_*` session (session_start_time, last_activity_time, session_id) and **device_id**.
5. Client receives response; on success it redirects to post-login/dashboard.

### 2. Who decides “logged in”

- **Middleware (proxy):** Looks only at **Supabase cookies** (`sb-*`) and `supabase.auth.getUser()`. Does **not** check `merchant_sessions`.
- **resolve-session:** Same: `getUser()` + `validateMerchantFromSession`. Does **not** check `merchant_sessions`.
- **API routes:** Use `getUser()` (and often validate merchant). Do **not** check `merchant_sessions`.

So today the only source of truth is **Supabase session**. `merchant_sessions` is written but never read for auth.

### 3. Logout

- **POST /api/auth/logout:** Calls `supabase.auth.signOut()` and clears all auth/session cookies (Supabase + `partner_*` + device_id).
- It does **not** deactivate the row in `merchant_sessions` for this device.
- Supabase `signOut()` invalidates the **current** refresh token (the one in the request). Other devices have their own cookies/tokens; in principle only the device that called logout should be affected. If “logout on one device logs out all”, typical causes are: (1) Supabase is effectively single-session (new login revokes previous token), or (2) all devices share the same token (e.g. same browser), or (3) logout is doing something that invalidates more than the current token.

### 4. Why “502 but refresh shows logged in”

- **502** usually means the **proxy** (e.g. nginx) returned Bad Gateway (upstream didn’t respond in time or connection failed).
- If the **app** had already sent **200 + Set-Cookie** and the proxy closed the connection or returned 502 afterward, the browser might still have stored cookies → refresh sends those cookies → app sees valid session.
- Or the client sent **two** requests (retry/double submit); one got 502, the other 200 and set cookies.
- So the session **can** be set even when the client sees 502; the UI then shows “error” until the user refreshes and the app uses those cookies.

### 5. Why “logout from one device logs out all”

- If Supabase keeps **one active session per user**, a new login (e.g. on mobile) can revoke the previous one (e.g. laptop). Then both devices are effectively using “the last” session; logging out that session logs out the only active one.
- Even with multiple tokens, we never enforced **per-device** session in app logic: we don’t check `merchant_sessions` and we don’t “logout this device only” by deactivating only that device’s row.

### 6. Tables involved

| Table               | Purpose                                                                 | Used in auth?        |
|---------------------|-------------------------------------------------------------------------|----------------------|
| **merchant_parents**| Merchant identity, status (is_active, approval_status, etc.)            | Yes (validation)     |
| **merchant_sessions** | One row per device: merchant_id, device_id, is_active, expires_at   | **No** (only written) |
| Supabase Auth       | access/refresh tokens, cookies                                         | Yes (only source)    |

- **merchant_sessions.refresh_token_hash** is always `NULL`; we never store or check a token hash. Session validity is not tied to this table.

---

## Target behavior (after fixes)

1. **Device-scoped session**
   - Auth requires: valid Supabase user **and** an **active** `merchant_sessions` row for **(merchant_id, device_id)**.
   - Middleware and/or resolve-session (and critical API routes) enforce this so a “logged out” device (row deactivated) is forced to re-login.

2. **Logout = this device only**
   - Logout: read **device_id** from cookie, **deactivate** only that row in `merchant_sessions`, then clear cookies and call `supabase.auth.signOut()`.
   - Other devices keep their rows and cookies; they stay logged in.

3. **502 + success**
   - Reduce 502 (timeouts, skip set-cookie in middleware, etc.).
   - If the client still gets 502: retry set-cookie once; if still 502, call `GET /api/auth/resolve-session`; if 200, redirect to dashboard so one successful response doesn’t leave the user on an error screen.

4. **Optional later**
   - Store `refresh_token_hash` in `merchant_sessions` and optionally validate or revoke per device.
   - “Logout all devices”: deactivate all `merchant_sessions` rows for that merchant (and optionally revoke all refresh tokens via Supabase Admin).

---

## Implemented fixes

1. **Device-scoped session**
   - `hasActiveSessionForDevice(merchantId, deviceId)` in `merchant-session-db.ts` checks for an active, non-expired row in `merchant_sessions`.
   - **resolve-session:** After validating the merchant, requires an active device session for the cookie `device_id`; otherwise returns 401 `DEVICE_SESSION_INVALID`.
   - **Middleware (proxy):** For protected routes, after Supabase `getUser()`, validates merchant and checks `hasActiveSessionForDevice`; if missing, clears cookies and redirects to login (or 401 for API).

2. **Logout = this device only**
   - **logout** route: Reads `device_id` from cookie, calls `deactivateSessionForDevice(deviceId)` to set `is_active = false` for that device’s row, then clears cookies and calls `supabase.auth.signOut()`. Other devices keep their rows and stay logged in.

3. **502 and “refresh shows logged in”**
   - **Login page:** Calls set-cookie; on 502, retries once. If still 502, calls `GET /api/auth/resolve-session`; if 200, redirects to post-login/dashboard so a successful session isn’t shown as an error.

- **Device_id reuse:** On logout we no longer clear the `device_id` cookie. So the same browser/device keeps the same `device_id` across logins; each new login only deactivates the previous row and creates a new one for that same `device_id`. That keeps "one device = one device_id" and avoids many distinct device_ids for the same physical device.

**Note:** After these changes, any existing session that does not have a valid `merchant_sessions` row for its `device_id` (e.g. no device_id cookie or row deactivated) will be treated as logged out and must sign in again.

---

## File reference

- **Session table:** `merchant_sessions` (drizzle migration `0099_merchant_sessions.sql`).
- **Session DB helpers:** `src/lib/auth/merchant-session-db.ts` (`hasActiveSessionForDevice`, `deactivateSessionForDevice`, `deactivateSessionsForDevice`, `createMerchantSession`).
- **Set-cookie:** `src/app/api/auth/set-cookie/route.ts`.
- **Logout:** `src/app/api/auth/logout/route.ts`.
- **Middleware:** `src/proxy.ts`.
- **Resolve-session:** `src/app/api/auth/resolve-session/route.ts`.
- **Cookie names:** `src/lib/auth/auth-cookie-names.ts` (prefix `partner_` / `partner_dev_`, device_id, session_start_time, last_activity_time, session_id).

---

## FAQ

**Why were there many different `device_id` values when I only have two devices?**  
Previously we cleared the `device_id` cookie on logout. So every new login had no device_id and we generated a new one. That meant each login (or each logout+login) created a new row with a new device_id. We now **keep** the device_id cookie on logout, so the same device reuses the same device_id on next login; you’ll see fewer distinct device_ids (one per physical device over time). Old rows for that device_id are deactivated, not duplicated with a new id.

**Is `refresh_token_hash` being NULL a problem?**  
No. We don’t use it for auth today. Session validity is based on `device_id` + `is_active` + `expires_at`. Storing a hash of the refresh token would be optional (e.g. to revoke that token via Supabase Admin or to implement “logout all devices” by revoking all tokens). Leaving it NULL is fine.
