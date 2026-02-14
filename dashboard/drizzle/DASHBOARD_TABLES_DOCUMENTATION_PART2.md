# Dashboard Tables Documentation — Part 2 (Migrations 0080–0093 & Enterprise Ticket System)

This document continues **[DASHBOARD_TABLES_DOCUMENTATION.md](DASHBOARD_TABLES_DOCUMENTATION.md)** and covers migrations 0080 through 0093, new tables and schema changes in that range, and a reference to the Enterprise Ticket System (backend 0055–0056).

**Last Updated**: February 11, 2026  
**Migration Files Covered**: 0080, 0081, 0082, 0083, 0084, 0085, 0086, 0087, 0088, 0089, 0090, 0091, 0092, 0093  
**Backend Reference**: 0055 (Enterprise Ticket System), 0056 (migrate unified tickets to enterprise)

---

## Table of Contents

1. [Migration 0080 – Tickets resolved_by](#1-migration-0080--tickets-resolved_by)
2. [Migration 0081 – Wallet credit requests](#2-migration-0081--wallet-credit-requests)
3. [Migrations 0082 & 0083 – Rider schema redesign and full upgrade](#3-migrations-0082--0083--rider-schema-redesign-and-full-upgrade)
4. [Migration 0084 – Negative wallet block only when balance ≤ 0](#4-migration-0084--negative-wallet-block-only-when-balance--0)
5. [Migration 0085 – Rider onboarding system redesign](#5-migration-0085--rider-onboarding-system-redesign)
6. [Migration 0086 – Rider domain dummy data](#6-migration-0086--rider-domain-dummy-data)
7. [Enterprise Ticket System (Backend 0055–0056)](#7-enterprise-ticket-system-backend-00555056)
8. [Summary and migration quick reference](#8-summary-and-migration-quick-reference)
9. [Remaining migrations (0087–0093)](#9-remaining-migrations-00870093)

---

## 1. Migration 0080 – Tickets resolved_by

**File**: `0080_tickets_resolved_by.sql`

**Purpose**: Add audit field “resolved by whom” for rider support tickets.

### Change

| Table   | Change | Description |
|--------|--------|-------------|
| `tickets` | ADD COLUMN `resolved_by` | INTEGER, FK to `system_users(id)` ON DELETE SET NULL. Agent who resolved/closed the ticket. |
| `tickets` | ADD INDEX | `tickets_resolved_by_idx` on `resolved_by` WHERE `resolved_by IS NOT NULL` |

**Usage**: When a ticket is resolved or closed, set `resolved_by` to the `system_users.id` of the agent who performed the action so the UI can show “Resolved by”.

---

## 2. Migration 0081 – Wallet credit requests

**File**: `0081_wallet_credit_requests.sql`

**Purpose**: Agent-initiated wallet credit requests with approver workflow. On approval: write to `wallet_ledger`, update `rider_wallet` (FIFO/block sync).

### Table: `wallet_credit_requests`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INT | FK to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `order_id` | BIGINT | FK to `orders.id` (ON DELETE SET NULL), optional |
| `service_type` | TEXT | 'food', 'parcel', 'person_ride', or NULL; CHECK |
| `amount` | NUMERIC(10, 2) | Amount (NOT NULL, CHECK amount > 0) |
| `reason` | TEXT | Reason (NOT NULL) |
| `status` | TEXT | 'pending', 'approved', 'rejected' (NOT NULL, default: 'pending'); CHECK |
| `idempotency_key` | TEXT | Idempotency key, optional |
| `requested_by_system_user_id` | INT | FK to `system_users.id` (ON DELETE CASCADE, NOT NULL) |
| `requested_by_email` | TEXT | Requester email snapshot |
| `requested_at` | TIMESTAMPTZ | When requested (NOT NULL, default: NOW()) |
| `reviewed_by_system_user_id` | INT | FK to `system_users.id` (ON DELETE SET NULL), approver |
| `reviewed_by_email` | TEXT | Reviewer email snapshot |
| `reviewed_at` | TIMESTAMPTZ | When reviewed |
| `review_note` | TEXT | Approver note |
| `approved_ledger_ref` | TEXT | UNIQUE; reference to wallet_ledger entry when approved |
| `metadata` | JSONB | Additional data (NOT NULL, default: '{}') |

**Indexes**:
- `wallet_credit_requests_rider_status_requested_idx` on (`rider_id`, `status`, `requested_at DESC`)
- `wallet_credit_requests_status_requested_idx` on (`status`, `requested_at DESC`)
- `wallet_credit_requests_idempotency_idx` UNIQUE on (`requested_by_system_user_id`, `idempotency_key`) WHERE `idempotency_key IS NOT NULL`
- `wallet_credit_requests_pending_dedupe_idx` UNIQUE on (`rider_id`, COALESCE(order_id, 0), amount, md5(reason)) WHERE `status = 'pending'`

**Notes**: Agents request credits; approvers approve or reject. On approval, application writes to `wallet_ledger` and updates `rider_wallet` (including FIFO unblock and block sync as per 0079/0084).

---

## 3. Migrations 0082 & 0083 – Rider schema redesign and full upgrade

**Files**: `0082_rider_schema_redesign.sql`, `0083_rider_schema_full_upgrade.sql`

**Purpose**: Align dashboard DB with backend/dashboard schema: reference tables, rider addresses, document files, payment methods, soft delete/audit columns, and related FKs. 0083 is idempotent and can be run multiple times.

### 3.1 Reference tables

| Table | Purpose |
|-------|---------|
| `cities` | id, name, state, country_code, timezone, is_active, created_at, updated_at. Indexes: (name, state), is_active. |
| `service_types` | id, code (UNIQUE), name, is_active, sort_order, created_at, updated_at. 0083 seeds: food, parcel, person_ride. |
| `vehicle_service_mapping` | id, vehicle_type, service_type_id (FK service_types), allowed, created_at, updated_at. |
| `city_vehicle_rules` | id, city_id (FK cities), service_type_id (FK service_types), rule_type, rule_config (JSONB), effective_from, effective_to, is_active, created_at, updated_at. |

### 3.2 New enums (0082/0083)

- `rider_address_type`: 'registered', 'current', 'other'
- `document_verification_status`: 'pending', 'approved', 'rejected'
- `document_file_side`: 'front', 'back', 'single'
- `payment_method_type`: 'bank', 'upi'
- `payment_method_verification_status`: 'pending', 'verified', 'rejected'
- `verification_proof_type`: 'passbook', 'cancelled_cheque', 'statement', 'upi_qr_image'
- (0083) `vehicle_type`, `fuel_type`, `vehicle_active_status`, `ac_type` as needed for rider_vehicles

### 3.3 Table: `rider_addresses`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INT | FK to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `address_type` | rider_address_type | 'registered', 'current', 'other' (NOT NULL, default: 'registered') |
| `full_address` | TEXT | Full address (NOT NULL) |
| `city_id` | BIGINT | FK to `cities.id` (ON DELETE SET NULL) |
| `state` | TEXT | State |
| `pincode` | TEXT | Pincode |
| `latitude` | NUMERIC(10,7) | Latitude |
| `longitude` | NUMERIC(10,7) | Longitude |
| `is_primary` | BOOLEAN | Primary address (NOT NULL, default: false) |
| `created_at` | TIMESTAMPTZ | Creation (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMPTZ | Update (NOT NULL, default: NOW()) |

**Indexes**: rider_id, city_id, (rider_id, is_primary).  
**Backfill**: 0082/0083 backfill from `riders` (address, city, state, pincode, lat, lon) into `rider_addresses` with address_type 'registered', is_primary true.

### 3.4 Table: `rider_document_files`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `document_id` | BIGINT | FK to `rider_documents.id` (ON DELETE CASCADE, NOT NULL) |
| `file_url` | TEXT | File URL (NOT NULL) |
| `r2_key` | TEXT | R2 storage key |
| `side` | document_file_side | 'front', 'back', 'single' (NOT NULL, default: 'single') |
| `mime_type` | TEXT | MIME type |
| `sort_order` | INT | Sort order (default: 0) |
| `created_at` | TIMESTAMPTZ | Creation (NOT NULL, default: NOW()) |

**Index**: document_id.

### 3.5 Table: `rider_payment_methods`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INT | FK to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `method_type` | payment_method_type | 'bank', 'upi' (NOT NULL) |
| `account_holder_name` | TEXT | Account holder name (NOT NULL) |
| `bank_name` | TEXT | Bank name |
| `ifsc` | TEXT | IFSC |
| `branch` | TEXT | Branch |
| `account_number_encrypted` | TEXT | Encrypted account number |
| `upi_id` | TEXT | UPI ID |
| `verification_status` | payment_method_verification_status | 'pending', 'verified', 'rejected' (NOT NULL, default: 'pending') |
| `verification_proof_type` | verification_proof_type | Proof type |
| `proof_document_id` | BIGINT | FK to `rider_documents.id` (ON DELETE SET NULL) |
| `verified_at` | TIMESTAMPTZ | When verified |
| `verified_by` | BIGINT | FK to `system_users.id` (ON DELETE SET NULL) |
| `created_at` | TIMESTAMPTZ | Creation (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMPTZ | Update (NOT NULL, default: NOW()) |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Indexes**: rider_id, verification_status, deleted_at (partial).

### 3.6 Changes to existing tables

**`riders`** (0082/0083):
- ADD COLUMN `deleted_at` TIMESTAMPTZ, `deleted_by` INT, `created_by` INT, `updated_by` INT (if not exist).
- Index: `riders_deleted_at_idx` on `deleted_at`.

**`rider_documents`** (0082/0083):
- New columns (if not exist): `doc_number`, `verification_status` (document_verification_status), `expiry_date`, `verified_at`, `verified_by` (FK system_users), `vehicle_id` (FK rider_vehicles in 0085), `updated_at`, `created_by`, `updated_by`.
- Index: `rider_documents_verification_status_idx` (partial).

**`rider_vehicles`** (0083):
- New columns (if not exist): `is_commercial` (BOOLEAN, default false), `registration_state`, `permit_expiry`, `vehicle_active_status` (TEXT, default 'active'), `seating_capacity`, `deleted_at`, `deleted_by`, `created_by`, `updated_by`.
- Indexes: vehicle_active_status (partial), deleted_at (partial).

**`withdrawal_requests`** (0082/0083):
- ADD COLUMN `payment_method_id` BIGINT FK to `rider_payment_methods(id)` ON DELETE SET NULL (if not exist).
- Index: `withdrawal_requests_payment_method_id_idx`.

**`duty_logs`** (0083):
- ADD COLUMN `vehicle_id` BIGINT FK to `rider_vehicles(id)` ON DELETE SET NULL (if not exist).
- Index: `duty_logs_vehicle_id_idx` (partial).

**`document_type` enum** (0082/0083):
- Extended with: aadhaar_front, aadhaar_back, dl_front, dl_back, insurance, bank_proof, upi_qr_proof, profile_photo, vehicle_image, ev_ownership_proof, other (idempotent).

---

## 4. Migration 0084 – Negative wallet block only when balance ≤ 0

**File**: `0084_negative_wallet_block_only_when_balance_zero_or_negative.sql`

**Purpose**: Change `sync_rider_negative_wallet_blocks_from_wallet()` so that **no** service blocks or global block are applied while the wallet is positive. Blocks apply only when `total_balance ≤ 0`.

### Behavior (after 0084)

1. **When `total_balance > 0`**: Trigger deletes any existing rows for the rider in `rider_negative_wallet_blocks` and returns. No blocks are created.
2. **When `total_balance ≤ 0`**:
   - **Global block**: If `total_balance ≤ -200`, insert three rows (food, parcel, person_ride) with reason `global_emergency`.
   - **Per-service block**: Else compute effective_net = (earnings − penalties + unblock_alloc) per service; insert only for services where effective_net ≤ -50 with reason `negative_wallet`.

### Repair

0084 runs an UPDATE on `rider_wallet` to set `last_updated_at = NOW()` for riders who have rows in `rider_negative_wallet_blocks` but `total_balance > 0`, so the trigger runs and clears those blocks.

---

## 5. Migration 0085 – Rider onboarding system redesign

**File**: `0085_rider_onboarding_system_redesign.sql`

**Purpose**: Extend vehicle types, add document/vehicle fraud and manual-review fields, add per-rider per-service activation, onboarding status transitions, rule policies, and seed vehicle–service mapping.

### 5.1 vehicle_type enum extension

New values: `taxi`, `e_rickshaw`, `ev_car` (idempotent).

### 5.2 New enums

- `ownership_type`: 'ownership', 'rental', 'authorization_letter'
- `service_activation_status`: 'inactive', 'active', 'limited', 'suspended'
- `onboarding_rule_scope`: 'global', 'city', 'service', 'vehicle_type'
- `verification_method`: 'APP_VERIFIED', 'MANUAL_UPLOAD' (if not exists)

### 5.3 rider_documents new columns

| Column | Type | Description |
|--------|------|-------------|
| `fraud_flags` | JSONB | Fraud flags (default: '{}') |
| `duplicate_document_id` | BIGINT | FK to `rider_documents.id` ON DELETE SET NULL |
| `requires_manual_review` | BOOLEAN | Requires manual review (NOT NULL, default: false) |
| `verification_method` | verification_method | APP_VERIFIED or MANUAL_UPLOAD (if column added) |

Indexes: duplicate_document_id (partial), requires_manual_review (partial).  
Optional: FK `rider_documents.vehicle_id` → `rider_vehicles.id` if column exists.

### 5.4 rider_vehicles new columns

| Column | Type | Description |
|--------|------|-------------|
| `ownership_type` | TEXT | ownership | rental | authorization_letter |
| `limitation_flags` | JSONB | Limitation flags (default: '{}') |
| `is_commercial` | BOOLEAN | Commercial vehicle (NOT NULL, default: false) |

### 5.5 Table: `rider_service_activation`

Per-rider per-service activation status (driven by Service Activation Engine after document/vehicle verification).

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INT | FK to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `service_type_id` | BIGINT | FK to `service_types.id` (ON DELETE CASCADE, NOT NULL) |
| `status` | service_activation_status | 'inactive', 'active', 'limited', 'suspended' (NOT NULL, default: 'inactive') |
| `activated_at` | TIMESTAMPTZ | When activated |
| `deactivated_at` | TIMESTAMPTZ | When deactivated |
| `vehicle_id` | BIGINT | FK to `rider_vehicles.id` (ON DELETE SET NULL) |
| `limitation_flags` | JSONB | Per-activation limitations (default: '{}') |
| `activated_by_rule_id` | BIGINT | FK to `onboarding_rule_policies.id` (ON DELETE SET NULL) |
| `created_at` | TIMESTAMPTZ | Creation (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMPTZ | Update (NOT NULL, default: NOW()) |

**Constraint**: UNIQUE(rider_id, service_type_id).  
**Indexes**: rider_id, service_type_id, status, (rider_id, status), vehicle_id (partial).

### 5.6 Table: `onboarding_status_transitions`

State-machine audit log for rider onboarding stage/KYC/status changes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INT | FK to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `from_stage` | TEXT | Previous onboarding stage |
| `to_stage` | TEXT | New onboarding stage |
| `from_kyc` | TEXT | Previous KYC status |
| `to_kyc` | TEXT | New KYC status |
| `from_status` | TEXT | Previous rider status |
| `to_status` | TEXT | New rider status |
| `trigger_type` | TEXT | Trigger type (NOT NULL) |
| `trigger_ref_id` | BIGINT | Reference ID |
| `performed_by_system_user_id` | BIGINT | FK to `system_users.id` (ON DELETE SET NULL) |
| `created_at` | TIMESTAMPTZ | When transition occurred (NOT NULL, default: NOW()) |

**Indexes**: rider_id, created_at, (rider_id, created_at).

### 5.7 Table: `onboarding_rule_policies`

Configurable rule engine for onboarding (scope: global, city, service, vehicle_type).

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rule_code` | TEXT | Rule code (UNIQUE, NOT NULL) |
| `rule_name` | TEXT | Rule name (NOT NULL) |
| `scope` | onboarding_rule_scope | 'global', 'city', 'service', 'vehicle_type' (NOT NULL, default: 'global') |
| `scope_ref_id` | BIGINT | Scope reference (e.g. city_id, service_type_id) |
| `rule_type` | TEXT | Rule type (NOT NULL) |
| `rule_config` | JSONB | Rule configuration (NOT NULL, default: '{}') |
| `effective_from` | TIMESTAMPTZ | Effective from |
| `effective_to` | TIMESTAMPTZ | Effective to |
| `is_active` | BOOLEAN | Active (NOT NULL, default: true) |
| `priority` | INT | Priority (NOT NULL, default: 0) |
| `created_at` | TIMESTAMPTZ | Creation (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMPTZ | Update (NOT NULL, default: NOW()) |

**Indexes**: rule_code (UNIQUE), is_active, scope, (effective_from, effective_to) partial.

### 5.8 vehicle_service_mapping seed

0085 seeds which vehicle types can serve which services (e.g. cycle: food only; bike/ev_bike/auto/e_rickshaw: all; car/taxi/ev_car: person_ride only). Idempotent INSERTs.

---

## 6. Migration 0086 – Rider domain dummy data

**File**: `0086_rider_domain_dummy_data.sql`

**Purpose**: Realistic seed data for rider-related tables (withdrawal_requests, rider_penalties, etc.). Idempotent (uses ON CONFLICT / WHERE NOT EXISTS). Run after 0085 and rider/order migrations. No new schema; documentation reference only.

---

## 7. Enterprise Ticket System (Backend 0055–0056)

The **Enterprise Ticket System** is defined in the **backend** (migrations 0055, 0056). It is a separate, enterprise-grade ticket model that can coexist with or replace the unified ticket system used in the dashboard. Full schema and behavior are documented in the backend repo.

### 7.1 Backend documentation

- **`backend/docs/schema/ENTERPRISE_TICKET_SYSTEM.md`** – Full architecture, ER diagram, lifecycle, tables, indexes.
- **`backend/docs/schema/TICKET_SYSTEM_SUMMARY.md`** – Table count (11 tables) and high-level summary.

### 7.2 Summary of enterprise ticket tables (11)

| Category | Tables |
|----------|--------|
| Core | `tickets`, `ticket_groups`, `ticket_titles` |
| Participants & assignment | `ticket_participants`, `ticket_assignments` |
| Communication | `ticket_messages` |
| Tracking & history | `ticket_status_history`, `ticket_actions_audit` |
| Feedback & categorization | `ticket_ratings`, `ticket_tags`, `ticket_tag_map` |

### 7.3 Features (summary)

- One unified `tickets` table; dynamic title catalog (`ticket_titles`); polymorphic participants (customer, rider, rider_3pl, merchant, provider).
- Full assignment history; immutable audit log; post-resolution ratings; many-to-many tags.
- 3PL support: `is_3pl_order`, `tpl_provider_id`, `tpl_direction`, `external_order_id`; entity type `rider_3pl`; source role `provider`.
- Migration 0056: migrate unified tickets to enterprise model (see backend docs).

Dashboard tables documentation Part 1 continues to describe the **unified** ticket system (`unified_tickets`, `unified_ticket_messages`, etc.) used by the dashboard today. When the dashboard adopts the enterprise ticket system, this Part 2 section and the backend docs are the reference for the new schema.

---

## 8. Summary and migration quick reference

| Migration | Summary |
|-----------|---------|
| **0080** | `tickets.resolved_by` (FK system_users), index for “resolved by whom” audit. |
| **0081** | `wallet_credit_requests`: agent request → approver approve/reject; on approval, ledger + rider_wallet update. |
| **0082** | Rider schema redesign: reference tables (cities, service_types, vehicle_service_mapping, city_vehicle_rules), rider_addresses, rider_document_files, rider_payment_methods, riders soft delete/audit, rider_documents new columns, withdrawal_requests.payment_method_id. |
| **0083** | Rider schema full upgrade (idempotent): enums, reference tables, rider_addresses backfill, rider_documents/rider_document_files/rider_vehicles/rider_payment_methods, withdrawal_requests.payment_method_id, duty_logs.vehicle_id. |
| **0084** | `sync_rider_negative_wallet_blocks_from_wallet()`: no blocks when total_balance > 0; blocks only when total_balance ≤ 0; one-time repair for positive-balance riders with blocks. |
| **0085** | Rider onboarding redesign: vehicle_type (taxi, e_rickshaw, ev_car), rider_documents (fraud_flags, duplicate_document_id, requires_manual_review), rider_vehicles (ownership_type, limitation_flags, is_commercial), rider_service_activation, onboarding_status_transitions, onboarding_rule_policies, vehicle_service_mapping seed. |
| **0086** | Rider domain dummy data (idempotent seed). |
| **0055–0056** | Enterprise Ticket System (backend): 11 tables; see backend docs. |
| **0087** | Referral offers & fulfillments: `referral_offers`, `referral_offer_city_rules`, `referral_fulfillments`; extend `referrals`. |
| **0088** | `rider_penalties.service_type` optional (nullable). |
| **0089** | `rider_wallet`: add `negative_used_food`, `negative_used_parcel`, `negative_used_person_ride`; index for negative balance. |
| **0090** | Sync referrals from `riders.referred_by` into `referrals` (idempotent data migration). |
| **0091** | Fix rider blocking status logic (diagnostic + repair; no new tables). |
| **0092** | Area Manager system: `area_managers`, `activity_logs`; add `area_manager_id`/`locality_code`/`availability_status` to riders, merchant_stores, merchant_parents. |
| **0093** | Ticket groups enhancements: `ticket_groups.ticket_category`, `ticket_groups.source_role`; index. |

---

## 9. Remaining migrations (0087–0093)

These migrations are **not yet fully documented in Part 2** in the same detail as 0080–0086. Below is a concise reference of **tables and schema changes** that remain after 0086.

### 9.1 Migration 0087 – Referral offers and fulfillments

**File**: `0087_referral_offers_and_fulfillments.sql`

**Purpose**: Referral campaign/offer definitions with city-wise overrides and per-referral fulfillment tracking.

| Table | Purpose |
|-------|---------|
| `referral_offers` | Offer definitions: offer_code, name, offer_type (fixed_per_referral, per_order_bonus, tiered, custom), amount, amount_config, service_types[], min_orders_per_referred, max_referrals_per_referrer, terms, valid_from/to, city_ids[], is_active. FK: created_by → system_users. |
| `referral_offer_city_rules` | City-wise overrides for an offer: amount, min_orders_per_referred, max_referrals_per_referrer, terms. UNIQUE(offer_id, city_id). FK: offer_id → referral_offers, city_id → cities. |
| `referral_fulfillments` | One row per referral: referral_id, offer_id, referrer_rider_id, referred_rider_id, status (pending, fulfilled, credited, expired, cancelled), order counts per service, amount_credited, wallet_ledger_id, credited_at, fulfilled_at. UNIQUE(referral_id). |

**Enums**: `referral_offer_type`, `referral_fulfillment_status`.

**Changes to existing**: `referrals` — ADD COLUMN offer_id, referral_code_used, referred_city_id, referred_city_name (if not exist).

---

### 9.2 Migration 0088 – Penalty service type optional

**File**: `0088_penalty_service_type_optional.sql`

**Purpose**: Allow `rider_penalties.service_type` to be NULL so agents can record penalties without mandating a service; wallet allocation for unspecified penalties uses parcel.

| Table | Change |
|-------|--------|
| `rider_penalties` | ALTER COLUMN `service_type` DROP NOT NULL |

---

### 9.3 Migration 0089 – Rider wallet negative used (service-level)

**File**: `0089_rider_wallet_negative_used_service_level.sql`

**Purpose**: Service-level negative contribution for blocking (negative_used_* only counted after wallet goes negative; threshold -50 per service). See backend BLACKLIST_WHITELIST_REDESIGN.

| Table | Change |
|-------|--------|
| `rider_wallet` | ADD COLUMN `negative_used_food`, `negative_used_parcel`, `negative_used_person_ride` (NUMERIC, default 0). Index `rider_wallet_negative_balance_idx` on rider_id WHERE total_balance < 0. Optional backfill for existing negative-balance riders. |

---

### 9.4 Migration 0090 – Sync referrals from riders.referred_by

**File**: `0090_sync_referrals_from_riders_referred_by.sql`

**Purpose**: Idempotent data migration: insert into `referrals` for riders that have `referred_by` set but no matching referral row. ON CONFLICT (referred_id) DO NOTHING. No new tables.

---

### 9.5 Migration 0091 – Fix rider blocking status

**Files**: `0091_fix_rider_blocking_status.sql`, `0091_fix_rider_blocking_status_SAFE.sql`, `0091_test_before_migration.sql`

**Purpose**: Repair rider status update logic when blocking/unblocking services (diagnostic queries + conditional updates). No new tables or columns.

---

### 9.6 Migration 0092 – Area Manager system

**File**: `0092_area_manager_system.sql`

**Purpose**: Area Manager dashboard: link system users (AREA_MANAGER_MERCHANT / AREA_MANAGER_RIDER) to stores and riders; activity logging.

| Table | Purpose |
|-------|---------|
| `area_managers` | id, user_id (FK system_users, UNIQUE), manager_type (MERCHANT, RIDER), area_code, locality_code, city, status (ACTIVE, INACTIVE). One row per Area Manager. |
| `activity_logs` | id, actor_id (FK system_users), action, entity_type, entity_id, created_at. Audit log for AM actions. |

**Enums**: `area_manager_type`, `area_manager_status`, `rider_availability_status`.

**Changes to existing**:
- `merchant_stores`: ADD COLUMN `area_manager_id` (FK area_managers).
- `merchant_parents`: ADD COLUMN `area_manager_id`, `created_by_name`.
- `riders`: ADD COLUMN `area_manager_id`, `locality_code`, `availability_status` (ONLINE, BUSY, OFFLINE).

---

### 9.7 Migration 0093 – Ticket groups and titles enhancements

**File**: `0093_ticket_groups_titles_enhancements.sql`

**Purpose**: Super Admin Ticket Settings: add order-related vs non-order and source-of-ticket to groups; support multiple titles per group in UI/API.

| Table | Change |
|-------|--------|
| `ticket_groups` | ADD COLUMN `ticket_category` (ticket_category: order_related, non_order, other). ADD COLUMN `source_role` (ticket_source_role: customer, rider, merchant, system, etc.). Index `ticket_groups_category_source_idx` on (ticket_category, source_role). |

**Note**: `ticket_titles` already has `group_id`; 0093 does not create new tables. Dashboard API and UI create/update titles under groups using existing `ticket_titles` table.

---

**Document Version**: 1.1  
**Last Updated**: February 11, 2026  
**Maintained By**: Development Team

**Changelog**:
- **v1.0**: Initial Part 2: migrations 0080–0086 documented in full; Enterprise Ticket System (0055–0056) summarized.
- **v1.1**: Added Section 9 – remaining migrations 0087–0093 (tables and schema changes summary); updated header, TOC, and quick reference table.
