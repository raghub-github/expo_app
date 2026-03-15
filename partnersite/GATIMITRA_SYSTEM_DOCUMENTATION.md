# GatiMitra Merchant Portal — System Documentation

**Version:** 1.0  
**Last Updated:** February 2026  
**Classification:** Internal Technical Documentation

---

## 1. System Overview

### 1.1 Purpose

GatiMitra Merchant Portal is a **food ordering and delivery merchant dashboard** that allows store owners and staff to:

- Manage **store status** (Open/Closed) with manual and schedule-based control
- View and manage **food orders** (accept, prepare, mark ready, RTO, cancel)
- Switch between **Dashboard ordering** (orders received in GatiMitra) and **POS integration** (orders managed via external POS)
- Configure **delivery mode** (GatiMitra Delivery vs Self delivery)
- View **analytics** (KPIs, order flow, revenue, trends) sourced from `orders_food`
- Access **audit logs** and **recent activities** for store open/close accountability

### 1.2 Key Concepts

| Concept | Description |
|--------|-------------|
| **Dashboard ordering** | Default mode: orders are received and managed in the GatiMitra portal (Food Orders page and dashboard). |
| **POS integration** | Optional: merchant connects a POS partner (e.g. PetPooja, UrbanPiper). When active, orders are managed via POS; dashboard can show “Integrate POS first” if switch is attempted without integration. |
| **Store status** | Open / Closed, with optional **restrictions**: Temporary closed, Closed for today, or **Until I manually turn it ON** (manual hold). Schedule-based auto-open is **blocked** when manual hold is active. |
| **Audit / accountability** | Every store open/close is recorded in `merchant_store_status_log` with who performed the action, when, and restriction type. |
| **Delivery mode** | Stored in `merchant_store_settings` (`self_delivery`, `platform_delivery`). Dashboard and Store Settings read/update via `/api/merchant/store-settings`. |

### 1.3 Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, Headless UI (Dialog), Recharts
- **Backend:** Next.js API routes, Supabase (PostgreSQL + Realtime)
- **Auth:** Supabase Auth (session); merchant context for store selection
- **Database:** PostgreSQL (Drizzle migrations in `drizzle/`)

---

## 2. Architecture Summary

### 2.1 High-Level Flow

```
Merchant → mx/dashboard, mx/food-orders, mx/store-settings, mx/audit-logs
    ↓
Next.js API routes (store-operations, food-orders, dashboard-analytics, merchant/*)
    ↓
Supabase (PostgreSQL + optional Realtime)
    ↓
Tables: merchant_stores, merchant_store_availability, merchant_store_operating_hours,
        merchant_store_status_log, merchant_store_settings, merchant_store_pos_integration,
        orders_food, etc.
```

### 2.2 Route Structure (Merchant MX)

| Route | Purpose |
|-------|--------|
| `/mx/dashboard` | Main dashboard: Store Status, Ordering mode, Delivery mode, Order flow, KPIs, charts, Recent activities, Audit snapshot, Performance insights |
| `/mx/food-orders` | Food order list and actions (Accept, Reject, Ready, RTO, Details); uses same store-operations and stats as dashboard |
| `/mx/store-settings` | Store configuration; POS tab (partner selection), delivery toggle (persisted to `merchant_store_settings`) |
| `/mx/audit-logs` | Full store status audit (from `merchant_store_status_log`) |
| `/mx/menu`, `/mx/offers`, `/mx/payments`, `/mx/user-insights`, etc. | Other merchant features |

### 2.3 API Overview

| API | Method | Purpose |
|-----|--------|--------|
| `/api/store-operations` | GET | Current store status, today’s slots, last action, restriction type, `opens_at`, `within_hours_but_restricted`; applies auto-open/auto-close when no manual restriction. |
| `/api/store-operations` | POST | Manual open or close; close supports `closure_type`: temporary, today, manual_hold. Writes to `merchant_store_status_log`. |
| `/api/food-orders/stats` | GET | KPIs from `orders_food` for a store (optional `date` for date filter). Returns pendingCount, acceptedTodayCount, preparingCount, outForDeliveryCount, deliveredTodayCount, cancelledTodayCount, revenue, avgPrepTime, acceptanceRate. |
| `/api/food-orders` | GET | List of food orders for store (paginated). |
| `/api/food-orders/[id]` | GET/PATCH | Single order; PATCH for status updates (accept, prepare, ready, RTO, cancel, etc.). |
| `/api/dashboard-analytics` | GET | Charts data from `orders_food` (orders trend, revenue by day, category, heatmap, weekly, delivery success). |
| `/api/merchant/store-settings` | GET/PATCH | Read/update delivery mode (`self_delivery`, `platform_delivery`) in `merchant_store_settings`. |
| `/api/merchant/pos-integration` | GET/POST/PATCH | POS integration status and config; dashboard uses this to show “Integrate POS first” when switching to POS without active integration. |
| `/api/merchant/store-status-log` | GET | Recent store open/close log for dashboard Recent activities and audit. |
| `/api/merchant/audit-logs` | GET | Full audit list from `merchant_store_status_log` for audit-logs page. |

---

## 3. Database Tables Explained

### 3.1 Core Merchant Store Tables

#### TABLE: `merchant_stores`

| Purpose | Store master: identity, address, approval, and **operational status**. |
|---------|-----------------------------------------------------------------------|
| Why it exists | Single source of truth for store identity (`store_id` e.g. GMMC1002) and whether the store is OPEN/CLOSED for orders. |
| Used by | Dashboard, Food Orders, Store Settings, all APIs that resolve `store_id` → internal `id`. |
| Key columns | `id` (internal), `store_id` (unique, e.g. GMMC1002), `operational_status` (OPEN/CLOSED), `is_accepting_orders`, `timezone`, `approval_status`, `store_name`. |
| Relationships | Referenced by `merchant_store_availability`, `merchant_store_operating_hours`, `merchant_store_settings`, `merchant_store_status_log`, `merchant_store_pos_integration`, `orders_food`. |
| APIs | Store-operations GET/POST update `operational_status` and `is_accepting_orders`. |

---

#### TABLE: `merchant_store_availability`

| Purpose | Per-store availability and **manual/schedule restrictions** for store open/close. |
|---------|-----------------------------------------------------------------------------------|
| Why it exists | Holds manual close expiry, “block auto-open” (manual hold), last toggler identity, and restriction type. |
| Used by | Store Status card, store-operations GET/POST, realtime status updates. |
| Key columns | `store_id` (unique), `is_available`, `is_accepting_orders`, `manual_close_until`, `auto_open_from_schedule`, `block_auto_open`, `restriction_type` (TEMPORARY \| CLOSED_TODAY \| MANUAL_HOLD), `last_toggled_by_email`, `last_toggled_by_name`, `last_toggled_by_id`, `last_toggle_type` (MERCHANT \| AUTO_OPEN \| AUTO_CLOSE), `last_toggled_at`. |
| Relationships | One row per store; `store_id` → `merchant_stores.id`. |
| Business logic | If `block_auto_open` is true, GET **never** auto-opens. If `manual_close_until` is set and now &lt; until, store stays closed until then (and then may auto-open if within hours and not block_auto_open). |

**Triggered when:** Merchant clicks Store ON/OFF (POST store-operations); GET runs on load and on realtime subscription (auto-open/auto-close when no restriction).

---

#### TABLE: `merchant_store_operating_hours`

| Purpose | Weekly schedule: per-day open flag and up to two slots (start/end) per day. |
|---------|-----------------------------------------------------------------------------|
| Why it exists | To compute “within operating hours”, today’s slots for display, and next open time when store is closed. |
| Used by | Store-operations GET (today_slots, withinHours, getNextOpenAt), dashboard Store Status card. |
| Key columns | `store_id` (unique), `monday_open`, `monday_slot1_start`, `monday_slot1_end`, `monday_slot2_start`, `monday_slot2_end`, … same for each day; `is_24_hours`. |
| Relationships | One row per store; `store_id` → `merchant_stores.id`. |

---

#### TABLE: `merchant_store_status_log`

| Purpose | **Audit trail** of every store open/close action. |
|---------|---------------------------------------------------|
| Why it exists | Accountability: who opened/closed, when, and with which restriction (if any). |
| Used by | Dashboard Recent activities, Audit log snapshot, Full audit logs page (`/mx/audit-logs`). |
| Key columns | `store_id`, `action` (OPEN \| CLOSED), `restriction_type`, `performed_by_id`, `performed_by_email`, `performed_by_name`, `created_at`. |
| Triggered when | POST `/api/store-operations` with action `manual_open` or `manual_close` inserts one row. |

---

#### TABLE: `merchant_store_settings`

| Purpose | Per-store settings: notifications, **delivery mode**, prep time limits, etc. |
|---------|-----------------------------------------------------------------------------|
| Why it exists | Delivery mode (self_delivery / platform_delivery) and other config must persist. |
| Used by | Dashboard Delivery mode card, Store Settings; GET/PATCH `/api/merchant/store-settings`. |
| Key columns | `store_id` (unique), `self_delivery`, `platform_delivery`, `order_notification_enabled`, `auto_accept_orders`, `max_concurrent_orders`, etc. |

---

#### TABLE: `merchant_store_pos_integration`

| Purpose | POS partner and status per store (one row per store). |
|---------|--------------------------------------------------------|
| Why it exists | To know if merchant can “Switch to POS” without showing “Integrate POS first”. |
| Used by | Dashboard Ordering mode card; Store Settings POS tab; GET/PATCH `/api/merchant/pos-integration`. |
| Key columns | `store_id` (unique), `pos_partner`, `pos_store_id`, `status` (PENDING \| ACTIVE \| DISABLED), `activated_at`. |

---

### 3.2 Food Orders

#### TABLE: `orders_food`

| Purpose | Food order line items and **order lifecycle** (status, timestamps). |
|---------|--------------------------------------------------------------------|
| Why it exists | All dashboard KPIs, Order flow, and charts are derived from this table (and linked `orders_core` where needed). |
| Used by | Dashboard (stats, analytics, order flow), Food Orders page (list, accept, prepare, ready, RTO, cancel). |
| Key columns | `id`, `order_id`, `merchant_store_id`, `order_status` (CREATED, ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, RTO, CANCELLED), `accepted_at`, `prepared_at`, `dispatched_at`, `delivered_at`, `cancelled_at`, `food_items_total_value`, `veg_non_veg`, `created_at`, etc. |
| APIs | `/api/food-orders`, `/api/food-orders/stats`, `/api/food-orders/[id]`, `/api/dashboard-analytics` read/update this table. |
| Realtime | Dashboard and Food Orders can subscribe to `orders_food` changes for live updates. |

---

## 4. Dashboard Logic

### 4.1 Data Sources per Section

| Section | Data source | API / table |
|---------|-------------|-------------|
| Ordering mode | Client state + POS integration | `orderMode` (useState); GET `/api/merchant/pos-integration` |
| Store Status | Store operations + availability | GET `/api/store-operations` → `merchant_stores`, `merchant_store_availability`, `merchant_store_operating_hours` |
| Delivery mode | Store settings | GET/PATCH `/api/merchant/store-settings` → `merchant_store_settings` |
| Date filter | Query param | `statsDate` (YYYY-MM-DD); passed to `/api/food-orders/stats?date=` |
| Order flow | Stats for selected date | Same as KPIs: `/api/food-orders/stats` → `orders_food` |
| KPI cards (8) | Stats for selected date | `/api/food-orders/stats` → `orders_food` (pending, accepted, preparing, outForDelivery, deliveredToday, cancelled, revenue, avgPrep, acceptanceRate) |
| Charts | Analytics | GET `/api/dashboard-analytics` → `orders_food` (last 7 days / 4 weeks) |
| Recent activities | Status log | GET `/api/merchant/store-status-log` → `merchant_store_status_log` |
| Audit log snapshot | Status log | Same as above; “View full audit logs” → `/mx/audit-logs` |
| Performance insights | Same KPIs | Table built from same state as KPI cards (pendingOrders, deliveredToday, etc.) |

### 4.2 Realtime Updates

- **Store status:** Dashboard subscribes to `merchant_stores` and `merchant_store_availability` (filter by store internal `id`). On UPDATE, it refetches GET `/api/store-operations` so status and “Opens in” update without refresh.
- **Countdown “Opens in Xh Ym Xs”:** A timer ticks every 60s when store is closed and `opensAt` is set, so the countdown stays accurate.

### 4.3 Time Display Rules

- All **times** (operating hours, slots, “Reopen tomorrow at”) show **hours, minutes, seconds** (e.g. `10:13:00`). Format helper: if value is `HH:MM`, append `:00` for seconds.
- **Last action** time: formatted with seconds (e.g. 12:17:45 pm).
- **Opens in:** Shows “Xh Ym Xs”. If time until open ≤ 0 or exactly 0h 0m 0s, show **“Opens now”** instead of “0h 0m 0s”.

---

## 5. Store Status System

### 5.1 Rule Priority

1. **Manual restriction** (temporary close, closed for today, or **Until I manually turn it ON**)  
   - Store stays **closed** until the condition is cleared (time expiry or manual open).  
   - **Manual hold:** `block_auto_open = true` → schedule **never** auto-opens; only manual “Store ON” opens.

2. **Schedule timing**  
   - When there is **no** manual restriction, GET store-operations may **auto-open** if current time is within operating hours and `block_auto_open` is false.  
   - It may **auto-close** when current time is outside operating hours.

3. **System automation**  
   - Auto-open sets `last_toggle_type = 'AUTO_OPEN'`; auto-close sets `last_toggle_type = 'AUTO_CLOSE'`.  
   - No row is inserted into `merchant_store_status_log` for auto events; only manual open/close are logged.

### 5.2 Closure Types (Modal)

| Option | `closure_type` | Backend behavior |
|--------|----------------|------------------|
| Temporary | `temporary` | `manual_close_until` = now + chosen time; `restriction_type = 'TEMPORARY'`. After `manual_close_until`, may auto-open if within hours. |
| Close for today | `today` | `manual_close_until` = tomorrow’s first slot start; `restriction_type = 'CLOSED_TODAY'`. |
| Until I manually turn it ON | `manual_hold` | `block_auto_open = true`, `restriction_type = 'MANUAL_HOLD'`, no `manual_close_until`. Store opens **only** when merchant clicks Store ON. |

### 5.3 GET Store-Operations Logic (Summary)

1. Resolve `store_id` → internal `id`; load `merchant_stores`, `merchant_store_availability`, `merchant_store_operating_hours`.
2. **Never auto-open** if `block_auto_open === true`.
3. If store is CLOSED and **no** manual restriction and within operating hours → auto-open (update `merchant_stores` + `merchant_store_availability`).
4. If `manual_close_until` has passed → clear it; if not manual hold and within hours → auto-open; else leave closed.
5. If store is OPEN and outside operating hours → auto-close.
6. Compute `opens_at` when closed (from `manual_close_until` or next slot from schedule).
7. Return status, slots, last action fields, `restriction_type`, `within_hours_but_restricted`.

### 5.4 Visual Indicators (Store Status Card)

- **Green:** Open (no restriction).
- **Red:** Closed (temporary or closed for today).
- **Orange:** Manual hold (waiting manual activation).
- **Restriction badge:** “Temporarily closed” / “Closed for today” / “Waiting manual activation”.
- **Message when applicable:** “Store is within operating hours but remains OFF due to manual restriction.”

---

## 6. Order Lifecycle

### 6.1 Status Flow (orders_food)

```
CREATED → ACCEPTED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED
   ↓           ↓           ↓              ↓                    ↓
CANCELLED   CANCELLED   CANCELLED / RTO   RTO / CANCELLED   (terminal)
```

### 6.2 Table and Widget Updates

| Step | Table(s) updated | Dashboard / Food Orders |
|------|-------------------|--------------------------|
| Order created | `orders_food` (order_status = CREATED) | Order appears in list; Pending count +1; Order flow “Placed” +1 |
| Accept | `orders_food`: order_status = ACCEPTED, accepted_at = now | Accepted count +1; Accept/Reject buttons replaced |
| Preparing | order_status = PREPARING | Preparing count +1 |
| Ready | order_status = READY_FOR_PICKUP | Ready count; “Ready” / “RTO” actions |
| Out for delivery | order_status = OUT_FOR_DELIVERY | Out for delivery count +1 |
| Delivered | order_status = DELIVERED, delivered_at = now | Delivered today +1; revenue; completion metrics |
| RTO / Cancelled | order_status = RTO or CANCELLED, cancelled_at = now | Cancelled count; completion/revenue adjusted |

KPIs and Order flow use the **same** source: `/api/food-orders/stats` (with optional `date`). Charts use `/api/dashboard-analytics` (last 7 days / 4 weeks from `orders_food`).

---

## 7. POS Integration

### 7.1 Default vs POS Mode

- **Default:** Ordering mode = “GatiMitra Orders”. Orders are received and managed in the portal (Food Orders page).
- **POS mode:** Merchant selects “Switch to POS”. If `merchant_store_pos_integration` does **not** have an active (ACTIVE) row for the store, dashboard shows **“Integrate POS first”** modal with link to Store Settings → POS tab. If integrated, mode switches to “POS” (UI state only; no API change to order routing in this codebase).

### 7.2 POS Partners (Store Settings)

PetPooja, UrbanPiper, RistaApps, Posist, Limetray, WeraFoods, Possier, Froogal (configured in Store Settings POS tab; stored in `merchant_store_pos_integration`).

### 7.3 Data Routing

- Dashboard and Food Orders **list/orders and stats** both read from `orders_food` regardless of mode. POS mode in the UI only changes the **label** and messaging (“Orders managed via POS”); it does not change which table backs the dashboard KPIs or order list in this codebase.

---

## 8. Button & Action Mapping

| Button | Location | On click | Backend | DB update | Audit log |
|--------|----------|----------|---------|-----------|-----------|
| Store ON (power) | Dashboard → Store Status | Opens “Turn Store ON?” confirmation; on confirm → POST store-operations `action: manual_open` | POST `/api/store-operations` | `merchant_stores`: OPEN; `merchant_store_availability`: clear manual_close_until, block_auto_open, restriction_type, set last_toggled_* | Yes: `merchant_store_status_log` INSERT OPEN |
| Store OFF (power) | Dashboard → Store Status | Opens close modal (Temporary / Close for today / Until I manually turn it ON); Confirm → POST `action: manual_close`, `closure_type` | POST `/api/store-operations` | `merchant_stores`: CLOSED; `merchant_store_availability`: set manual_close_until and/or block_auto_open, restriction_type, last_toggled_* | Yes: `merchant_store_status_log` INSERT CLOSED |
| Confirm (close modal) | Store close modal | Sends closure_type + duration_minutes (if temporary/today); shows **spinner** (“Confirming…”) until response | Same as above | Same as above | Yes |
| Switch (Ordering mode) | Dashboard → Ordering mode card | If switching to POS and not integrated → show “Integrate POS first”; else toggle local `orderMode` | GET `/api/merchant/pos-integration` (already used on load) | None for toggle | No |
| Delivery toggle | Dashboard → Delivery mode card | PATCH store-settings with `self_delivery` | PATCH `/api/merchant/store-settings` | `merchant_store_settings` upsert | No |
| Date filter | Above Order flow & KPIs | Sets `statsDate`; refetches stats with `date=` | GET `/api/food-orders/stats?store_id=&date=` | Read-only | No |
| View full audit logs | Dashboard → Audit log snapshot | Navigate to `/mx/audit-logs?storeId=` | — | — | — |
| Accept / Reject / Ready / RTO (per order) | Food Orders page | PATCH `/api/food-orders/[id]` with status change | PATCH food-orders/[id] | `orders_food`: order_status, accepted_at, prepared_at, etc. | Optional (e.g. order audit if present) |

---

## 9. Audit Log System

### 9.1 Store Status Audit

- **Table:** `merchant_store_status_log`.
- **Written by:** POST `/api/store-operations` only (manual_open and manual_close). Auto-open/auto-close do **not** insert rows.
- **Columns:** store_id, action (OPEN/CLOSED), restriction_type, performed_by_id, performed_by_email, performed_by_name, created_at.
- **Read by:** GET `/api/merchant/store-status-log` (dashboard Recent activities + snapshot), GET `/api/merchant/audit-logs` (full audit page).

### 9.2 Other Activity

- `merchant_store_activity_log` exists for broader store activity (e.g. delist, relist). The **dashboard and audit-logs page** currently use only `merchant_store_status_log` for store open/close.

---

## 10. Data Flow Diagram Explanation

```
[Merchant Browser]
    ↓
[Dashboard / Food Orders / Store Settings]
    ↓
[Next.js API Routes]
    ├── GET  /api/store-operations     → merchant_stores, merchant_store_availability, merchant_store_operating_hours
    ├── POST /api/store-operations     → merchant_stores, merchant_store_availability, merchant_store_status_log
    ├── GET  /api/food-orders/stats    → orders_food (filter by store + optional date)
    ├── GET  /api/food-orders          → orders_food
    ├── PATCH /api/food-orders/[id]    → orders_food
    ├── GET  /api/dashboard-analytics → orders_food
    ├── GET/PATCH /api/merchant/store-settings → merchant_store_settings
    ├── GET  /api/merchant/pos-integration     → merchant_store_pos_integration
    └── GET  /api/merchant/store-status-log   → merchant_store_status_log
    ↓
[Supabase PostgreSQL]
    ↓
[Realtime] (optional) → merchant_stores, merchant_store_availability, orders_food
    → Dashboard/Orders page refetch or update state
```

---

## 11. Permission & Safety Rules

### 11.1 Who Can Change Store Status

- **Merchant (or logged-in user):** POST store-operations with action manual_open or manual_close. Server reads session (e.g. Supabase auth) for `performed_by_email`, `performed_by_name`; `performed_by_id` can be store_id or user id. These are written to `merchant_store_availability` and `merchant_store_status_log`.
- **System:** GET store-operations applies auto-open/auto-close when no manual restriction; it does not write to `merchant_store_status_log`.

### 11.2 Conflict Prevention

- **Manual restriction > schedule:** If `block_auto_open` is true or `manual_close_until` is in the future, GET **does not** auto-open.
- **Single source of truth:** Operational status is in `merchant_stores`; availability and restrictions in `merchant_store_availability`; GET computes effective status and applies auto logic once per request.

### 11.3 Audit Enforcement

- Every **manual** open and close goes through POST store-operations, which **always** inserts one row into `merchant_store_status_log`. No manual toggle is possible without going through this API in the current design.

---

## 12. Edge Cases Handling

| Scenario | Handling |
|----------|----------|
| Store within operating hours but closed due to manual restriction | GET returns `within_hours_but_restricted: true`; dashboard shows: “Store is within operating hours but remains OFF due to manual restriction.” |
| “Opens in 0h 0m 0s” or time ≤ 0 | UI shows **“Opens now”** instead of 0h 0m 0s. |
| User clicks Confirm (close) twice | Button disabled with `closeConfirmLoading`; spinner shown until response. |
| Realtime update while modal open | Modal stays open; store status refetch runs on subscription; card updates after modal is closed. |
| No POS integration and user clicks “Switch to POS” | Modal “Integrate POS first” with link to Store Settings → POS. |
| Stats for a future date | API accepts any `date`; returns counts for that day (may be all zeros). |
| Missing `merchant_store_availability` row | POST store-operations calls `ensureAvailabilityRow` before update; GET does not insert. |

---

## 13. Developer Notes

### 13.1 Key Files

- **Dashboard UI:** `src/app/mx/dashboard/page.tsx` (Store Status card, modal, Order flow, KPIs, date filter, spinner, formatTimeHMS).
- **Store operations:** `src/app/api/store-operations/route.ts` (GET/POST, auto-open/auto-close, manual_hold, status_log insert).
- **Stats (KPIs + Order flow):** `src/app/api/food-orders/stats/route.ts` (optional `date`; reads `orders_food`).
- **Charts:** `src/app/api/dashboard-analytics/route.ts`.
- **Store settings (delivery):** `src/app/api/merchant/store-settings/route.ts`.
- **Status log:** `src/app/api/merchant/store-status-log/route.ts`, `src/app/api/merchant/audit-logs/route.ts`.
- **Migrations:** `drizzle/0052_store_operations_manual_close.sql`, `drizzle/0058_store_availability_activity_tracking.sql`, `drizzle/0059_store_status_control_and_activity.sql`.

### 13.2 Resolving store_id

- Public identifier is `store_id` (e.g. GMMC1002). All APIs that need the internal key query `merchant_stores` where `store_id = ?` and use `id` for joins and filters (e.g. `merchant_store_id` in `orders_food`).

### 13.3 Time and Timezone

- Store-operations uses `merchant_stores.timezone` (default Asia/Kolkata) for “today” and slot logic. Stats API uses UTC day boundaries for `date` param; for per-store timezone the backend could be extended to accept timezone or derive from store.

---

## 14. Future Scalability Suggestions

- **Store timezone in stats:** Support a store timezone (or `date` in store local time) for `/api/food-orders/stats` so “today” and date filter align with merchant’s day.
- **Pagination for status log:** Audit and Recent activities could paginate or cap by date range for very active stores.
- **Order audit:** If order-level audit is required (who accepted, who marked ready, etc.), consider an `order_food_audit` or reuse of existing order audit tables and wire to PATCH food-orders/[id].
- **POS webhooks:** When POS is active, order creation/updates might come from external webhooks; ensure `orders_food` remains the single source for dashboard KPIs and that status sync is documented.
- **Role-based permissions:** Restrict store toggle or settings change by role using `merchant_user_store_access` or similar once enforced in API.

---

*End of GatiMitra Merchant Portal System Documentation.*
