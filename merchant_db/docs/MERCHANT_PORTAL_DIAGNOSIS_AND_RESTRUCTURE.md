# Merchant Portal – Diagnosis, Schema Review & Restructure Plan

This document covers: (1) current state diagnosis, (2) schema and relations review with recommended updates, (3) restructure plan (RTK Query, cache, components, auth/session, blocked parent, area manager assignment).

---

## 1. Current state diagnosis

### 1.1 App structure (high level)

- **Framework:** Next.js 16 (App Router), React 19.
- **State:** React Context (`MerchantSessionContext`), `useState`/`useEffect` in pages, no global data store.
- **Data fetching:** Direct `fetch()` and Supabase client in components and `src/lib/database.ts`; no caching layer, no request deduplication.
- **Auth:** Supabase only (Google OTP, Phone OTP, Email OTP, Email+Password). Session via cookies; `MerchantSessionContext` calls `/api/auth/merchant-session` and `merchant-session-status`. No RTK Query or React Query.

### 1.2 Components

- **Layout:** `MerchantSessionProvider` at root; `MXLayoutWhite` wraps mx routes with `MXSidebarWhite` + `UserHeader`.
- **Large components:** `mx/dashboard/page.tsx` is a large single file (dashboard, modals, store toggle, stats). `auth/register` and `auth/login` are self-contained; `auth/register-store` and related flows are multi-step.
- **Issues:** No clear split between UI and data (e.g. dashboard fetches in `useEffect`); no shared hooks for “current parent” or “current store”; repeated fetch patterns; no cache so every navigation refetches.

### 1.3 Hooks and data layer

- **Existing hooks:** `useRealtimeOrders`, `useDashboardStats`, `useNotifications` – each does its own fetch/subscription.
- **Gaps:** No central API slice, no cache keys, no invalidation on mutation, no optimistic updates. Session is the only “global” state.

### 1.4 Authentication and session

- **Flow:** Login (Google / Phone OTP / Email+Password) → `/api/auth/set-cookie` → `validateMerchantFromSession()` (email → phone → supabase_user_id). Session cookies + custom 24h activity window.
- **Gaps:**  
  - No **parent-level status** in session response (e.g. `approval_status`, `registration_status`). Blocked/suspended parents still get a valid session and can open the app; we only check `is_active` in validation.  
  - No explicit “blocked” message in UI; no prevention of “register child store” when parent is blocked/suspended.

### 1.5 Tables and relations (summary)

- **merchant_parents:** Parent merchant; `approval_status` (parent_approval_status), `registration_status` (VERIFIED | SUSPENDED), `is_active`, `area_manager_id` → area_managers.
- **merchant_stores:** Child store; `parent_id` → merchant_parents, `area_manager_id` → area_managers, `approval_status` (store_approval_status: DRAFT → APPROVED by agent).
- **area_managers:** id, user_id, manager_type, area_code, locality_code, **city**; **no latitude/longitude** – so “nearest by lat/long” is not possible without schema or another table.
- **merchant_area_managers:** Separate table (manager_id, name, email, region, cities, postal_codes) – used for “nearest AM” by region/cities; not linked to `area_manager_id` on stores/parents (which points to `area_managers`).
- **merchant_store_registration_progress:** Parent/store onboarding steps; `resolve-parent` API was incorrectly querying `store_registration_progress` (wrong name).

---

## 2. Schema and relations – recommended updates

### 2.1 Parent: blocked/suspended behaviour (no schema change)

- **Current:** `merchant_parents.is_active`, `registration_status` (VERIFIED | SUSPENDED), `approval_status` (parent_approval_status, default APPROVED).
- **Recommendation:**  
  - Treat “blocked” as: `is_active = false` **or** `registration_status = 'SUSPENDED'` **or** `approval_status` in a blocked set (e.g. `BLOCKED`, `SUSPENDED` if such values exist in `parent_approval_status`).  
  - Ensure validation and session APIs return these so the portal can show “Account blocked/suspended” and disable “Add child store”.

### 2.2 Area manager – nearest by city and lat/long

- **Current:** `area_managers` has `city` but **no latitude/longitude**. “Nearest” by exact location is not possible.
- **Options:**  
  - **A.** Add `latitude`, `longitude` (and optionally `radius_km`) to `area_managers`; compute distance (e.g. Haversine) and assign store to nearest AM.  
  - **B.** Keep “nearest” by **city** only: assign store to an area_manager whose `city` matches store’s `city` (or use `merchant_area_managers.cities` and map city → area_manager).  
  - **C.** New table `area_manager_coverage` (area_manager_id, city, lat, long, radius_km) for polygons/circles and assign store by point-in-polygon or distance.
- **Recommendation:** Short term use **city-based** assignment (no schema change). If you need “nearest by lat/long”, add **2.2.1** below.

**2.2.1 Optional migration – area_managers location**

```sql
-- Optional: add location for “nearest AM” by lat/long
ALTER TABLE area_managers
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
  ADD COLUMN IF NOT EXISTS coverage_radius_km NUMERIC(5, 2);
```

Then an API “assign nearest area manager to store” can: filter AMs by `city = store.city` and optionally by distance if lat/long present.

### 2.3 Child store verification by agent

- **Current:** `merchant_stores.approval_status` (DRAFT, SUBMITTED, UNDER_VERIFICATION, APPROVED, REJECTED, BLOCKED, DELISTED, SUSPENDED). Agent moves to APPROVED after verification.
- **Current:** `merchant_stores.area_manager_id` → area_managers; can be set when store is created (e.g. by city) or when agent takes ownership.
- **Recommendation:**  
  - Before agent approves, **assign** `area_manager_id` (e.g. by store’s city or by nearest lat/long once 2.2.1 exists).  
  - Keep agent verification as transition to `approval_status = 'APPROVED'` (and document/audit in `merchant_store_status_history` if needed).

### 2.4 Other schema notes

- **merchant_store_registration_progress:** Correct name is `merchant_store_registration_progress`. Fix any code using `store_registration_progress`.
- **merchant_parents:** Has `area_manager_id`; can be set on parent onboarding (agent or self-registration “nearest” AM).
- **merchant_stores:** Has `area_manager_id`; assign when store is created or when agent is assigned (e.g. by city/location).

No other table renames or relation changes are required for the behaviours above.

---

## 3. Restructure plan

### 3.1 State management – RTK Query

- **Add:** `@reduxjs/toolkit` and `react-redux`.  
- **Create:** `store/` with:  
  - `store.ts` (configureStore with middleware).  
  - `api/merchantApi.ts` (or similar): endpoints for session, parent, stores list, store by id, registration progress, area managers, etc.  
  - Use RTK Query’s cache (tags: `Session`, `Parent`, `Store`, `StoresList`, etc.) and invalidation on login/logout/mutations.
- **Benefits:** Central cache, request deduplication, loading/error states, optimistic updates and invalidation after mutations.

### 3.2 Caching and smooth UX

- **Server:** Next.js `fetch` cache or route segment config where appropriate (e.g. reference data).  
- **Client:** RTK Query cache (above); optionally `React Query` instead of RTK Query if you prefer.  
- **Session:** Keep cookie-based session; have one “getSession” or “getMe” RTK Query endpoint that returns user + **parent summary** (id, approval_status, registration_status, is_active) so UI can block actions and show “Account blocked” without extra round-trips.

### 3.3 Component restructure

- **Break down:**  
  - `mx/dashboard/page.tsx` → container that uses RTK Query hooks + smaller components: `DashboardStats`, `StoreToggle`, `OrderList`, `StatusModal`, etc.  
  - Shared: `StoreSelector`, `ParentStatusBanner` (shows blocked/suspended when applicable).
- **Data flow:**  
  - One “current parent” and “current store” from RTK Query (or context that reads from RTK Query).  
  - All child-store actions (register, edit, menu, bank, images) check parent status and store approval where needed.

### 3.4 Auth, session and cookie management

- **Keep:** Supabase Auth + custom session cookies + 24h activity window.  
- **Improve:**  
  - **set-cookie:** After `validateMerchantFromSession`, also check `approval_status` and `registration_status`; if parent is blocked/suspended, return 403 and do **not** set session cookies.  
  - **merchant-session (and merchant-session-status):** Once user is validated, load parent row and return in response: e.g. `parent: { id, parent_merchant_id, approval_status, registration_status, is_active }`.  
  - **UI:** If `parent.approval_status` or `registration_status` or `is_active` indicates blocked/suspended, show a full-screen or prominent banner: “Your account is blocked/suspended. You cannot register new stores. Contact support.” and hide “Register new store” and any other restricted actions.

### 3.5 Blocked parent – behaviour summary

- **Login:** If agent has set parent to blocked/suspended (`is_active = false` or `registration_status = 'SUSPENDED'` or `approval_status` in blocked set), `validateMerchantFromSession` should return invalid and set-cookie returns 403.  
- **Already logged in:** Session API returns parent status; UI shows “Account blocked” and prevents new child registration and optionally other actions.  
- **Child registration:** Backend for “create store” / “start registration” must check parent’s `is_active`, `registration_status`, `approval_status` and reject if blocked.

### 3.6 Area manager assignment (child store)

- **When:** On child store creation or when agent picks the store for verification.  
- **Logic:**  
  - **City-based (no schema change):** Query `area_managers` where `city = store.city` and status = ACTIVE; pick one (e.g. first or by load). Optionally use `merchant_area_managers` if you map city to that table.  
  - **Lat/long (after 2.2.1):** Query area_managers with non-null lat/long, compute distance (Haversine), assign store to nearest AM within `coverage_radius_km`.  
- **Persistence:** Set `merchant_stores.area_manager_id` (and optionally `merchant_parents.area_manager_id` if you assign at parent level).

### 3.7 Best hooks and patterns

- **Session + parent:** `useMerchantSession()` extended to include `parent` from API, or a separate `useParent()` that uses RTK Query and is only available when session exists.  
- **Stores list:** `useGetStoresByParentQuery(parentId)` with cache tag `['Stores', parentId]`; invalidate on store create/update.  
- **Current store:** `useGetStoreQuery(storeId)` with tag `['Store', storeId]`; use for store settings, menu, bank, images.  
- **Registration progress:** `useGetRegistrationProgressQuery(parentId)` or by store; invalidate when step is completed.

---

## 4. Implementation checklist (short term)

1. **Auth + blocked parent**  
   - [ ] In `validate-merchant.ts`, add checks for `registration_status === 'SUSPENDED'` and `approval_status` (blocked/suspended values); return invalid with a clear message.  
   - [ ] In `set-cookie` route, rely on updated validation so blocked parents get 403.  
   - [ ] In `merchant-session` (or status) API, load parent row and return `parent: { id, approval_status, registration_status, is_active }`.  
   - [ ] In UI (layout or dashboard), if parent is blocked/suspended, show banner and disable “Register new store”.

2. **Resolve-parent**  
   - [ ] Change table name from `store_registration_progress` to `merchant_store_registration_progress` in resolve-parent API.

3. **Schema (optional)**  
   - [ ] If you want “nearest AM by lat/long”, add migration for `area_managers.latitude`, `longitude`, `coverage_radius_km`.  
   - [ ] Implement “assign nearest area manager” API (by city first; by distance if columns exist).

4. **RTK Query and restructure**  
   - [ ] Add RTK + RTK Query; create store and `merchantApi` with session/parent/stores endpoints.  
   - [ ] Replace direct fetch in key pages with RTK Query hooks; add cache tags and invalidation.  
   - [ ] Break dashboard (and other large pages) into smaller components and containers.

5. **Child store verification**  
   - [ ] Document agent flow: assign `area_manager_id` (by city or nearest), then set `approval_status` to APPROVED after verification.  
   - [ ] Ensure merchant portal only allows full store features (menu, bank, images) when store is APPROVED (or per your business rules).

---

## 5. Table relation summary (no change unless noted)

| Entity              | Key columns (auth/blocking/AM)                    | Relations |
|---------------------|----------------------------------------------------|-----------|
| merchant_parents    | is_active, registration_status, approval_status, area_manager_id | area_manager_id → area_managers(id) |
| merchant_stores     | parent_id, area_manager_id, approval_status       | parent_id → merchant_parents(id), area_manager_id → area_managers(id) |
| area_managers       | id, user_id, city (optional: lat/long/radius)     | user_id → system_users(id) |
| merchant_store_registration_progress | parent_id, store_id, current_step, registration_status | parent_id → merchant_parents(id), store_id → merchant_stores(id) |

All other existing relations (e.g. merchant_store_status_history, merchant_store_documents, etc.) remain as in the current schema.
