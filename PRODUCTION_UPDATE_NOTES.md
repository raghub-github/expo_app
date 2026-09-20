# Production update notes (18 Sep 2026)

Local-dev session from this machine. Use this as the production checklist. **Do not copy LAN IPs or local `.env` values into production.**

Current local Wi‑Fi IP used only for phone/LAN testing: `10.15.120.181`  
Ports stayed as before: backend `:3000`, dashboard `:3001`, Metro `:8081`, ws-gateway `:4100`.

---

## 1. Deploy this code to production

### A. Dashboard — admin can always replace rider photos after verify

**Bug:** After rider onboarding is complete / verified, admin “Upload new” on Selfie / Profile Photo looked like it did nothing. Replace overwrote the same R2 key (`riders/{id}/documents/selfie/latest.jpg`) while the attachment proxy cached the old bytes for 1 hour, and APP_VERIFIED / empty MIME / `profile_photo` alias could reject the request.

**Fix (deploy `dashboard/`):**

| File | What changed |
|---|---|
| `dashboard/src/app/dashboard/riders/[id]/onboarding/RiderOnboardingClient.tsx` | “Upload new” opens the file picker and uploads immediately. Cache-busts the preview. Treats `selfie` and `profile_photo` as the same photo. Works after rider is ACTIVE / verified. |
| `dashboard/src/components/riders/DocumentEditModal.tsx` | Accepts empty MIME if the filename is jpg/png/webp/pdf. Selfie auto-saves after a file is chosen. |
| `dashboard/src/lib/rider-document-admin.ts` | Allows `profile_photo`. Finds existing selfie **or** profile_photo row. Writes a cache-busted file URL. Passes real content-type to R2. |
| `dashboard/src/lib/rider-selfie-auto-verify.ts` | Auto-verify after admin upload works for both `selfie` and `profile_photo`. |
| `dashboard/src/app/api/riders/[id]/documents/[docId]/route.ts` | Admin PUT is no longer blocked after verify / APP_VERIFIED. Empty MIME allowed. |
| `dashboard/src/app/api/riders/[id]/documents/route.ts` | Same MIME + `profile_photo` create/update path. |
| `dashboard/src/app/api/attachments/proxy/route.ts` | `Cache-Control: private, no-cache, must-revalidate` + `dynamic = force-dynamic` so replaced images show immediately. |

**Production action:** Redeploy the **dashboard** (`control.gatimitra.com`). No new dashboard env vars.

**How to test:** Open a verified rider → onboarding → Selfie / Profile Photo → **Upload new** → pick a JPEG/PNG. The circle photo should change immediately. Rider app should also pick up `riders.selfie_url` / `latest.jpg`.

---

### B. Redis package — “Stream isn't writeable”

`packages/redis` now calls `ensureRedisConnected()` before commands (`lazyConnect` + `enableOfflineQueue: false` was throwing).

**Files:** `packages/redis/src/{client,cache,lock,pubsub,index}.ts` (+ built `dist/`).

**Production action:** Rebuild/redeploy anything that imports `@gatimitra/redis` (backend, ws-gateway, workers). No new Redis env vars. Keep existing `REDIS_URL`.

---

### C. Rider app — duty toggle, offers, boot timeouts

| File | What changed |
|---|---|
| `apps/gatimitra-riderApp/src/hooks/useRiderDutyServiceFilter.ts` | ON-DUTY no longer fails with “Select a service” when eligibility cache is cold — falls back to stored/eligible types. |
| `apps/gatimitra-riderApp/src/lib/riderActionRuntime.ts` | Do not flush pending accept/reject before an access token exists (stops `BUSINESS_FAILURE kind: auth`). |
| `apps/gatimitra-riderApp/src/providers/AppProviders.tsx` | Flush pending actions only after session hydrate + token. |
| `apps/gatimitra-riderApp/src/hooks/useCategoryServiceAssignments.ts` | Wait for session hydrate so the public assignments call does not 8s-timeout at boot. |
| `apps/gatimitra-riderApp/src/config/env.ts` | Heal stale LAN API/WS host in **dev**. Ignore dead Supabase host `mjfnzmepmeqemcoakjkw` and use `https://uoxkwznciiibubtiiffh.supabase.co`. |
| `apps/gatimitra-riderApp/app.config.js` | `platforms: ["ios","android"]` so `expo start` does not web-SSR the rider app. |
| `apps/gatimitra-riderApp/metro.config.js` | Recover from corrupt Metro deserialize cache; `cacheVersion` bump. |
| `apps/gatimitra-riderApp/scripts/expo-start.js` | `BROWSER=none`; `npm start -c` actually clears cache. |

Same LAN-heal pattern in:

- `apps/customer_app/config/env.ts`
- `apps/merchant_app/config/env.ts`
- `apps/customer_app/app/(auth)/login.tsx` (placeholder IP only)

**Production action:** Ship a new rider (and customer/merchant if you want the dead-Supabase + LAN-heal code). Production binaries must keep `EXPO_PUBLIC_API_BASE_URL=https://api.gatimitra.com` (or your real public API). Do **not** bake `10.15.120.181` into a store/EAS build.

---

## 2. Env files changed locally — do **not** copy these values to production

These are gitignored (or example-only). Local values were pointed at this PC so Expo Go / dashboard on Wi‑Fi could reach backend `:3000` and ws-gateway `:4100`.

| File | Keys touched locally | Production should stay |
|---|---|---|
| `apps/gatimitra-riderApp/.env.local` | `EXPO_PUBLIC_API_BASE_URL=http://10.15.120.181:3000`, `EXPO_PUBLIC_DEV_HOST=10.15.120.181` | `EXPO_PUBLIC_API_BASE_URL=https://api.gatimitra.com` (or current prod API). No `EXPO_PUBLIC_DEV_HOST`. |
| `apps/customer_app` `.env` / `.env.local` | same API host | public API URL |
| `apps/merchant_app/.env` | same API host | public API URL |
| backend `.env` / `.env.local` | `API_BASE_URL`, `TRACK_BASE_URL` → `http://10.15.120.181:3000` | `https://api.gatimitra.com` and `https://track.gatimitra.com/trip` (or current prod) |
| dashboard `.env` / `.env.local` | `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_WS_BASE_URL=ws://10.15.120.181:4100` | public API + `wss://…` gateway |
| `services/notification-worker/.env` | `BACKEND_URL` | docker/internal `http://backend:3000` or public API |
| repo root `.env.local` | `BACKEND_URL` | prod URL |
| rider-web `.env` | `BACKEND_API_URL`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` | prod URLs |
| `services/ws-gateway/.env` | added `BACKEND_INTERNAL_URL=http://127.0.0.1:3000` (PORT still **4100**) | In Docker/K8s: `http://backend:3000` (or your internal service DNS). **Do not** set this to the LAN IP. |

Ports were **not** changed. Do not add `:4100` onto REST `API_BASE_URL`. WS stays on the gateway service.

### Rider Supabase (only if production rider app still points at a dead project)

Local rider app now uses the live project (same as merchant):

- `EXPO_PUBLIC_SUPABASE_URL=https://uoxkwznciiibubtiiffh.supabase.co`
- matching anon key already in rider `.env.local`

If production EAS still has `mjfnzmepmeqemcoakjkw.supabase.co`, OTP/network will fail. Point production rider env at `uoxkwznciiibubtiiffh` **or** rely on the new dead-host fallback in `env.ts` after you ship the rider app.

### ws-gateway production

If production gateway cannot reach the Fastify API for zone join/leave:

```
BACKEND_INTERNAL_URL=http://backend:3000
```

(Use whatever hostname the gateway pod/container uses for the API. Locally it is `http://127.0.0.1:3000`.)

`PORT=4100` and `JWT_SECRET` (must match backend `SUPABASE_JWT_SECRET`) stay as they are.

---

## 3. Git-tracked `env.example` files (LAN IP only — ignore for prod)

These examples were updated from an older LAN IP (`10.74.247.181`) to `10.15.120.181`. **Production compose should keep docker/internal hosts, not this IP.**

- `backend/env.example` → `TRACK_BASE_URL`
- `partnersite/.env.example` → `GATIMITRA_BACKEND_API_URL`
- `partnersite/next.config.js` → `allowedDevOrigins` (dev-only)
- `services/eta-worker/.env.example` → `BACKEND_INTERNAL_URL`
- `services/notification-worker/.env.example` → `BACKEND_URL`
- `services/payment-worker/.env.example` → `BACKEND_INTERNAL_URL`

Production examples of those keys:

```
API_BASE_URL=https://api.gatimitra.com
TRACK_BASE_URL=https://track.gatimitra.com/trip
BACKEND_URL=http://backend:3000
BACKEND_INTERNAL_URL=http://backend:3000
GATIMITRA_BACKEND_API_URL=https://api.gatimitra.com
```

---

## 4. Suggested production deploy order

1. **Dashboard** — required for the admin selfie “Upload new” fix on `control.gatimitra.com`.
2. **`@gatimitra/redis` + backend / ws-gateway / workers** — Redis stream errors.
3. **Rider app** — duty toggle, stuck offer accept, boot assignments timeout, dead Supabase host.
4. **Confirm production env is still public URLs**, not `10.15.120.181`.
5. Optional: set `BACKEND_INTERNAL_URL` on ws-gateway if zone presence is missing in prod.

---

## 5. Not a production env change

- Killing Metro on `:8081` / starting Expo by hand — local only.
- `platforms: ["ios","android"]` and `BROWSER=none` — local Metro DX; harmless in EAS.
- Mapbox / background-location warnings in Expo Go — expected, not a prod blocker.
