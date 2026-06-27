# Orders Domain - Part 1: Core Orders Table

## 📦 **ORDERS DOMAIN OVERVIEW**

The Orders Domain is the **core of the entire platform**. It manages:
- Unified orders table (supports Food, Parcel, Ride, 3PL)
- Service-specific order details
- Order items, addons, instructions
- Immutable order timeline
- Multi-rider assignment support
- Order payments and refunds
- Order ratings, remarks, notifications
- Order disputes and conflicts

**Total Tables**: 50+ tables

---

## 🎯 **CORE ORDERS TABLE**

### 1. **`orders`** - Master Orders Table (Single Source of Truth)
**Purpose**: The central table for ALL order types (Food, Parcel, Ride, 3PL). This is the **single source of truth** for orders.

**Key Attributes**:

#### **Order Identity**
- `id` (BIGSERIAL, PRIMARY KEY) - Auto-increment order ID (starts at 1000000)
- `order_uuid` (UUID, UNIQUE) - Unique UUID for external references
- `order_type` (ENUM) - `food`, `parcel`, `ride`, `3pl` - **CRITICAL**: Determines which service-specific tables to use
- `order_category` (ENUM) - `food`, `parcel`, `ride`, `3pl` - Category classification
- `external_ref` (TEXT) - External reference number
- `order_source` (ENUM) - `internal`, `swiggy`, `zomato`, `rapido`, `ondc`, `shiprocket`, `other` - Where order came from

#### **Party References**
- `customer_id` (BIGINT, FK → customers.id) - Customer who placed order
- `rider_id` (INTEGER, FK → riders.id) - Currently assigned rider (may change)
- `merchant_id` (BIGINT) - Legacy merchant reference
- `merchant_store_id` (BIGINT, FK → merchant_stores.id) - Store/outlet
- `merchant_parent_id` (BIGINT, FK → merchant_parents.id) - Merchant brand/chain

#### **Location Information**
- `pickup_address`, `drop_address` (TEXT) - Address strings
- `pickup_lat`, `pickup_lon` (DOUBLE PRECISION) - Pickup coordinates
- `drop_lat`, `drop_lon` (DOUBLE PRECISION) - Drop coordinates
- `distance_km` (NUMERIC) - Total distance
- `eta_seconds` (INTEGER) - Estimated time of arrival

#### **Financial Information**
- `fare_amount` (NUMERIC) - Base fare
- `commission_amount` (NUMERIC) - Platform commission
- `rider_earning` (NUMERIC) - Rider's earning
- `total_amount` (NUMERIC) - Total order amount
- `discount_amount` (NUMERIC) - Total discount applied
- `tax_amount` (NUMERIC) - Tax amount
- `delivery_fee` (NUMERIC) - Delivery fee
- `tip_amount` (NUMERIC) - Tip amount

#### **Order Status**
- `status` (ENUM) - `assigned`, `accepted`, `reached_store`, `picked_up`, `in_transit`, `delivered`, `cancelled`, `failed` - **CRITICAL**: Current order status
- `current_status` (TEXT) - Denormalized status (synced from timeline)
- `payment_status` (ENUM) - `pending`, `processing`, `completed`, `failed`, `refunded`, `partially_refunded`, `cancelled`
- `payment_method` (ENUM) - `cash`, `online`, `wallet`, `upi`, `card`, `netbanking`, `cod`, `other`

#### **Service-Specific Fields (Food)**
- `restaurant_name`, `restaurant_phone` (TEXT) - Restaurant details
- `preparation_time_minutes` (INTEGER) - Prep time
- `food_items_count` (INTEGER) - Number of food items
- `food_items_total_value` (NUMERIC) - Total food value
- `requires_utensils` (BOOLEAN) - Utensils required
- `veg_non_veg` (ENUM) - `veg`, `non_veg`, `mixed`, `na`

#### **Service-Specific Fields (Parcel)**
- `package_weight_kg`, `package_length_cm`, `package_width_cm`, `package_height_cm` (NUMERIC) - Package dimensions
- `package_value` (NUMERIC) - Declared value
- `is_fragile` (BOOLEAN) - Fragile package
- `is_cod` (BOOLEAN) - Cash on delivery
- `cod_amount` (NUMERIC) - COD amount
- `requires_signature`, `requires_otp_verification` (BOOLEAN) - Verification requirements
- `insurance_required`, `insurance_amount` (BOOLEAN/NUMERIC) - Insurance

#### **Service-Specific Fields (Ride)**
- `ride_type` (TEXT) - `auto`, `bike`, `car`, `premium`
- `vehicle_type_required` (TEXT) - Required vehicle type
- `scheduled_ride` (BOOLEAN) - Whether scheduled
- `scheduled_pickup_time` (TIMESTAMP) - Scheduled pickup time

#### **Timestamps**
- `created_at` (TIMESTAMP) - When order was created
- `updated_at` (TIMESTAMP) - Last update time
- `accepted_at`, `picked_up_at`, `delivered_at` (TIMESTAMP) - Status timestamps
- `cancelled_at` (TIMESTAMP) - Cancellation time
- `estimated_pickup_time`, `estimated_delivery_time` (TIMESTAMP) - Estimated times
- `actual_pickup_time`, `actual_delivery_time` (TIMESTAMP) - Actual times

#### **Provider Integration**
- `source` (ENUM) - `internal`, `swiggy`, `zomato`, `rapido`, etc.
- `provider_order_id` (TEXT) - Provider's order ID
- `external_order_id` (TEXT) - External order ID
- `synced_with_provider` (BOOLEAN) - Sync status
- `sync_status` (TEXT) - `synced`, `pending`, `failed`, `conflict`
- `sync_error` (TEXT) - Sync error message
- `provider_status` (TEXT) - Provider's status (may differ from ours)

#### **Metadata**
- `metadata` (JSONB) - Flexible metadata storage
- `order_metadata` (JSONB) - Additional order metadata

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `current_status` (via trigger from timeline), status timestamps (via triggers)
- ⚠️ Manual update: `status`, `rider_id`, `payment_status` (by system/agents)
- 🔒 Never update: `id`, `order_uuid`, `order_type`, `created_at`

**Relationships**:
- References: `customers.id`, `riders.id`, `merchant_stores.id`, `merchant_parents.id`
- Referenced by: All order-related tables (items, payments, timeline, assignments, etc.)

**Critical Notes**:
1. **Order ID**: Starts at 1000000 (6+ digits)
2. **Order Type**: Determines which service-specific tables contain details
3. **Status**: Use `order_timeline` for immutable history, `status` for current state
4. **Multi-Rider**: Use `order_rider_assignments` for rider history (never update `rider_id` directly)
5. **Multi-Payment**: Use `order_payments` for payment attempts (never update payment fields directly)

---

## 🔗 **CORE RELATIONSHIPS**

```
orders (1) ──→ (many) order_items
orders (1) ──→ (many) order_payments
orders (1) ──→ (many) order_refunds
orders (1) ──→ (many) order_rider_assignments
orders (1) ──→ (many) order_timeline
orders (1) ──→ (many) order_notifications
orders (1) ──→ (many) order_remarks
orders (1) ──→ (many) order_instructions
orders (1) ──→ (1) order_food_details (if order_type = 'food')
orders (1) ──→ (1) order_parcel_details (if order_type = 'parcel')
orders (1) ──→ (1) order_ride_details (if order_type = 'ride')
```

---

## 📊 **ORDER TYPE MAPPING**

| Order Type | Service-Specific Table | Additional Tables |
|------------|----------------------|-------------------|
| `food` | `order_food_details` | `order_food_items` |
| `parcel` | `order_parcel_details` | `parcel_tracking_events`, `cod_collections` |
| `ride` | `order_ride_details` | `ride_fare_breakdown`, `ride_routes` |
| `3pl` | None (uses base orders table) | None |

---

## ⚠️ **IMPORTANT DESIGN PRINCIPLES**

1. **Single Source of Truth**: `orders` table is the master
2. **Immutable History**: `order_timeline` never updates, only inserts
3. **Multi-Rider Support**: Multiple riders can be assigned (history preserved)
4. **Multi-Payment Support**: Multiple payment attempts tracked
5. **Never Delete**: Orders are never deleted, only marked as cancelled
6. **Status Sync**: `current_status` is synced from `order_timeline` via trigger

---

**Next**: See `DATABASE_SCHEMA_ORDERS_DOMAIN_PART2_ITEMS_SERVICES.md` for order items and service-specific details.
