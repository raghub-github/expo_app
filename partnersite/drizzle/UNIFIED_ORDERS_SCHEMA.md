# Unified Orders System – Complete Schema Documentation

The Unified Orders Domain is the core of the platform. It manages a single **orders** table (Food, Parcel, Ride, 3PL), service-specific details, items, immutable timeline, multi-rider assignments, rider-specific OTPs, payments, refunds, support, providers, and tracking.

**Source files:** `drizzle/unified_orders_*.sql` (see [Source Files](#source-files)).

---

## Table of Contents

1. [Overview & Design Principles](#1-overview--design-principles)
2. [Enums Reference](#2-enums-reference)
3. [Tables Reference](#3-tables-reference)
4. [Core Relationships](#4-core-relationships)
5. [Indexes Summary](#5-indexes-summary)
6. [Functions & Triggers](#6-functions--triggers)
7. [Source Files](#7-source-files)
8. [Migration](#8-migration)

---

## 1. Overview & Design Principles

- **Single Source of Truth:** `orders` table is the master for all order types.
- **Immutable History:** `order_timeline` and audit logs never update, only insert.
- **Multi-Rider Support:** Multiple riders per order; history in `order_rider_assignments`; `current_rider_id` on orders is denormalized.
- **Multi-Payment Support:** Multiple payment attempts in `order_payments`.
- **Never Delete:** Orders are only marked cancelled, not deleted.
- **Status Sync:** `current_status` on orders is synced from `order_timeline` via trigger.
- **Provider Agnostic:** Internal app, Swiggy, Zomato, Rapido, ONDC, Shiprocket.
- **Rider-Specific OTPs:** Each rider assignment has its own pickup and delivery OTPs in `order_otps`.

**Total tables:** 50+ (orders, service details, items, rider assignments, OTPs, timeline, payments, refunds, tickets, disputes, remarks, notifications, ratings, cancellation, provider mapping, tracking, etc.).

---

## 2. Enums Reference

### order_type (unified_orders_core)

| Value   |
|--------|
| food   |
| parcel |
| ride   |
| 3pl    |

### order_status_type (unified_orders_core, timeline, providers)

| Value        |
|-------------|
| assigned    |
| accepted    |
| reached_store |
| picked_up   |
| in_transit  |
| delivered   |
| cancelled   |
| failed      |

### order_source_type (unified_orders_core, providers)

| Value     |
|----------|
| internal |
| swiggy   |
| zomato   |
| rapido   |
| ondc     |
| shiprocket |
| other    |

### order_category_type (unified_orders_core)

| Value   |
|--------|
| food   |
| parcel |
| ride   |
| 3pl    |

### payment_status_type (unified_orders_core, payments)

| Value             |
|------------------|
| pending          |
| processing       |
| completed        |
| failed           |
| refunded         |
| partially_refunded |
| cancelled        |

### payment_mode_type (unified_orders_core, payments)

| Value      |
|-----------|
| cash      |
| online    |
| wallet    |
| upi       |
| card      |
| netbanking |
| cod       |
| other     |

### delivery_type (unified_orders_core)

| Value     |
|----------|
| standard |
| express  |
| scheduled |
| same_day |
| next_day |

### delivery_initiator_type (unified_orders_core)

| Value   |
|--------|
| customer |
| merchant |
| system  |
| agent   |

### locality_type (unified_orders_core)

| Value     |
|----------|
| urban    |
| semi_urban |
| rural    |
| highway  |

### veg_non_veg_type (unified_orders_core, service_details)

| Value   |
|--------|
| veg    |
| non_veg |
| mixed  |
| na     |

### rider_assignment_status (unified_orders_rider_assignments)

| Value     |
|----------|
| pending  |
| assigned |
| accepted |
| rejected |
| cancelled |
| completed |
| failed   |

### otp_type (unified_orders_otps)

| Value   |
|--------|
| pickup  |
| delivery |

### otp_status (unified_orders_otps)

| Value    |
|---------|
| pending |
| verified |
| expired |
| failed  |
| cancelled |
| bypassed |

### otp_verification_method (unified_orders_otps)

| Value         |
|--------------|
| manual_entry |
| auto_verify  |
| admin_override |
| system_bypass |

### refund_type (unified_orders_payments)

| Value        |
|-------------|
| full        |
| partial     |
| item        |
| delivery_fee |
| tip         |
| penalty     |

### ticket_source_type (unified_orders_support)

| Value   |
|--------|
| customer |
| rider   |
| merchant |
| system  |
| agent   |

### ticket_priority_type (unified_orders_support)

| Value    |
|---------|
| low     |
| medium  |
| high    |
| urgent  |
| critical |

### ticket_status (unified_orders_support)

| Value      |
|-----------|
| open      |
| in_progress |
| resolved  |
| closed    |

### notification_channel_type (unified_orders_support)

| Value   |
|--------|
| push    |
| sms     |
| email   |
| in_app  |
| whatsapp |
| call    |

---

## 3. Tables Reference

### 3.1 orders (unified_orders_core)

Master table for all order types (Food, Parcel, Ride, 3PL). Single source of truth.

| Column | Type | Nullable | Default / Notes |
|--------|------|----------|------------------|
| id | BIGSERIAL | NO | PRIMARY KEY (starts at 1000000) |
| order_uuid | UUID | YES | UNIQUE, gen_random_uuid() |
| formatted_order_id | TEXT | YES | UNIQUE (e.g. ORD-2024-001234) |
| external_ref | TEXT | YES | |
| order_type | order_type | NO | food, parcel, ride, 3pl |
| order_category | order_category_type | YES | |
| order_source | order_source_type | NO | DEFAULT 'internal' |
| customer_id | BIGINT | YES | FK → customers(id) |
| merchant_store_id | BIGINT | YES | FK → merchant_stores(id) |
| merchant_parent_id | BIGINT | YES | FK → merchant_parents(id) |
| current_rider_id | INTEGER | YES | FK → riders(id), denormalized |
| pickup_address_raw | TEXT | NO | |
| pickup_address_normalized | TEXT | YES | |
| pickup_address_geocoded | TEXT | YES | |
| pickup_lat | NUMERIC(10,7) | NO | CHECK -90..90 |
| pickup_lon | NUMERIC(10,7) | NO | CHECK -180..180 |
| pickup_address_deviation_meters | NUMERIC(6,2) | YES | |
| drop_address_raw | TEXT | NO | |
| drop_address_normalized | TEXT | YES | |
| drop_address_geocoded | TEXT | YES | |
| drop_lat | NUMERIC(10,7) | NO | CHECK |
| drop_lon | NUMERIC(10,7) | NO | CHECK |
| drop_address_deviation_meters | NUMERIC(6,2) | YES | |
| distance_km | NUMERIC(8,2) | YES | |
| distance_mismatch_flagged | BOOLEAN | NO | DEFAULT FALSE |
| eta_seconds | INTEGER | YES | |
| fare_amount | NUMERIC(12,2) | YES | |
| commission_amount | NUMERIC(12,2) | YES | |
| rider_earning | NUMERIC(12,2) | YES | |
| total_item_value | NUMERIC(12,2) | YES | |
| total_tax | NUMERIC(12,2) | YES | |
| total_discount | NUMERIC(12,2) | YES | |
| total_delivery_fee | NUMERIC(12,2) | YES | |
| total_ctm | NUMERIC(12,2) | YES | |
| total_payable | NUMERIC(12,2) | YES | |
| total_paid | NUMERIC(12,2) | YES | |
| total_refunded | NUMERIC(12,2) | YES | |
| has_tip | BOOLEAN | YES | |
| tip_amount | NUMERIC(12,2) | YES | |
| status | order_status_type | YES | Current status (legacy/sync) |
| current_status | order_status_type | YES | Synced from timeline |
| payment_status | payment_status_type | YES | |
| payment_method | payment_mode_type | YES | |
| created_at | TIMESTAMPTZ | NO | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NO | DEFAULT NOW() |
| estimated_pickup_time | TIMESTAMPTZ | YES | |
| estimated_delivery_time | TIMESTAMPTZ | YES | |
| actual_pickup_time | TIMESTAMPTZ | YES | |
| actual_delivery_time | TIMESTAMPTZ | YES | |
| cancelled_at | TIMESTAMPTZ | YES | |
| cancellation_reason | TEXT | YES | |
| cancellation_reason_id | BIGINT | YES | FK → order_cancellation_reasons(id) |
| cancelled_by | TEXT | YES | |
| cancelled_by_id | BIGINT | YES | |
| cancelled_by_type | TEXT | YES | |
| cancellation_details | JSONB | YES | |
| merchant_id | BIGINT | YES | Snapshot |
| merchant_name | TEXT | YES | |
| merchant_store_name | TEXT | YES | |
| customer_name | TEXT | YES | |
| customer_mobile | TEXT | YES | |
| customer_email | TEXT | YES | |
| customer_address_id | BIGINT | YES | FK → customer_addresses(id) |
| delivery_type | delivery_type | YES | |
| delivery_initiator | delivery_initiator_type | YES | |
| locality_type | locality_type | YES | |
| is_self_order | BOOLEAN | YES | |
| order_for_name | TEXT | YES | |
| order_for_mobile | TEXT | YES | |
| order_for_relation | TEXT | YES | |
| contact_less_delivery | BOOLEAN | YES | |
| is_bulk_order | BOOLEAN | YES | |
| provider_order_id | TEXT | YES | |
| external_order_id | TEXT | YES | |
| order_source (provider) | TEXT | YES | |
| synced_with_provider | BOOLEAN | YES | |
| sync_status | TEXT | YES | |
| risk_flagged | BOOLEAN | YES | |
| risk_reason | TEXT | YES | |
| order_metadata | JSONB | YES | |
| pickup_address | TEXT | YES | Legacy (denormalized) |
| drop_address | TEXT | YES | Legacy (denormalized) |

*(Plus many more snapshot, provider-specific, and 3PL columns – see unified_orders_core.sql.)*

---

### 3.2 order_food_details (unified_orders_service_details)

One row per food order (order_type = 'food').

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id), UNIQUE |
| restaurant_id | BIGINT | YES | |
| restaurant_name | TEXT | YES | |
| preparation_time_minutes | INTEGER | YES | |
| food_items_count | INTEGER | YES | |
| food_items_total_value | NUMERIC | YES | |
| requires_utensils | BOOLEAN | YES | |
| veg_non_veg | veg_non_veg_type | YES | |
| food_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

---

### 3.3 order_parcel_details (unified_orders_service_details)

One row per parcel order (order_type = 'parcel').

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id), UNIQUE |
| package_weight_kg | NUMERIC | YES | |
| package_length_cm | NUMERIC | YES | |
| package_width_cm | NUMERIC | YES | |
| package_height_cm | NUMERIC | YES | |
| package_value | NUMERIC | YES | |
| package_description | TEXT | YES | |
| is_fragile | BOOLEAN | YES | |
| is_cod | BOOLEAN | YES | |
| cod_amount | NUMERIC | YES | |
| requires_signature | BOOLEAN | YES | |
| requires_otp_verification | BOOLEAN | YES | |
| insurance_required | BOOLEAN | YES | |
| parcel_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

---

### 3.4 order_ride_details (unified_orders_service_details)

One row per ride order (order_type = 'ride').

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id), UNIQUE |
| passenger_name | TEXT | YES | |
| passenger_phone | TEXT | YES | |
| passenger_count | INTEGER | YES | |
| ride_type | TEXT | YES | shared, private, premium, etc. |
| vehicle_type_required | TEXT | YES | bike, car, auto, etc. |
| base_fare | NUMERIC | YES | |
| distance_fare | NUMERIC | YES | |
| time_fare | NUMERIC | YES | |
| surge_multiplier | NUMERIC | YES | |
| total_fare | NUMERIC | YES | |
| scheduled_ride | BOOLEAN | YES | |
| scheduled_pickup_time | TIMESTAMPTZ | YES | |
| ride_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

---

### 3.5 order_items (unified_orders_items)

Line items for an order (food items, parcel, etc.).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id) |
| item_id | BIGINT | YES | |
| merchant_menu_id | BIGINT | YES | |
| item_name | TEXT | YES | |
| item_title | TEXT | YES | |
| item_type | TEXT | YES | food_item, parcel, etc. |
| unit_price | NUMERIC | YES | |
| quantity | INTEGER | YES | |
| total_price | NUMERIC | YES | |
| final_item_price | NUMERIC | YES | |
| discount_amount | NUMERIC | YES | |
| is_veg | BOOLEAN | YES | |
| customizations | TEXT | YES | |
| item_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |

---

### 3.6 order_rider_assignments (unified_orders_rider_assignments)

All rider assignments per order; history preserved. Only one active (pending/assigned/accepted) per order.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id) ON DELETE CASCADE |
| rider_id | INTEGER | NO | FK → riders(id) |
| rider_name | TEXT | YES | Snapshot |
| rider_mobile | TEXT | YES | Snapshot |
| rider_vehicle_type | TEXT | YES | |
| rider_vehicle_number | TEXT | YES | |
| delivery_provider | TEXT | YES | internal, swiggy, zomato, etc. |
| provider_rider_id | TEXT | YES | |
| provider_assignment_id | TEXT | YES | |
| provider_assignment_status | TEXT | YES | |
| assignment_status | rider_assignment_status | NO | DEFAULT 'pending' |
| assignment_method | TEXT | YES | auto, manual, broadcast, rider_request |
| assignment_score | NUMERIC(5,2) | YES | |
| distance_to_pickup_km | NUMERIC(6,2) | YES | |
| estimated_arrival_minutes | INTEGER | YES | |
| assigned_at | TIMESTAMPTZ | YES | |
| accepted_at | TIMESTAMPTZ | YES | |
| rejected_at | TIMESTAMPTZ | YES | |
| reached_merchant_at | TIMESTAMPTZ | YES | |
| picked_up_at | TIMESTAMPTZ | YES | |
| delivered_at | TIMESTAMPTZ | YES | |
| cancelled_at | TIMESTAMPTZ | YES | |
| cancellation_reason | TEXT | YES | |
| cancelled_by | TEXT | YES | |
| cancelled_by_id | BIGINT | YES | |
| distance_to_merchant_km | NUMERIC(6,2) | YES | |
| distance_to_customer_km | NUMERIC(6,2) | YES | |
| total_distance_km | NUMERIC(6,2) | YES | |
| rider_earning | NUMERIC(10,2) | YES | |
| commission_amount | NUMERIC(10,2) | YES | |
| tip_amount | NUMERIC(10,2) | YES | DEFAULT 0 |
| synced_to_provider | BOOLEAN | YES | DEFAULT FALSE |
| provider_response | JSONB | YES | |
| assignment_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**Unique partial index:** One row per order where assignment_status IN ('pending','assigned','accepted').

---

### 3.7 order_otps (unified_orders_otps)

Rider-specific OTPs: one pickup and one delivery OTP per rider assignment.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id) |
| rider_assignment_id | BIGINT | NO | FK → order_rider_assignments(id) |
| otp_type | otp_type | NO | pickup, delivery |
| otp_code | TEXT | NO | |
| otp_status | otp_status | NO | DEFAULT 'pending' |
| expires_at | TIMESTAMPTZ | NO | |
| attempt_count | INTEGER | YES | DEFAULT 0 |
| max_attempts | INTEGER | YES | DEFAULT 3 |
| locked_until | TIMESTAMPTZ | YES | |
| verified_at | TIMESTAMPTZ | YES | |
| verified_by | TEXT | YES | |
| verified_by_id | BIGINT | YES | |
| verification_method | otp_verification_method | YES | |
| bypassed | BOOLEAN | YES | DEFAULT FALSE |
| bypass_reason | TEXT | YES | |
| cancelled | BOOLEAN | YES | DEFAULT FALSE |
| otp_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**Unique partial index:** One pending OTP per (rider_assignment_id, otp_type).

---

### 3.8 order_timeline (unified_orders_timeline)

Immutable status history. Never update or delete.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id) ON DELETE CASCADE |
| status | order_status_type | NO | |
| previous_status | order_status_type | YES | |
| actor_type | TEXT | NO | customer, rider, merchant, system, agent |
| actor_id | BIGINT | YES | |
| actor_name | TEXT | YES | |
| location_lat | DOUBLE PRECISION | YES | |
| location_lon | DOUBLE PRECISION | YES | |
| location_address | TEXT | YES | |
| status_message | TEXT | YES | |
| status_metadata | JSONB | YES | |
| synced_to_provider | BOOLEAN | YES | |
| provider_status | TEXT | YES | |
| provider_event_id | TEXT | YES | |
| provider_sync_error | TEXT | YES | |
| occurred_at | TIMESTAMPTZ | NO | |

---

### 3.9 order_payments (unified_orders_payments)

Multiple payment attempts per order.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id) ON DELETE CASCADE |
| payment_attempt_no | INTEGER | NO | DEFAULT 1, CHECK > 0 |
| payment_source | TEXT | YES | |
| payment_mode | payment_mode_type | NO | |
| transaction_id | TEXT | YES | UNIQUE |
| pg_transaction_id | TEXT | YES | |
| pg_name | TEXT | YES | razorpay, stripe, etc. |
| pg_order_id | TEXT | YES | |
| pg_payment_id | TEXT | YES | |
| payment_status | payment_status_type | NO | DEFAULT 'pending' |
| payment_amount | NUMERIC(12,2) | NO | CHECK > 0 |
| payment_fee | NUMERIC(10,2) | YES | |
| net_amount | NUMERIC(12,2) | YES | |
| is_refunded | BOOLEAN | YES | |
| refunded_amount | NUMERIC(12,2) | YES | |
| pg_response | JSONB | YES | |
| payment_metadata | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

---

### 3.10 order_refunds (unified_orders_payments)

Refunds against order payments.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | BIGSERIAL | NO | PRIMARY KEY |
| order_id | BIGINT | NO | FK → orders(id) |
| order_payment_id | BIGINT | YES | FK → order_payments(id) |
| refund_type | refund_type | YES | full, partial, item, etc. |
| refund_reason | TEXT | YES | |
| refund_id | TEXT | YES | UNIQUE |
| refund_amount | NUMERIC(12,2) | YES | |
| refund_status | TEXT | YES | |
| refund_initiated_by | TEXT | YES | |
| created_at | TIMESTAMPTZ | NO | |
| processed_at | TIMESTAMPTZ | YES | |
| completed_at | TIMESTAMPTZ | YES | |

---

### 3.11 Other Tables (summary)

| Table | Purpose |
|-------|---------|
| order_item_addons | Addons per order item (extra, remove, substitute) |
| order_rider_distances | Distance tracking per rider assignment |
| order_rider_actions | Accept/reject actions by riders |
| order_otp_audit | Immutable OTP action log (generate, validate, expire, bypass) |
| order_audit_log | Full order change audit (all fields) |
| order_status_history | Legacy status history (optional) |
| order_tickets | Support tickets for orders |
| order_disputes | Disputes linked to orders/tickets |
| order_remarks | Remarks/notes on orders |
| order_instructions | Instructions for merchant/rider/customer |
| order_notifications | Notification log (push, sms, email, etc.) |
| order_ratings | Ratings for orders/riders |
| order_cancellation_reasons | Cancellation reason and refund/penalty details |
| order_delivery_images | Delivery proof images |
| order_providers | Provider master (swiggy, zomato, etc.) |
| order_provider_mapping | order_id ↔ provider_order_id mapping |
| order_conflicts | Conflicts with provider (status/fare mismatch) |
| order_sync_logs | Sync attempts with providers |
| order_route_snapshots | Route snapshots (distance, polyline) |
| parcel_tracking_events | Parcel tracking events |
| cod_collections | COD collection tracking |

*(Full column definitions for these tables are in `drizzle/unified_orders_*.sql` and in `DATABASE_SCHEMA_UNIFIED_ORDERS.md`.)*

---

## 4. Core Relationships

```
orders (1) ──→ (many) order_items
order_items (1) ──→ (many) order_item_addons
orders (1) ──→ (1) order_food_details   [when order_type = 'food']
orders (1) ──→ (1) order_parcel_details [when order_type = 'parcel']
orders (1) ──→ (1) order_ride_details  [when order_type = 'ride']
orders (1) ──→ (many) order_rider_assignments
order_rider_assignments (1) ──→ (many) order_otps (pickup + delivery per rider)
order_otps (1) ──→ (many) order_otp_audit
order_rider_assignments (1) ──→ (many) order_rider_distances
orders (1) ──→ (many) order_rider_actions
orders (1) ──→ (many) order_timeline
orders (1) ──→ (many) order_audit_log
orders (1) ──→ (many) order_payments
order_payments (1) ──→ (many) order_refunds
orders (1) ──→ (many) order_tickets
order_tickets (1) ──→ (many) order_disputes
orders (1) ──→ (many) order_remarks, order_instructions, order_notifications
orders (1) ──→ (many) order_ratings, order_cancellation_reasons, order_delivery_images
orders (1) ──→ (many) order_provider_mapping ──→ order_providers
orders (1) ──→ (many) order_conflicts, order_sync_logs
orders (1) ──→ (many) order_route_snapshots, parcel_tracking_events, cod_collections
```

---

## 5. Indexes Summary

Indexes are defined in the respective `unified_orders_*.sql` files and in `unified_orders_indexes.sql`. Main patterns:

- **orders:** order_uuid, formatted_order_id, customer_id, merchant_store_id, current_rider_id, status/current_status, created_at, order_type, provider/external IDs.
- **order_rider_assignments:** order_id, rider_id, assignment_status, (order_id, assignment_status) partial for active.
- **order_otps:** order_id, rider_assignment_id, (rider_assignment_id, otp_type, otp_status), expires_at partial for pending.
- **order_timeline:** order_id, (order_id, occurred_at), occurred_at.
- **order_payments:** order_id, transaction_id, payment_status.
- **order_refunds:** order_id, order_payment_id, refund_id.

See `unified_orders_indexes.sql` and each module SQL file for the full list.

---

## 6. Functions & Triggers

- **Timeline sync:** When `order_timeline` is inserted, a trigger updates `orders.current_status` from the new row.
- **orders.updated_at:** Trigger sets `updated_at = NOW()` on UPDATE.
- **order_rider_assignments:** Triggers to update `orders.updated_at` and `orders.current_rider_id` when assignment is inserted/updated (e.g. accepted).
- **order_otps:** Expiry job/trigger to set otp_status = 'expired' for pending OTPs past expires_at; `order_otp_audit` populated on OTP changes.
- **verify_otp:** Function in `unified_orders_otps.sql` to verify OTP and write audit.

Exact function names and signatures are in the corresponding `unified_orders_*.sql` and `unified_orders_functions.sql` files.

---

## 7. Source Files

| File | Contents |
|------|----------|
| unified_orders_core.sql | orders table, core enums |
| unified_orders_service_details.sql | order_food_details, order_parcel_details, order_ride_details, veg_non_veg_type |
| unified_orders_items.sql | order_items, order_item_addons |
| unified_orders_rider_assignments.sql | order_rider_assignments, order_rider_distances, order_rider_actions, rider_assignment_status |
| unified_orders_otps.sql | order_otps, order_otp_audit, otp_type, otp_status, otp_verification_method, verify_otp |
| unified_orders_timeline.sql | order_timeline, order_audit_log, order_status_history |
| unified_orders_payments.sql | order_payments, order_refunds, payment_status_type, payment_mode_type, refund_type |
| unified_orders_support.sql | order_tickets, order_disputes, order_remarks, order_instructions, order_notifications, ticket/notification enums |
| unified_orders_cancellation.sql | order_cancellation_reasons, order_delivery_images |
| unified_orders_providers.sql | order_providers, order_provider_mapping, order_source_type, order_status_type |
| unified_orders_tracking.sql | order_route_snapshots, parcel_tracking_events, cod_collections |
| unified_orders_functions.sql | Shared functions and triggers |
| unified_orders_indexes.sql | Additional cross-table indexes |

---

## 8. Migration

**Script:** `drizzle/migrate_to_unified_orders.sql`

**Steps (summary):**

1. Backup existing orders / orders_core if needed.
2. Ensure unified `orders` table and columns exist (STEP 2.5: add missing columns).
3. Migrate from `orders` into unified `orders` (STEP 3).
4. Migrate from `orders_core` into unified `orders` (STEP 4).
5. Migrate service-specific data (food, parcel, ride) (STEP 6).
6. Migrate OTPs from order_food_otps and legacy order_otps to unified order_otps (STEP 7).
7. Migrate OTP audit from order_food_otp_audit to order_otp_audit (STEP 7).
8. Verify data integrity (STEP 8).

**Related docs:** `DATABASE_SCHEMA_UNIFIED_ORDERS.md` (narrative and usage examples).

---

**Last Updated:** 2025-02-18
