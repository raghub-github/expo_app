## GatiMitra Merchant Apps – Data & Tables Overview

This document explains **all important tables used by the merchant mobile app**, why they exist, and how they are connected. It is focused on the APIs under  
`backend/src/modules/merchant-partner/merchant-partner.routes.ts` and the mobile code in `apps/merchant_app`.

---

## 1. Domain overview

- **Merchant (parent)** = brand / account that owns multiple outlets.
- **Store / Outlet** = one physical location (`merchant_stores`).
- **Settings** = per‑store preferences (delivery modes, overlay, charges, rush, etc.).
- **Operations** = online/offline, operating hours, manual closures, rush hours.
- **Pricing** = packaging + delivery per‑km charges.
- **Self‑delivery** = store’s own riders instead of GatiMitra riders.
- **Audit** = every important change is recorded for compliance and debugging.

Most merchant‑app features are implemented as:

1. **Fastify route** in `merchant-partner.routes.ts`.
2. **DB read/write** to one or more tables.
3. **Audit entry** into `merchant_audit_logs`.

---

## 2. Core merchant entities

### 2.1 `public.merchant_parents`

**Role**

- Top‑level merchant account (brand). All child stores are linked to a parent.
- Auth JWT contains `parent_merchant_id`; backend resolves it to `merchant_parents.id`.

**Key columns**

- `id` – PK, used as `parent_id` in `merchant_stores`.
- `parent_merchant_id` – external identifier from auth system.
- `parent_name`, `owner_name`, `owner_email` – included in the audit context.

**Used by**

- `/v1/merchant-partner/me` – list all stores for the logged‑in merchant.
- Every protected route that needs `parentId` to validate store ownership.

---

### 2.2 `public.merchant_stores`

**Role**

- Main **store / outlet** entity. Almost everything in the merchant app hangs off this table.

**Key groups of columns**

- **Identity & contact**
  - `store_id` (public store code), `store_name`, `store_display_name`.
  - `store_description`, `store_email`, `store_phones`.
  - Address: `full_address`, `landmark`, `city`, `state`, `postal_code`, `country`.
  - Location: `latitude`, `longitude`.
  - Media: `logo_url`, `banner_url`, `gallery_images`.
  - Classification: `cuisine_types`, `food_categories`.

- **Operational flags**
  - `status` (`store_status` enum), `approval_status`, `operational_status`.
  - `is_active`, `is_accepting_orders`, `is_available`.

- **Menu & search**
  - `search_vector` (GIN index for quick search).

- **Customer‑facing configuration**
  - `avg_preparation_time_minutes` – default prep time for store.
  - `min_order_amount` – minimum basket to accept order.
  - `delivery_radius_km` – service radius.
  - `is_pure_veg` – veg‑only store.
  - `accepts_online_payment`, `accepts_cash` – COD vs UPI/cards toggles.

- **Pricing**
  - `packaging_charge_amount`, `packaging_charge_last_updated_at`.
  - `delivery_charge_per_km`, `delivery_charge_per_km_last_updated_at`.

**Important constraints**

- `merchant_stores_min_order_valid` → `min_order_amount >= 0`.
- `merchant_stores_prep_time_positive` → `avg_preparation_time_minutes > 0`.
- `merchant_stores_packaging_charge_amount_range` and `merchant_stores_delivery_charge_per_km_range` enforce allowed ranges.

**Used by**

- **Outlet Info** screen (Profile → Outlet info).
- **Delivery Settings** screen (delivery status, basic store fields).
- **Notifications → Store preferences** (delivery radius, min order, prep time, veg / payment toggles).
- **Delivery charges** APIs:
  - `GET /stores/:storeId/delivery-charges`.
  - `PATCH /stores/:storeId/delivery-charges`.

**Relationships**

- `merchant_stores.parent_id` → `merchant_parents.id`.
- Referenced by:
  - `merchant_store_settings.store_id`.
  - `merchant_store_operating_hours.store_id`.
  - `merchant_store_availability.store_id`.
  - `merchant_store_self_delivery_riders.store_id`.
  - `merchant_store_rush_windows.store_id`.

---

## 3. Store settings & preferences

### 3.1 `public.merchant_store_settings`

**Role**

- Per‑store **settings that are not core identity**, used mainly by the mobile app.

**Key columns**

- `store_id` – FK to `merchant_stores.id`.
- `show_floating_orders` – whether to show Android floating live order bubble.
- `platform_delivery` – whether GatiMitra riders are allowed for this store.
- `self_delivery` – whether store uses its own riders.

**Used by**

- `GET /stores/:storeId/settings` and `PATCH /stores/:storeId/settings`.
- `StoreSettingsContext` in the app:
  - Controls **Overlay settings** toggle.
  - Drives **Delivery mode** card (GatiMitra vs Self delivery).

**Audit**

- Every update to these fields writes one entry into `merchant_audit_logs` with:
  - `action_field = 'store_settings'`.
  - `audit_metadata.section = 'store_settings'`.

---

### 3.2 `public.pickup_instructions`

**Role**

- Stores **pickup instructions** for riders (e.g., “Ring the bell, collect from counter”).

**Key columns**

- `store_id` – FK to `merchant_stores.id`.
- `instruction_text` – text shown to riders.
- `is_active` – whether this instruction is in effect.

**Used by**

- `OutletInfoScreen` pickup instructions section:
  - `GET /stores/:storeId` reads active instruction (joined logically).
  - `PUT /stores/:storeId/pickup-instruction` sets/clears instructions.

**Audit**

- `action_field = 'pickup_instruction'`, dedicated `section = 'pickup'`.

---

## 4. Operating hours & availability

### 4.1 `public.merchant_store_operating_hours`

**Role**

- Stores **weekly business hours** for each store.

**Key columns**

- `store_id` – FK to `merchant_stores.id`.
- `is_24_hours` – whether store is 24×7.
- `same_for_all_days` – common schedule or per‑day.
- `closed_days` – list of closed days.
- Per‑day slots (for each weekday):
  - `<day>_open`, `<day>_slot1_start`, `<day>_slot1_end`, `<day>_slot2_start`, `<day>_slot2_end`.

**Used by**

- `GET /stores/:storeId/operating-hours`.
- `PATCH /stores/:storeId/operating-hours`.
- `BusinessHoursScreen` on mobile (editing business hours).

---

### 4.2 `public.merchant_store_availability`

**Role**

- Encodes **availability state and manual closures** beyond simple flags.

**Typical columns** (from migration `0122_store_availability_manual_closure.sql`)

- `store_id` – FK.
- `manual_close_until` – timestamp until which store must remain closed.
- `block_auto_open` – whether schedule‑based auto‑open should be ignored.
- `restriction_type` – describes reason for closure (holiday, ops issue, etc.).

**Used by**

- Store‑status logic that backs:
  - Header **online/offline** switch.
  - Delivery Status card in `DeliverySettingsScreen`.
  - Auto‑open from schedule and Manual activation lock toggles.

---

### 4.3 `public.merchant_store_status_history`

**Role**

- History for `approval_status` and `operational_status` transitions.

**Used by**

- Internal reporting and debugging.
- Ensures every state change is recoverable even if current flags are overwritten.

---

### 4.4 `public.merchant_store_status_log`

**Role**

- More granular log of **status operations events** (actions taken, who, when).

**Used by**

- Written by store‑status endpoints (including those used by the app) to track:
  - When online/offline toggles were changed.
  - When schedule vs manual overrides were applied.

---

## 5. Delivery & self‑delivery

### 5.1 `public.merchant_store_self_delivery_riders`

**Role**

- Stores **self‑delivery riders** configured by the store.

**Key columns**

- `store_id` – FK to `merchant_stores.id`.
- `rider_name`, `rider_mobile`, `rider_email`, `vehicle_details`.
- `is_primary` – only one rider should be primary per store.
- `is_active` – whether rider is selectable for self‑delivery.

**Used by**

- APIs:
  - `GET /stores/:storeId/self-delivery-riders`.
  - `POST /stores/:storeId/self-delivery-riders`.
  - `PATCH /stores/:storeId/self-delivery-riders/:riderId`.
  - `DELETE /stores/:storeId/self-delivery-riders/:riderId` (soft via `is_active = FALSE`).
- UI:
  - `DeliverySettingsScreen` → Self delivery section:
    - Shows riders list with **Edit**, **Remove**, **Active toggle**, **Make primary**.
    - Forces at least one rider before self‑delivery can be enabled.

**Audit**

- Every rider create/update/delete logs to `merchant_audit_logs` with `action_field = 'self_delivery_rider'` (exact field name may vary, but semantics are per‑rider changes).

---

### 5.2 Delivery charges columns on `merchant_stores`

*(Migration `0124_store_packaging_and_delivery_charges.sql`)*  
See section **2.2** for full list.

**Why they exist**

- Allow store to self‑configure:
  - **Packaging charges** (`packaging_charge_amount`).
  - **Self‑delivery per‑km charges** (`delivery_charge_per_km`).
- Enforce:
  - Value ranges via CHECK constraints.
  - **30‑day cooldown** between edits:
    - Handled in backend logic (`GET/PATCH /stores/:storeId/delivery-charges`).

**Used by**

- Delivery Settings screen:
  - Packaging card → always visible.
  - Delivery per‑km card → only when **Self delivery** is ON.
  - Live countdown `DD:HH:MM:SS` until next edit, based on `seconds_until_edit` from backend.

---

### 5.3 `public.merchant_store_rush_windows`

**Role**

- Tracks **temporary rush periods** when the kitchen is overloaded and needs more prep time.

**Columns**

- `id BIGSERIAL` – PK.
- `store_id BIGINT` – FK to `merchant_stores.id` (ON DELETE CASCADE).
- `duration_minutes INTEGER` – allowed 1–240 (validated by CHECK).
- `started_at TIMESTAMPTZ` – when rush started.
- `ends_at TIMESTAMPTZ` – when rush ends (planned or actual).
- `is_active BOOLEAN` – whether this rush window is currently active.
- `created_at`, `created_by`.

**Indexes**

- `merchant_store_rush_windows_store_active_idx (store_id, is_active, ends_at)` – fast lookup for current window.

**Used by**

- Backend:
  - `GET /stores/:storeId/rush`:
    - Finds active window (`is_active = TRUE` and `ends_at > NOW()`).
    - Returns remaining minutes and timestamps.
  - `POST /stores/:storeId/rush`:
    - Ends old window (set `is_active = FALSE`).
    - Inserts new row for requested duration.
    - Logs in `merchant_audit_logs` as `rush_window`.
  - `PATCH /stores/:storeId/rush`:
    - Manual OFF:
      - Sets `is_active = FALSE`, `ends_at = NOW()`.
      - Logs change to `merchant_audit_logs`.

- Mobile:
  - Profile card badge `ON` / `OFF` (via `getRushStatus`).
  - `PreparationTimeScreen`:
    - Shows hero text with remaining minutes.
    - Duration radio list.
    - Confirmation modal to start rush (POST).
    - Top **Rush mode switch** to turn off early (PATCH).

---

## 6. Orders & overlay

### 6.1 `public.orders_core`

**Role**

- Central orders table (simplified here).

**Used by**

- `GET /stores/:storeId/active-orders-count`:
  - Counts orders in core statuses like `assigned`, `accepted`, `reached_store`, `picked_up`.
  - Result drives **Floating live order count** bubble number.

---

### 6.2 `public.user_device_sessions` (and related)

**Role**

- Manages merchant device sessions / tokens.

**Used by**

- `POST /merchant-partner/logout` and similar operations (not directly surfaced in UI as tables, but required for device logout functionality).

---

## 7. Audit & history

### 7.1 `public.merchant_audit_logs`

**Role**

- Central **audit log** for all merchant‑facing changes.

**Key columns**

- `entity_type` – `"STORE"` for mobile‑related changes.
- `entity_id` – `merchant_stores.id`.
- `action` – `"CREATE"`, `"UPDATE"`, etc.
- `action_field` – logical field name, e.g.:
  - `"store_name"`, `"full_address"`, `"cuisine_types"`.
  - `"store_settings"` (floating orders, delivery mode).
  - `"pickup_instruction"`.
  - `"delivery_charges"`.
  - `"rush_window"`.
- `old_value`, `new_value` – JSONB snapshots of just that field or logical unit.
- `performed_by`, `performed_by_id`, `performed_by_name`, `performed_by_email`.
- `audit_metadata` – includes `route`, `section`, and `request_id`.

**Used by**

- **Backend**: every important route logs its change via `insertAuditLog`.
- **Mobile**: `AuditScreen` fetches via:
  - `GET /stores/:storeId/audit-logs?limit=N`.
  - Shows who changed what and when.

---

## 8. Reviews & Complaints (Insights)

### 8.1 `public.merchant_store_ratings`

**Role**

- Stores **customer ratings and reviews** per order per store. Used for the **Insights** flow: Customer Reviews and Customer Complaints.

**Key columns** (from migration `0133_merchant_ratings.sql`)

- `id`, `store_id` – PK and FK to `merchant_stores.id`.
- `order_id`, `customer_id` – optional links to order and customer.
- `rating` (1–5) – overall rating; used to derive “complaints” (e.g. rating ≤ 3).
- `review_title`, `review_text` – optional title and body.
- `merchant_response`, `merchant_responded_at` – store’s reply and timestamp.
- `is_flagged`, `flag_reason` – moderation flags.
- `created_at`, `updated_at`.

**Indexes**

- `store_id`, `order_id`, `customer_id`, `rating`, `created_at`, `(store_id, created_at DESC)`, partial on `merchant_responded_at`.

**Used by – Backend** (`merchant-partner.routes.ts`)

- **Complaints**
  - `GET /stores/:storeId/ratings/complaints` – ratings with `rating <= 3`; returns `replyText` and `repliedAt` from `merchant_response` / `merchant_responded_at`.
- **Reviews**
  - `GET /stores/:storeId/ratings/reviews?from=&to=&minRating=` – all ratings with optional date and min-rating filter; returns `replyText`, `repliedAt`.
  - `POST /stores/:storeId/ratings/reviews/:reviewId/reply` – set `merchant_response` and `merchant_responded_at`.
  - `DELETE /stores/:storeId/ratings/reviews/:reviewId/reply` – clear merchant reply.

**Used by – Mobile**

- **Profile → Complaints** (`ComplaintsScreen.tsx`)
  - Same layout as Reviews: INSIGHTS header, summary card (rating + 5★–1★ distribution), search, filter button (date sheet: 7/21/30/All), rating chips (All, Low 1–2★, Medium 3★, High 4–5★), cards with reply bubble and **Reply** / **Edit reply** / delete icon.
  - Replies loaded from API; Edit opens reply sheet; Delete uses confirm modal. Uses same reply APIs as Reviews (`ratingsApi.replyToStoreReview`, `deleteStoreReviewReply`).
- **Profile → Reviews** (`ReviewsScreen.tsx`)
  - INSIGHTS header, summary card, search, filter sheet (date + min rating), rating chips (All, 5+, 4+, …), cards with **Reply** / **Edit reply** / delete, reply sheet with **Cancel** and **Send Reply** (gradient pill).
- **Skeleton loading** – First load on both screens shows `ReviewsComplaintsSkeleton` (variant `reviews` or `complaints`) instead of spinner.
- **Reply sheet** – “Reply to Review” / “Reply to Complaint” title, rating + title + date, hint, input, **Cancel** and **Send Reply** (fixed padding / `minWidth` so button text does not overlap).
- **Edit/Delete** – First-time reply opens sheet directly; Edit and Delete show central confirmation modals, then sheet (edit) or API delete.

**Relationships**

- `merchant_store_ratings.store_id` → `merchant_stores.id`.
- Same row is shown as a “review” or “complaint” depending on screen; reply is stored once and visible on both.

---

## 9. How these tables connect (quick graph)

- **Parents**
  - `merchant_parents (1)` → `merchant_stores (N)` via `parent_id`.

- **Per store**
  - `merchant_stores.id` → **settings**:
    - `merchant_store_settings.store_id`  
    - `merchant_store_operating_hours.store_id`  
    - `merchant_store_availability.store_id`  
    - `merchant_store_self_delivery_riders.store_id`  
    - `merchant_store_rush_windows.store_id`  
    - `pickup_instructions.store_id`  
    - `merchant_store_ratings.store_id`  
    - `orders_core.merchant_store_id`

- **Audit**
  - Every update to the above writes a row into `merchant_audit_logs` with:
    - `entity_type = 'STORE'`
    - `entity_id = merchant_stores.id`
    - `action_field` describing which logical piece changed.

- **Reviews & complaints**
  - `merchant_store_ratings.store_id` → `merchant_stores.id`. Complaints = same table filtered by `rating <= 3`; reply is shared (Reviews and Complaints show the same reply).

---

## 10. App utilities (image loading)

**Purpose**

- Ensure image URLs work in the app when the backend returns **relative paths** or **absolute URLs with localhost** (e.g. on Android emulator).

**Implementation**

- **`config/env.ts`**
  - `resolveUrlForDevice(url)` – On Android, rewrites `localhost` / `127.0.0.1` in any URL to `10.0.2.2` so image requests reach the host.
- **`services/outletApi.ts`**
  - `resolveImageUrl(url)` – If relative, prepends `getConfig().apiBaseUrl`; then runs the result through `resolveUrlForDevice` so absolute localhost URLs also work on Android.

**Used by**

- **Outlet (Profile)** – `OutletInfoScreen` banner and logo already use `resolveImageUrl`.
- **Catalog** – Menu list (`menu/index.tsx`) uses `resolveImageUrl(item.item_image_url)` and `onError` fallback to placeholder.
- **Add/Edit item** – `add-edit-item.tsx` uses `resolveImageUrl` for main image and thumbnails (`images[].image_url`).

---

This single file should be the **source of truth** for:

- Which tables the merchant mobile app depends on.
- Why each table/column exists.
- How tables are related and which routes/screens use them.

When adding a new feature, always:

1. Add migration(s) for new tables/columns.
2. Update this `merchant_apps.md` with:
   - Table/column name.
   - Purpose.
   - Which route(s) and screen(s) use it.

