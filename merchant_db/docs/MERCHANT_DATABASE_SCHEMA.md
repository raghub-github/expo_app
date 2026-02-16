# Merchant Portal – Database Schema & System Flow

This document describes the **tables**, **schema**, and **business logic** for the GatiMitra merchant (parent) and store (child) onboarding and auth system.

---

## 1. System flow (high level)

1. **Parent registration**  
   Merchant registers as a **parent** with **email** and **phone** (both required).  
   After submission, the parent is **auto-verified** (no manual approval).

2. **Login**  
   Parent can sign in with:
   - **Email + password**, or  
   - **Email or mobile + OTP** (Supabase Auth: magic link / SMS OTP).

3. **Child (store) onboarding**  
   After login, parent can add **stores** (child outlets).  
   Each store is created in **pending** state (e.g. `SUBMITTED` / `UNDER_VERIFICATION`).

4. **Store verification**  
   An **agent** or **area manager** verifies the store later.  
   Status moves to `APPROVED` or `REJECTED`; only approved stores are active.

---

## 2. Auth flow (registration & login)

### 2.1 Registration (parent only)

- **Input:** Email, password, mobile (10-digit), owner name, optional business/parent name and category.
- **Backend:**  
  - Creates Supabase Auth user (email + password).  
  - Links **phone** to the same user via `auth.admin.updateUserById(..., { phone, phone_confirm: true })`.  
  - Inserts row in `merchant_parents` with:
    - `status = 'ACTIVE'` (parent auto-verified),
    - `supabase_user_id` = Auth user id,
    - `owner_email`, `registered_phone`, `registered_phone_normalized`.
- **Uniqueness:** One account per email and per phone (enforced by DB and API).

### 2.2 Login (email or mobile with OTP)

- **Email + password:**  
  `POST /api/auth/login` → Supabase `signInWithPassword` → session → `POST /api/auth/set-cookie` → validate merchant → redirect to dashboard.

- **OTP (email or mobile):**  
  - User enters email or phone on login page.  
  - Frontend: Supabase `signInWithOtp({ email })` or `signInWithOtp({ phone: '+91...' })`.  
  - User enters OTP → Supabase `verifyOtp` → session.  
  - Frontend: `POST /api/auth/set-cookie` with tokens.  
  - Backend validates merchant by **email** (if present) or by **supabase_user_id** (e.g. phone-only session), then sets cookies and allows access.

---

## 3. Core tables

### 3.1 Enums (relevant to merchant/store flow)

| Enum | Values |
|------|--------|
| `merchant_type` | `LOCAL`, `BRAND`, `CHAIN`, `FRANCHISE` |
| `merchant_status` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `BLOCKED`, `PENDING_APPROVAL` |
| `store_status` | `ACTIVE`, `INACTIVE` |
| `store_approval_status` | `DRAFT`, `SUBMITTED`, `UNDER_VERIFICATION`, `APPROVED`, `REJECTED`, `BLOCKED`, `DELISTED`, `SUSPENDED` |
| `verification_status` | `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`, `EXPIRED` |

---

### 3.2 `merchant_parents`

Parent merchant (brand/chain owner). One parent can have many stores.

| Column | Type | Notes |
|--------|------|--------|
| `id` | BIGSERIAL PRIMARY KEY | Internal id. |
| `parent_merchant_id` | TEXT NOT NULL UNIQUE | Business id, e.g. `GMMP1001`, `GMMP1002`. |
| `parent_name` | TEXT NOT NULL | Display name. |
| `merchant_type` | merchant_type NOT NULL | Default `LOCAL`. |
| `owner_name` | TEXT NOT NULL | Contact name. |
| `owner_email` | TEXT | Unique when set; used for email login. |
| `registered_phone` | TEXT NOT NULL UNIQUE | E.164, e.g. `+919876543210`. |
| `registered_phone_normalized` | TEXT | 10-digit for lookups. |
| `alternate_phone` | TEXT | Optional. |
| `business_name` | TEXT | Optional. |
| `brand_name` | TEXT | Optional. |
| `business_category` | TEXT | Optional. |
| `status` | merchant_status NOT NULL | Set to `ACTIVE` after registration (auto-verified). |
| `is_active` | BOOLEAN | Default TRUE. |
| `supabase_user_id` | UUID | Links to Supabase Auth user; used for session and phone-OTP login. |
| `deleted_at`, `deleted_by` | TIMESTAMP, INTEGER | Soft delete. |
| `created_at`, `updated_at`, `created_by`, `updated_by` | TIMESTAMP / INTEGER | Audit. |

**Indexes (main):**

- `merchant_parents_parent_merchant_id_idx` (UNIQUE)
- `merchant_parents_registered_phone_idx` (UNIQUE)
- `merchant_parents_email_idx` (UNIQUE, WHERE owner_email IS NOT NULL)
- `merchant_parents_supabase_user_id_key` (UNIQUE, WHERE supabase_user_id IS NOT NULL)
- `merchant_parents_status_idx`, `merchant_parents_is_active_idx`, `merchant_parents_merchant_type_idx`

---

### 3.3 `merchant_stores`

Child stores (outlets) under a parent. Onboarding is pending until approved by agent/area manager.

| Column | Type | Notes |
|--------|------|--------|
| `id` | BIGSERIAL PRIMARY KEY | Internal id. |
| `store_id` | TEXT NOT NULL UNIQUE | Business store code. |
| `parent_id` | BIGINT NOT NULL | FK → `merchant_parents(id)` ON DELETE RESTRICT. |
| `store_name` | TEXT NOT NULL | |
| `store_display_name` | TEXT | Optional. |
| `store_description` | TEXT | Optional. |
| `store_type` | TEXT | e.g. RESTAURANT, CLOUD_KITCHEN, CAFE. |
| `store_email` | TEXT | |
| `store_phones` | TEXT[] | |
| `full_address` | TEXT NOT NULL | |
| `address_line1`, `address_line2`, `landmark` | TEXT | |
| `city` | TEXT NOT NULL | |
| `state` | TEXT NOT NULL | |
| `postal_code` | TEXT NOT NULL | |
| `country` | TEXT | Default `IN`. |
| `latitude`, `longitude` | NUMERIC | |
| `logo_url`, `banner_url`, `gallery_images` | TEXT / TEXT[] | |
| `cuisine_types`, `food_categories` | TEXT[] | |
| `avg_preparation_time_minutes` | INTEGER | |
| `min_order_amount`, `max_order_amount` | NUMERIC | |
| `delivery_radius_km` | NUMERIC | |
| `is_pure_veg`, `accepts_online_payment`, `accepts_cash` | BOOLEAN | |
| `status` | store_status NOT NULL | Synced with approval (e.g. ACTIVE when APPROVED). |
| `approval_status` | TEXT | `DRAFT`, `SUBMITTED`, `UNDER_VERIFICATION`, `APPROVED`, `REJECTED`, etc. |
| `approval_reason` | TEXT | |
| `approved_by` | INTEGER | Agent/area manager. |
| `approved_at` | TIMESTAMP WITH TIME ZONE | |
| `rejected_reason` | TEXT | |
| `current_onboarding_step` | INTEGER | |
| `onboarding_completed` | BOOLEAN | |
| `onboarding_completed_at` | TIMESTAMP WITH TIME ZONE | |
| `is_active` | BOOLEAN | |
| `is_accepting_orders` | BOOLEAN | |
| `is_available` | BOOLEAN | |
| `last_activity_at` | TIMESTAMP WITH TIME ZONE | |
| `deleted_at`, `deleted_by`, `delist_reason`, `delisted_at` | TIMESTAMP / TEXT | Soft delete / delist. |
| `created_at`, `updated_at`, `created_by`, `updated_by` | TIMESTAMP / INTEGER | Audit. |

**Store approval flow:**  
New store starts as `SUBMITTED` (or `DRAFT`). Agent/area manager reviews → `UNDER_VERIFICATION` → `APPROVED` or `REJECTED`. Trigger (e.g. `enforce_store_status_rule`) sets `status` to `ACTIVE` when `approval_status = 'APPROVED'`, otherwise `INACTIVE`.

**Indexes (main):**

- `merchant_stores_store_id_idx` (UNIQUE)
- `merchant_stores_parent_id_idx`
- `merchant_stores_status_idx`, `merchant_stores_is_active_idx`, `merchant_stores_is_accepting_orders_idx`
- `merchant_stores_city_idx`, `merchant_stores_postal_code_idx`, `merchant_stores_location_idx`

---

## 4. Supabase Auth link (migration 0035)

- `merchant_parents.supabase_user_id` stores the Supabase Auth user id (`auth.users.id`).
- Set at **registration**; used for:
  - Session validation (who is logged in).
  - **Phone OTP login**: after `verifyOtp`, session has `user.id` but may not have `user.email`; backend validates merchant by `supabase_user_id`.

---

## 5. Other related structures (reference)

- **merchant_store_services** – Multi-service (e.g. food, parcel) per store.
- **merchant_store_verification** – Verification records (KYC, address, etc.) per store.
- **store_registration_progress** – Onboarding progress per parent/store (if used).
- **orders** – `merchant_store_id`, `merchant_parent_id` reference stores and parents.

Drizzle migrations live under `merchant_db/drizzle/` (e.g. `0010_merchant_domain_complete.sql`, `0025_critical_indexes_part4.sql`, `0034_fresh_store_enums_and_status_rules.sql`, `0035_merchant_auth_supabase_user_id.sql`). Application schema types are in `src/lib/schema.ts` (partial; full definitions are in SQL migrations).

---

## 6. Summary

| Concept | Implementation |
|--------|-----------------|
| Parent registration | Email + phone required; Supabase user created; phone linked to user; `merchant_parents` row with `status = ACTIVE`. |
| Parent login | Email + password **or** email/mobile OTP via Supabase; validation by email or `supabase_user_id`; session via `/api/auth/set-cookie`. |
| Child (store) onboarding | Created by logged-in parent; starts in pending state (`SUBMITTED` / `UNDER_VERIFICATION`). |
| Store verification | Agent/area manager approves or rejects; `approval_status` → `APPROVED`/`REJECTED`; store `status` becomes ACTIVE only when APPROVED. |
