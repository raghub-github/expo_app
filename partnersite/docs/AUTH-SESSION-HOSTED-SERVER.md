# Auth / session on hosted server (one number failing)

## Tables involved in session and blocking

- **merchant_parents** – Only table that can “block” a number:
  - Lookup by `registered_phone` / `registered_phone_normalized` or `supabase_user_id`.
  - Blocking is via `is_active`, `approval_status`, `registration_status` (see `getParentBlockReason` in `validate-merchant.ts`).
  - There is **no other table** that blocks or allows login by phone; no server-level block list.

- **merchant_sessions** – Used only to **store** the current device session (one row per device after login).
  - We do **not** read it to block login.
  - `refresh_token_hash` being `NULL` is expected: we currently pass `null` from the set-cookie route.

So if the DB has one row for the number and it’s not blocked (active, not suspended), the failure is **not** due to another table blocking that number.

## Why it can work on localhost/tunnel but fail only on hosted server for one number

Typical causes:

1. **Hosted server still on old code**
   - If the “skip set-cookie in middleware” and “set-cookie timeout + error handling” changes are **not** deployed, the proxy (middleware) still runs for `POST /api/auth/set-cookie` and can cause 502 (e.g. timeout or throw).
   - **Fix:** Deploy the latest code (proxy skip for set-cookie, set-cookie env checks + try/catch + 25s timeout).

2. **Proxy/nginx in front of the app**
   - You use **system nginx**, not the repo’s `nginx.conf`. If the upstream (Node) is slow or doesn’t answer in time, nginx returns **502**.
   - For one number, the request might be slower (e.g. Supabase/DB latency, cold start), so only that request hits the proxy timeout.
   - **Fix:** Ensure system nginx has reasonable timeouts, e.g.:
     - `proxy_connect_timeout 10s;`
     - `proxy_send_timeout 30s;`
     - `proxy_read_timeout 30s;`
   - Deploying the 25s timeout in set-cookie makes the app return **503** instead of hanging, so nginx is less likely to 502.

3. **Cookies**
   - Session is stored in cookies (Supabase `sb-*` + our `partner_*`). We do **not** set an explicit `domain`; cookies are for the request host. So for `https://partner.gatimitra.com` they should be correct.
   - If the response is 502, the browser never gets `Set-Cookie`, so the “session not set” message is a consequence of the 502, not a separate cookie bug.

## What was added in code

- **Logging in set-cookie** (for server logs when you reproduce with the failing number):
  - `[set-cookie] request start`
  - `[set-cookie] setSession in Xms, error: none|...`
  - `[set-cookie] validate in Xms, valid: true|false`
  - `[set-cookie] success in Xms` or `[set-cookie] handler error: ...`
- If you **don’t** see `[set-cookie] request start` when the user hits “Verify OTP”, the 502 happens before the route (e.g. nginx or middleware).
- If you see `request start` but no `success`, the log line before the gap (setSession vs validate) and the timings tell you where it failed or slowed down.

## What you should do

1. **Push and deploy** the current branch (proxy skip for set-cookie, set-cookie hardening + timeout + logs).
2. On the **hosted server**, when reproducing with the failing number, check **application logs** for `[set-cookie]` (e.g. `docker logs dashboard` or your Node log output).
3. In **system nginx** (the one you actually use), add or adjust proxy timeouts as above so the app has time to respond (or to return 503) before nginx returns 502.
4. In Supabase, confirm for the **merchant_parents** row of that number: `is_active = true`, `approval_status` and `registration_status` not BLOCKED/SUSPENDED.

No other table blocks the number; fixing deployment, proxy timeouts, and using the new logs should narrow down the remaining issue.
