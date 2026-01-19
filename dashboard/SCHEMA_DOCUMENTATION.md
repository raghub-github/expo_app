# Database Schema Documentation

## Overview
This document provides comprehensive documentation of the database schema, including tables, enums, relationships, and design recommendations.

---

## Table of Contents
1. [Enums & Types](#enums--types)
2. [Core Entity Tables](#core-entity-tables)
3. [Order Management Tables](#order-management-tables)
4. [Provider & 3PL Integration Tables](#provider--3pl-integration-tables)
5. [Access Control & Permissions](#access-control--permissions)
6. [Audit & Logging Tables](#audit--logging-tables)
7. [Relationships & Foreign Keys](#relationships--foreign-keys)
8. [Improvements & Recommendations](#improvements--recommendations)

---

## Enums & Types

### Order-Related Enums
- **order_type**: `food`, `parcel`, `person_ride` (updated from previous: `food`, `parcel`, `ride`, `3pl`)
- **order_status_type**: Order lifecycle statuses
- **order_source_type**: `internal`, `external` (indicates if order originated from our app or external provider)
- **payment_status_type**: Payment processing statuses
- **payment_method**: Payment method types

### Provider-Related Enums
- **provider_type**: `internal`, `swiggy`, `zomato`, `rapido`, `uber`, `dunzo`, `other`
- **integration_status**: `active`, `inactive`, `suspended`, `testing`
- **webhook_event_status**: `pending`, `processing`, `processed`, `failed`, `ignored`

### Service & Delivery Enums
- **service_type**: Service categories
- **delivery_type**: `standard`, `express`, `scheduled`, etc.
- **delivery_initiator_type**: `customer`, `merchant`, `system`

### Access Control Enums
- **DashboardType**: `RIDER`, `MERCHANT`, `CUSTOMER`, `ORDER_FOOD`, `ORDER_PERSON_RIDE`, `ORDER_PARCEL`, `TICKET`, `OFFER`, `AREA_MANAGER`, `PAYMENT`, `SYSTEM`, `ANALYTICS`
- **access_level**: Permission levels

### User & Status Enums
- **system_user_status**: User account statuses
- **rider_status**: Rider account statuses
- **customer_status**: Customer account statuses
- **store_status**: Merchant store statuses
- **kyc_status**: KYC verification statuses

---

## Core Entity Tables

### Users & Authentication

#### `system_users`
- **Purpose**: System administrators and agents
- **Key Fields**: `system_user_id`, `email`, `full_name`, `primary_role`, `status`
- **Relationships**: 
  - Self-referential: `reports_to_id`, `created_by`, `approved_by`
  - Links to: `dashboard_access`, `action_audit_log`, `system_user_sessions`

#### `customers`
- **Purpose**: End customers placing orders
- **Key Fields**: `customer_id`, `primary_mobile`, `email`, `account_status`, `wallet_balance`
- **Relationships**: Links to `orders`, `customer_addresses`, `customer_payment_methods`

#### `riders`
- **Purpose**: Delivery partners/riders
- **Key Fields**: `mobile`, `name`, `status`, `onboarding_stage`, `kyc_status`
- **Relationships**: Links to `orders`, `rider_vehicles`, `wallet_ledger`

#### `merchant_parents`
- **Purpose**: Parent merchant entities
- **Key Fields**: `parent_merchant_id`, `parent_name`, `merchant_type`, `registration_status`
- **Relationships**: Links to `merchant_stores`, `merchant_users`

#### `merchant_stores`
- **Purpose**: Individual store locations
- **Key Fields**: `store_id`, `store_name`, `status`, `approval_status`, `operational_status`
- **Relationships**: Links to `orders`, `merchant_menu_items`, `merchant_store_orders`

---

## Order Management Tables

### Primary Order Table

#### `orders`
- **Purpose**: Central order table for all order types (food, parcel, person_ride)
- **Key Fields**:
  - Identity: `id`, `order_uuid`, `order_type`, `order_source`
  - Parties: `customer_id`, `merchant_id`, `rider_id`, `merchant_store_id`
  - Location: `pickup_address`, `drop_address`, `pickup_lat`, `pickup_lon`, `drop_lat`, `drop_lon`
  - Financial: `fare_amount`, `total_payable`, `total_paid`, `commission_amount`, `rider_earning`
  - Status: `status`, `current_status`, `payment_status`, `payment_method`
  - Provider: `provider_order_id`, `source`, `synced_with_provider`, `provider_status`
  - Timestamps: `created_at`, `updated_at`, `cancelled_at`, `actual_delivery_time`
- **Relationships**: 
  - Links to: `order_food_details`, `order_parcel_details`, `order_ride_details`
  - Links to: `order_payments`, `order_refunds`, `order_rider_assignments`
  - Links to: `provider_order_mapping`, `webhook_events`

### Order Type-Specific Details

#### `order_food_details`
- **Purpose**: Food order specific information
- **Key Fields**: `restaurant_id`, `preparation_time_minutes`, `food_items_count`, `food_items_total_value`
- **Relationships**: Links to `orders` (1:1)

#### `order_parcel_details`
- **Purpose**: Parcel delivery specific information
- **Key Fields**: `package_weight_kg`, `package_dimensions`, `is_cod`, `cod_amount`, `is_fragile`
- **Relationships**: Links to `orders` (1:1)

#### `order_ride_details`
- **Purpose**: Person ride specific information
- **Key Fields**: `passenger_name`, `passenger_count`, `ride_type`, `base_fare`, `distance_fare`, `surge_multiplier`
- **Relationships**: Links to `orders` (1:1)

### Order Items & Payments

#### `order_items`
- **Purpose**: Individual items in an order
- **Key Fields**: `item_name`, `quantity`, `unit_price`, `total_price`, `merchant_menu_item_id`
- **Relationships**: Links to `orders` (many:1), `merchant_menu_items`

#### `order_payments`
- **Purpose**: Payment transactions for orders
- **Key Fields**: `payment_mode`, `payment_amount`, `payment_status`, `transaction_id`, `pg_transaction_id`
- **Relationships**: Links to `orders` (many:1)

#### `order_refunds`
- **Purpose**: Refund records for orders
- **Key Fields**: `refund_type`, `refund_amount`, `refund_status`, `refund_reason`
- **Relationships**: Links to `orders` (many:1), `order_payments`

### Order Assignment & Tracking

#### `order_rider_assignments`
- **Purpose**: Rider assignments to orders
- **Key Fields**: `rider_id`, `assignment_status`, `assigned_at`, `accepted_at`, `delivered_at`, `rider_earning`
- **Relationships**: Links to `orders` (many:1), `riders`

#### `order_status_history`
- **Purpose**: Historical status changes
- **Key Fields**: `from_status`, `to_status`, `changed_by`, `reason`
- **Relationships**: Links to `orders` (many:1)

#### `order_timeline`
- **Purpose**: Complete order timeline events
- **Key Fields**: `status`, `actor_type`, `actor_id`, `location_lat`, `location_lon`
- **Relationships**: Links to `orders` (many:1)

---

## Provider & 3PL Integration Tables

### Current Provider Tables

#### `provider_configs`
- **Purpose**: Configuration for external providers
- **Key Fields**: `provider_type`, `provider_name`, `api_base_url`, `api_key`, `webhook_url`, `status`
- **Note**: Currently supports receiving orders FROM providers

#### `provider_order_mapping`
- **Purpose**: Maps internal orders to provider orders
- **Key Fields**: `order_id`, `provider_type`, `provider_order_id`, `provider_status`, `sync_status`
- **Note**: Currently one-way (inbound from providers)

#### `provider_order_status_sync`
- **Purpose**: Tracks status synchronization with providers
- **Key Fields**: `sync_direction`, `sync_type`, `internal_status`, `provider_status`, `success`
- **Note**: Supports bidirectional sync but needs enhancement for 3PL

### Missing 3PL Tables (To Be Created)

See [3PL Table Design](#3pl-table-design) section below.

---

## Access Control & Permissions

### Dashboard Access

#### `dashboard_access`
- **Purpose**: User access to dashboard types
- **Key Fields**: `system_user_id`, `dashboard_type`, `order_type`, `access_level`, `is_active`
- **Note**: `order_type` added for granular access (food, person_ride, parcel)

#### `dashboard_access_points`
- **Purpose**: Granular access points within dashboards
- **Key Fields**: `system_user_id`, `dashboard_type`, `order_type`, `access_point_group`, `allowed_actions`
- **Note**: `order_type` added for order-type-specific permissions

### Role-Based Access

#### `system_roles`
- **Purpose**: Role definitions
- **Key Fields**: `role_id`, `role_name`, `role_type`, `role_level`

#### `role_permissions`
- **Purpose**: Permissions assigned to roles
- **Key Fields**: `role_id`, `permission_id`, `service_scope`, `geo_scope`

#### `user_roles`
- **Purpose**: Roles assigned to users
- **Key Fields**: `system_user_id`, `role_id`, `is_primary`, `is_active`

---

## Audit & Logging Tables

#### `action_audit_log`
- **Purpose**: System-wide action audit trail
- **Key Fields**: `agent_id`, `dashboard_type`, `order_type`, `action_type`, `resource_type`, `resource_id`
- **Note**: `order_type` added for order-specific audit filtering

#### `order_audit_log`
- **Purpose**: Order-specific audit trail
- **Key Fields**: `order_id`, `action_type`, `action_field`, `old_value`, `new_value`, `actor_type`

#### `system_audit_logs`
- **Purpose**: System-level audit logs
- **Key Fields**: `system_user_id`, `module_name`, `action_type`, `entity_type`, `entity_id`

---

## Relationships & Foreign Keys

### Order Relationships
```
orders
├── order_food_details (1:1)
├── order_parcel_details (1:1)
├── order_ride_details (1:1)
├── order_items (1:many)
├── order_payments (1:many)
├── order_refunds (1:many)
├── order_rider_assignments (1:many)
├── order_status_history (1:many)
├── order_timeline (1:many)
├── customers (many:1)
├── merchant_stores (many:1)
├── riders (many:1)
└── provider_order_mapping (1:many)
```

### User Relationships
```
system_users
├── dashboard_access (1:many)
├── dashboard_access_points (1:many)
├── user_roles (1:many)
└── action_audit_log (1:many as agent)
```

### Provider Relationships
```
provider_configs
└── provider_order_mapping (1:many via provider_type)

orders
└── provider_order_mapping (1:many)
```

---

## Improvements & Recommendations

### 1. 3PL Integration Enhancement

**Current State**: Provider tables support receiving orders FROM external providers, but lack comprehensive support for:
- Sending orders TO 3PL providers (outbound)
- Bidirectional 3PL order management
- 3PL-specific workflows

**Recommendation**: Create dedicated 3PL tables (see [3PL Table Design](#3pl-table-design))

### 2. Order Type Enum Update

**Current State**: `order_type` enum was recently updated to remove `3pl` and rename `ride` to `person_ride`

**Recommendation**: 
- Keep `order_type` as `food`, `parcel`, `person_ride` for order categorization
- Use `order_source` and `provider_type` to distinguish 3PL orders
- 3PL orders can be any of the three types but with `source = 'external'` and specific `provider_type`

### 3. Redundant Fields in Orders Table

**Issues**:
- Multiple provider-specific fields (`swiggy_order_id`, `zomato_order_id`, `rapido_booking_id`) should be in `provider_order_mapping`
- `provider_order_id` and `provider_reference` duplicate functionality

**Recommendation**:
- Remove provider-specific columns from `orders` table
- Use `provider_order_mapping` for all provider relationships
- Keep only generic `external_ref` in `orders` if needed

### 4. Missing Indexes

**Recommendations**:
- Add composite indexes on frequently queried combinations:
  - `(order_type, status, created_at)` on `orders`
  - `(dashboard_type, order_type, system_user_id)` on `dashboard_access`
  - `(provider_type, sync_status, created_at)` on `provider_order_mapping`

### 5. Table Consolidation Opportunities

**Potential Merges**:
- `order_conflicts` and `provider_order_conflicts` could be unified
- `order_sync_logs` and `provider_order_status_sync` have overlapping purposes

### 6. Data Archival Strategy

**Recommendation**: 
- Implement partitioning for high-volume tables:
  - `orders` by `created_at` (monthly partitions)
  - `action_audit_log` by `created_at`
  - `order_status_history` by `created_at`

### 7. Missing Constraints

**Recommendations**:
- Add check constraints for:
  - `orders.total_paid <= orders.total_payable`
  - `order_refunds.refund_amount <= order_payments.payment_amount`
  - Date validations (e.g., `actual_delivery_time >= actual_pickup_time`)

---

## 3PL Table Design

### New Tables Required for 3PL Integration

#### 1. `tpl_providers`
**Purpose**: 3PL provider registry
```sql
CREATE TABLE tpl_providers (
  id BIGSERIAL PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL, -- 'food', 'parcel', 'person_ride', 'multi'
  integration_type TEXT NOT NULL, -- 'inbound', 'outbound', 'bidirectional'
  api_base_url TEXT,
  api_key TEXT,
  api_secret TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  supported_order_types TEXT[], -- Array of supported types
  commission_rate NUMERIC,
  service_areas JSONB, -- Geographic coverage
  capabilities JSONB, -- What they can handle
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

#### 2. `tpl_order_requests`
**Purpose**: Outbound orders sent to 3PL providers
```sql
CREATE TABLE tpl_order_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  internal_order_id BIGINT NOT NULL REFERENCES orders(id),
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  order_type TEXT NOT NULL, -- 'food', 'parcel', 'person_ride'
  request_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'accepted', 'rejected', 'cancelled'
  request_payload JSONB NOT NULL, -- Full order data sent to 3PL
  tpl_order_id TEXT, -- 3PL's order ID (if accepted)
  tpl_reference TEXT, -- 3PL's reference number
  rejection_reason TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  response_payload JSONB, -- 3PL's response
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

#### 3. `tpl_order_status_updates`
**Purpose**: Status updates from 3PL providers (outbound orders)
```sql
CREATE TABLE tpl_order_status_updates (
  id BIGSERIAL PRIMARY KEY,
  tpl_order_request_id BIGINT NOT NULL REFERENCES tpl_order_requests(id),
  internal_order_id BIGINT NOT NULL REFERENCES orders(id),
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  update_type TEXT NOT NULL, -- 'status_change', 'rider_assigned', 'delivered', 'cancelled'
  tpl_status TEXT NOT NULL, -- Status from 3PL
  internal_status TEXT, -- Mapped internal status
  update_payload JSONB NOT NULL, -- Full update from 3PL
  rider_info JSONB, -- 3PL rider details if assigned
  location_info JSONB, -- Location updates
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

#### 4. `tpl_inbound_orders`
**Purpose**: Inbound orders received from 3PL providers
```sql
CREATE TABLE tpl_inbound_orders (
  id BIGSERIAL PRIMARY KEY,
  tpl_order_id TEXT NOT NULL, -- 3PL's order ID
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  internal_order_id BIGINT REFERENCES orders(id), -- Created internal order
  order_type TEXT NOT NULL, -- 'food', 'parcel', 'person_ride'
  order_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'processing', 'completed', 'cancelled'
  order_payload JSONB NOT NULL, -- Full order data from 3PL
  acceptance_status TEXT, -- 'pending', 'accepted', 'rejected'
  rejection_reason TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  assigned_rider_id INTEGER REFERENCES riders(id),
  tpl_rider_id TEXT, -- 3PL's rider ID
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'failed'
  sync_error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tpl_provider_id, tpl_order_id)
);
```

#### 5. `tpl_order_sync_log`
**Purpose**: Comprehensive sync log for all 3PL operations
```sql
CREATE TABLE tpl_order_sync_log (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id),
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  sync_direction TEXT NOT NULL, -- 'outbound', 'inbound'
  sync_type TEXT NOT NULL, -- 'order_create', 'status_update', 'rider_assignment', 'cancellation'
  sync_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed', 'retrying'
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  http_status_code INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

#### 6. `tpl_provider_capabilities`
**Purpose**: Define what each 3PL provider can handle
```sql
CREATE TABLE tpl_provider_capabilities (
  id BIGSERIAL PRIMARY KEY,
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  order_type TEXT NOT NULL, -- 'food', 'parcel', 'person_ride'
  supported_features TEXT[], -- 'cod', 'scheduled', 'signature_required', etc.
  max_weight_kg NUMERIC, -- For parcels
  max_distance_km NUMERIC,
  service_areas JSONB, -- Geographic areas
  operating_hours JSONB, -- Time windows
  pricing_model TEXT, -- 'fixed', 'distance_based', 'time_based'
  commission_structure JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tpl_provider_id, order_type)
);
```

### Indexes for 3PL Tables
```sql
-- Performance indexes
CREATE INDEX idx_tpl_order_requests_internal_order ON tpl_order_requests(internal_order_id);
CREATE INDEX idx_tpl_order_requests_provider_status ON tpl_order_requests(tpl_provider_id, request_status);
CREATE INDEX idx_tpl_inbound_orders_provider_order ON tpl_inbound_orders(tpl_provider_id, tpl_order_id);
CREATE INDEX idx_tpl_inbound_orders_status ON tpl_inbound_orders(order_status);
CREATE INDEX idx_tpl_order_sync_log_order_provider ON tpl_order_sync_log(order_id, tpl_provider_id);
CREATE INDEX idx_tpl_order_sync_log_status ON tpl_order_sync_log(sync_status, created_at);
```

### Integration with Existing Tables

1. **Link to `orders` table**:
   - Add `tpl_provider_id` to `orders` (nullable, for outbound 3PL orders)
   - Add `tpl_order_request_id` to `orders` (nullable, for tracking outbound requests)
   - Add `tpl_inbound_order_id` to `orders` (nullable, for inbound 3PL orders)

2. **Extend `provider_order_mapping`**:
   - Add `is_tpl` boolean flag
   - Add `sync_direction` field
   - Or create separate mapping table for 3PL

3. **Update `webhook_events`**:
   - Add `tpl_provider_id` field
   - Add `tpl_order_request_id` for outbound webhooks

---

## Migration Strategy

### Phase 1: Create 3PL Tables
1. Create `tpl_providers` table
2. Create `tpl_provider_capabilities` table
3. Create `tpl_order_requests` table
4. Create `tpl_inbound_orders` table
5. Create `tpl_order_status_updates` table
6. Create `tpl_order_sync_log` table

### Phase 2: Update Existing Tables
1. Add 3PL-related columns to `orders` table
2. Extend `provider_configs` or create separate 3PL config
3. Update `webhook_events` for 3PL support

### Phase 3: Data Migration
1. Migrate existing provider relationships to 3PL structure
2. Update existing orders with 3PL flags if applicable

### Phase 4: Cleanup
1. Remove redundant provider-specific columns from `orders`
2. Consolidate provider mapping tables

---

## Summary

This schema supports a comprehensive order management system with:
- **Three order types**: food, parcel, person_ride
- **Bidirectional 3PL integration**: Send orders to 3PL and receive orders from 3PL
- **Granular access control**: Order-type-specific permissions
- **Comprehensive audit trails**: All actions logged with order type context
- **Provider flexibility**: Support for multiple external providers

The recommended 3PL tables provide:
- Clear separation between inbound and outbound 3PL orders
- Complete tracking of 3PL order lifecycle
- Robust error handling and retry mechanisms
- Flexible provider capability management
