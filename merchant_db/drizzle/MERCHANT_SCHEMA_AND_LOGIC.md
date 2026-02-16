# Merchant Dashboard – Schema, Relations & Business Logic

This document describes the merchant-domain tables, their relationships, and the **area manager vs self-registration** flows so the schema supports both onboarding paths.

---

## 1. Core entity relationship (high level)

```
area_managers (dashboard user, system_users)
       │
       │ area_manager_id
       ├──────────────────► merchant_parents (brand/parent)
       │                             │
       │                             │ parent_id
       │                             ▼
       └──────────────────► merchant_stores (child outlets)
                                     │
                                     │ store_id (history)
                                     ▼
                    merchant_store_status_history

merchant_area_managers (region/cities/postal_codes for “nearest AM” lookup)
       │
       │ merchant_store_manager_assignments.manager_id
       └──────────────────► merchant_store_manager_assignments
                                     │ store_id
                                     ▼
                            merchant_stores
```

- **Parent**: one `merchant_parents` row per brand/owner (owner_email, registered_phone, supabase_user_id for login).
- **Child**: many `merchant_stores` per parent; each store has `parent_id` → `merchant_parents.id` and optional `area_manager_id` → `area_managers.id`.
- **Area manager (dashboard)**: `area_managers` is the table used for **onboarding and assignment**; it links to `system_users` (dashboard login). Both `merchant_parents` and `merchant_stores` use `area_manager_id` → `area_managers(id)`.
- **Area manager (region lookup)**: `merchant_area_managers` holds region/cities/postal_codes and is used to **find the nearest AM** when a merchant self-registers; it is linked to stores via `merchant_store_manager_assignments`, not via `area_manager_id` on parent/store.

---

## 2. Table definitions and relations (aligned with your DDL)

### 2.1 `merchant_parents`

| Column | Type | Notes |
|--------|------|--------|
| id | bigserial | PK |
| parent_merchant_id | text | Unique (e.g. GMMP1001) |
| parent_name | text | |
| merchant_type | merchant_type | LOCAL, BRAND, CHAIN, FRANCHISE |
| owner_name | text | |
| owner_email | text | Unique (where not null); used for login |
| registered_phone | text | Unique, format check |
| registered_phone_normalized | text | |
| alternate_phone, brand_name, business_category | text | |
| is_active | boolean | |
| registration_status | text | VERIFIED, SUSPENDED (check constraint) |
| address_line1, city, state, pincode | text | |
| approval_status | parent_approval_status | e.g. APPROVED (default) |
| area_manager_id | bigint | **FK → area_managers(id) ON DELETE SET NULL** |
| created_by_name, store_logo | text | |
| supabase_user_id | uuid | Supabase Auth user; unique where not null |
| created_at, updated_at | timestamptz | |

**Relations:**

- `area_manager_id` → `area_managers(id)`.  
  Set when: (1) area manager onboard the parent from dashboard, or (2) self-registration assigns “nearest” area manager.

---

### 2.2 `merchant_stores` (child)

| Column | Type | Notes |
|--------|------|--------|
| id | bigserial | PK |
| store_id | text | Unique (e.g. GMS-xxx) |
| parent_id | bigint | **FK → merchant_parents(id) ON DELETE RESTRICT** |
| store_name, store_display_name, store_description | text | |
| store_email, store_phones | text / text[] | |
| full_address, landmark, city, state, postal_code, country | text | |
| latitude, longitude | numeric | |
| logo_url, banner_url, gallery_images | text / array | |
| cuisine_types, food_categories | array | |
| avg_preparation_time_minutes, min_order_amount, delivery_radius_km | numeric/int | |
| is_pure_veg, accepts_online_payment, accepts_cash | boolean | |
| status | store_status | e.g. ACTIVE, INACTIVE |
| approval_status | store_approval_status | DRAFT, SUBMITTED, UNDER_VERIFICATION, APPROVED, REJECTED, etc. |
| approval_reason, approved_by, approved_at, rejected_reason | text / int / timestamptz | |
| current_onboarding_step, onboarding_completed, onboarding_completed_at | int / boolean / timestamptz | |
| is_active, is_accepting_orders, is_available, last_activity_at | boolean / timestamptz | |
| deleted_at, deleted_by, delist_reason, delisted_at | timestamptz / int / text | |
| store_type | store_type | RESTAURANT, CAFE, etc. |
| operational_status | store_operational_status | OPEN, CLOSED, etc. |
| parent_merchant_id | text | Denormalized from parent; sync’d by trigger |
| area_manager_id | bigint | **FK → area_managers(id) ON DELETE SET NULL** |
| created_at, updated_at, created_by, updated_by | timestamptz / int | |

**Relations:**

- `parent_id` → `merchant_parents(id)`.
- `area_manager_id` → `area_managers(id)`.  
  Set when: (1) area manager onboard the store from dashboard, or (2) after self-registration, when the assigned area manager approves the child store.

---

### 2.3 `merchant_store_status_history`

| Column | Type | Notes |
|--------|------|--------|
| id | bigserial | PK |
| store_id | bigint | **FK → merchant_stores(id)** (recommended: ON DELETE CASCADE or RESTRICT) |
| from_status, to_status | store_status | |
| from_approval_status, to_approval_status | store_approval_status | |
| from_operational_status, to_operational_status | store_operational_status | |
| change_reason, change_notes | text | |
| changed_by, changed_by_id, changed_by_name | text / int | |
| status_metadata | jsonb | |
| created_at | timestamptz | |

**Relations:**

- `store_id` → `merchant_stores(id)`.  
  Populated by trigger on `merchant_stores` when `approval_status` or `operational_status` (and optionally `status`) change.

---

### 2.4 `area_managers` (dashboard area manager)

| Column | Type | Notes |
|--------|------|--------|
| id | bigint | PK |
| user_id | integer | **FK → system_users(id)** – dashboard login |
| manager_type | area_manager_status (or enum) | |
| area_code, locality_code, city | text | |
| status | area_manager_status | e.g. ACTIVE |
| created_at, updated_at | timestamptz | |

**Role:**  
Represents the **dashboard user** who can onboard merchants and approve stores.  
`merchant_parents.area_manager_id` and `merchant_stores.area_manager_id` reference this table.

---

### 2.5 `merchant_area_managers` (region-based “nearest AM” lookup)

| Column | Type | Notes |
|--------|------|--------|
| id | bigint | PK |
| manager_id | text | Unique (e.g. AM-xxx) |
| name, email, mobile | text | Unique where applicable |
| alternate_mobile | text | |
| region | text | |
| cities, postal_codes | text[] | Used to find “nearest” AM by location |
| status | text | e.g. ACTIVE |
| user_id | integer | Optional link to system_users (if same as area_managers.user_id) |
| created_at, updated_at | timestamptz | |

**Role:**  
Used when a **merchant self-registers**: find the nearest AM by `region` / `cities` / `postal_codes`, then resolve to `area_managers.id` (e.g. via `user_id` → `area_managers.user_id`) and set `merchant_parents.area_manager_id` (and later `merchant_stores.area_manager_id` when the store is approved).

**Relation to stores:**  
`merchant_store_manager_assignments` links `merchant_area_managers.id` (manager_id) to `merchant_stores.id` (store_id).

---

## 3. Business logic: two onboarding flows

### 3.1 Area manager onboard (from dashboard)

1. Area manager is logged in as a **system user** and has a row in **area_managers** (linked by `user_id`).
2. They create/onboard:
   - **merchant_parents**: set `area_manager_id` = current area manager’s `area_managers.id`.
   - **merchant_stores**: set `parent_id` and `area_manager_id` = same area manager.
3. Parent and child can be approved by that area manager (approval_status, status, triggers, and status_history behave as designed).

Schema support: `merchant_parents.area_manager_id` and `merchant_stores.area_manager_id` both reference `area_managers(id)`.

---

### 3.2 Merchant self-registers → assign nearest AM → child approved

1. **Registration**  
   Merchant registers (e.g. via `/auth/register`): create Supabase user and insert **merchant_parents** (owner_email, registered_phone, supabase_user_id, etc.).

2. **Assign nearest area manager**  
   Using merchant’s address (e.g. city, state, pincode from `merchant_parents`):
   - Query **merchant_area_managers** by `region`, `cities`, or `postal_codes` to find the “nearest” or default AM.
   - Resolve to **area_managers**: e.g. `merchant_area_managers.user_id` = `area_managers.user_id` and get `area_managers.id`.
   - Update **merchant_parents**: set `area_manager_id` = that `area_managers.id`.

3. **Child store approval**  
   When the merchant adds a store (or submits for approval), the **child store** row in **merchant_stores** can:
   - Get the same `area_manager_id` from the parent (or be set by workflow).
   - Be approved by that area manager from the dashboard (approval_status → APPROVED, status → ACTIVE, etc.), with **merchant_store_status_history** filled by the existing trigger.

Schema support:  
- `merchant_parents` and `merchant_stores` both have `area_manager_id` → `area_managers(id)`.  
- `merchant_area_managers` (region/cities/postal_codes) is used only for the “nearest AM” resolution; the canonical assignment is always stored in `area_manager_id` on parent and store.

---

## 4. Relation summary (for implementation)

| From table | Column | To table | Purpose |
|------------|--------|----------|---------|
| merchant_parents | area_manager_id | area_managers(id) | Who onboarded / is responsible for the parent |
| merchant_stores | parent_id | merchant_parents(id) | Parent brand of the store |
| merchant_stores | area_manager_id | area_managers(id) | Who onboarded / approves the store |
| merchant_store_status_history | store_id | merchant_stores(id) | Which store’s status changed |
| merchant_store_manager_assignments | manager_id | merchant_area_managers(id) | Which region-based AM is assigned to the store |
| merchant_store_manager_assignments | store_id | merchant_stores(id) | Which store is assigned |
| area_managers | user_id | system_users(id) | Dashboard login for area manager |

Optional: if you want a direct link from dashboard AM to region AM, you can add `area_managers.merchant_area_manager_id` → `merchant_area_managers(id)` so that “nearest” lookup returns `merchant_area_managers` and you immediately have `area_managers.id` for `area_manager_id`.

---

## 5. Enums (from your DDL and migrations)

- **merchant_type**: LOCAL, BRAND, CHAIN, FRANCHISE  
- **parent_approval_status**: e.g. APPROVED (and any other values you use)  
- **store_status**: ACTIVE, INACTIVE (and any extended set from 0034)  
- **store_approval_status**: DRAFT, SUBMITTED, UNDER_VERIFICATION, APPROVED, REJECTED, BLOCKED, DELISTED, SUSPENDED  
- **store_type**: RESTAURANT, CAFE, BAKERY, etc.  
- **store_operational_status**: OPEN, CLOSED (or INACTIVE), etc.  
- **area_manager_status**: used on `area_managers.status`

---

## 6. Schema checklist for “fully designed” state

- [x] **merchant_parents**: PK, unique parent_merchant_id, unique registered_phone, unique owner_email (where not null), unique supabase_user_id (where not null), FK area_manager_id → area_managers(id), registration_status and approval_status with check/enum.
- [x] **merchant_stores**: PK, unique store_id, FK parent_id → merchant_parents(id), FK area_manager_id → area_managers(id), status/approval_status/store_type/operational_status enums, triggers for parent_merchant_id sync and status_history.
- [x] **merchant_store_status_history**: PK, store_id (with FK → merchant_stores(id) in migrations), from/to status and approval and operational columns, changed_by metadata.
- [x] **area_managers**: PK, FK user_id → system_users(id); used for onboarding and assignment on parent and store.
- [x] **merchant_area_managers**: PK, unique manager_id/email/mobile, region/cities/postal_codes for “nearest AM” lookup; linked to stores via merchant_store_manager_assignments.
- [x] **merchant_store_manager_assignments**: store_id → merchant_stores(id), manager_id → merchant_area_managers(id).

With this, the schema is fully designed to support both **area manager onboarding** and **self-registration with nearest area manager assignment and child store approval**. You can proceed with implementing the two flows in the app and APIs.
