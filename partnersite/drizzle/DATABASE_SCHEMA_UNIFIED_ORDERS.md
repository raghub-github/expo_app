# Unified Orders Domain - Complete Documentation

## 📦 **UNIFIED ORDERS DOMAIN OVERVIEW**

The Unified Orders Domain is the **core of the entire platform**. It manages:
- **Unified orders table** (supports Food, Parcel, Ride, 3PL)
- **Service-specific order details** (food, parcel, ride)
- **Order items, addons, instructions**
- **Immutable order timeline** (complete status history)
- **Multi-rider assignment support** (multiple riders per order with full history)
- **Rider-specific OTP verification** (pickup and delivery OTPs per rider assignment)
- **Order payments and refunds** (multiple payment attempts, partial/full refunds)
- **Order ratings, remarks, notifications**
- **Order disputes and conflicts**
- **Provider integration** (Swiggy, Zomato, Rapido, ONDC, Shiprocket)
- **3PL provider support** (third-party logistics)

**Total Tables**: 50+ tables

**Design Principles**:
1. **Single Source of Truth**: `orders` table is the master
2. **Immutable History**: Timeline and audit logs never update, only insert
3. **Multi-Rider Support**: Multiple riders can be assigned (history preserved)
4. **Multi-Payment Support**: Multiple payment attempts tracked
5. **Never Delete**: Orders are never deleted, only marked as cancelled
6. **Status Sync**: `current_status` is synced from `order_timeline` via trigger
7. **Provider Agnostic**: Supports internal orders and external providers
8. **Scalability**: Indexes and partitioning strategy for millions of orders

---

## 🎯 **CORE ORDERS TABLE**

### 1. **`orders`** - Master Orders Table (Single Source of Truth)

**Purpose**: The central table for ALL order types (Food, Parcel, Ride, 3PL). This is the **single source of truth** for orders.

**Key Attributes**:

#### **Order Identity**
- `id` (BIGSERIAL, PRIMARY KEY) - Auto-increment order ID (starts at 1000000)
- `order_uuid` (UUID, UNIQUE) - Unique UUID for external references
- `formatted_order_id` (TEXT, UNIQUE) - Human-readable order ID (e.g., ORD-2024-001234)
- `external_ref` (TEXT) - External reference number

#### **Service Classification**
- `order_type` (ENUM: `food`, `parcel`, `ride`, `3pl`) - **CRITICAL**: Determines which service-specific tables to use
- `order_category` (ENUM: `food`, `parcel`, `ride`, `3pl`) - Category classification
- `order_source` (ENUM: `internal`, `swiggy`, `zomato`, `rapido`, `ondc`, `shiprocket`, `other`) - Where order came from

#### **Party References**
- `customer_id` (BIGINT, FK → customers.id) - Customer who placed order
- `merchant_store_id` (BIGINT, FK → merchant_stores.id) - Store/outlet
- `merchant_parent_id` (BIGINT, FK → merchant_parents.id) - Merchant brand/chain
- `current_rider_id` (INTEGER, FK → riders.id) - Currently assigned rider (denormalized for quick access)
- `rider_id` (INTEGER, FK → riders.id) - Legacy rider reference (use current_rider_id)

#### **Location Information**
- `pickup_address_raw`, `pickup_address_normalized`, `pickup_address_geocoded` (TEXT) - Pickup address variants
- `pickup_lat`, `pickup_lon` (NUMERIC) - Pickup coordinates
- `pickup_address_deviation_meters` (NUMERIC) - Address deviation
- `drop_address_raw`, `drop_address_normalized`, `drop_address_geocoded` (TEXT) - Drop address variants
- `drop_lat`, `drop_lon` (NUMERIC) - Drop coordinates
- `drop_address_deviation_meters` (NUMERIC) - Address deviation
- `distance_km` (NUMERIC) - Total distance
- `distance_mismatch_flagged` (BOOLEAN) - Distance mismatch flag
- `eta_seconds` (INTEGER) - Estimated time of arrival

#### **Financial Information**
- `fare_amount` (NUMERIC) - Base fare
- `commission_amount` (NUMERIC) - Platform commission
- `rider_earning` (NUMERIC) - Rider's earning
- `total_item_value` (NUMERIC) - Total item value
- `total_tax` (NUMERIC) - Total tax
- `total_discount` (NUMERIC) - Total discount applied
- `total_delivery_fee` (NUMERIC) - Delivery fee
- `total_ctm` (NUMERIC) - Commission to merchant
- `total_payable` (NUMERIC) - Total payable amount
- `total_paid` (NUMERIC) - Total paid amount
- `total_refunded` (NUMERIC) - Total refunded amount
- `has_tip` (BOOLEAN) - Whether tip included
- `tip_amount` (NUMERIC) - Tip amount

#### **Order Status**
- `status` (ENUM: `assigned`, `accepted`, `reached_store`, `picked_up`, `in_transit`, `delivered`, `cancelled`, `failed`) - **CRITICAL**: Current order status
- `current_status` (TEXT) - Denormalized status (synced from timeline)
- `payment_status` (ENUM: `pending`, `processing`, `completed`, `failed`, `refunded`, `partially_refunded`, `cancelled`)
- `payment_method` (ENUM: `cash`, `online`, `wallet`, `upi`, `card`, `netbanking`, `cod`, `other`)

#### **Timestamps**
- `created_at` (TIMESTAMP) - When order was created
- `updated_at` (TIMESTAMP) - Last update time
- `estimated_pickup_time`, `estimated_delivery_time` (TIMESTAMP) - Estimated times
- `first_eta`, `promised_eta` (TIMESTAMP) - ETA tracking
- `actual_pickup_time`, `actual_delivery_time` (TIMESTAMP) - Actual times
- `cancelled_at` (TIMESTAMP) - Cancellation time

#### **Cancellation**
- `cancelled_by` (TEXT) - Who cancelled: `customer`, `rider`, `merchant`, `system`, `agent`
- `cancelled_by_id` (BIGINT) - ID of who cancelled
- `cancelled_by_type` (TEXT) - Cancelled by type: `store`, `customer`, `system`, `rider`, `admin`
- `cancellation_reason_id` (BIGINT, FK → order_cancellation_reasons.id) - Cancellation reason reference
- `cancellation_reason` (TEXT) - Cancellation reason text
- `cancellation_details` (JSONB) - Additional cancellation details

#### **Merchant Details (Snapshot)**
- `merchant_id` (BIGINT) - Legacy merchant reference
- `merchant_name`, `merchant_address`, `merchant_phone`, `merchant_email` (TEXT) - Merchant snapshot
- `merchant_store_name` (TEXT) - Store name snapshot
- `merchant_cuisine_types` (TEXT[]) - Cuisine types
- `merchant_avg_prep_time` (INTEGER) - Average prep time
- `merchant_commission_rate` (NUMERIC) - Commission rate
- `merchant_gst_number` (TEXT) - GST number

#### **Customer Details (Snapshot)**
- `customer_name`, `customer_mobile`, `customer_email` (TEXT) - Customer snapshot
- `customer_address_id` (BIGINT, FK → customer_addresses.id) - Customer address reference
- `delivery_address_auto`, `delivery_address_manual` (TEXT) - Delivery address variants
- `alternate_mobiles` (TEXT[]) - Alternate mobile numbers
- `landmark`, `pincode` (TEXT) - Address details
- `is_self_order` (BOOLEAN) - Whether self order or for someone else
- `order_for_name`, `order_for_mobile`, `order_for_relation` (TEXT) - Order for details
- `contact_less_delivery` (BOOLEAN) - Contactless delivery preference
- `special_delivery_notes`, `delivery_instructions` (TEXT) - Delivery instructions

#### **Device & App Info**
- `device_type`, `device_os`, `device_app_version` (TEXT) - Device information
- `device_ip`, `user_agent` (TEXT) - Request information
- `created_via` (TEXT) - Created via: `app`, `web`, `api`, `admin`
- `created_by_user_id` (INTEGER, FK → system_users.id) - User who created

#### **Delivery Type & Details**
- `delivery_type` (ENUM: `standard`, `express`, `scheduled`, `same_day`, `next_day`)
- `delivery_initiator` (ENUM: `customer`, `merchant`, `system`, `agent`)
- `locality_type` (ENUM: `urban`, `semi_urban`, `rural`, `highway`)
- `delivered_by` (TEXT) - Who delivered: `rider`, `merchant`, `self`, `3pl`
- `default_system_kpt_minutes` (INTEGER) - Default kitchen prep time
- `merchant_updated_kpt_minutes` (INTEGER) - Merchant updated prep time

#### **Bulk Order Support**
- `is_bulk_order` (BOOLEAN) - Whether bulk order
- `bulk_reason` (TEXT) - Bulk order reason
- `bulk_order_group_id` (TEXT) - Bulk order group ID

#### **Provider Integration**
- `provider_order_id`, `external_order_id` (TEXT) - Provider order IDs
- `provider_reference`, `buyer_app_name` (TEXT) - Provider references
- `synced_with_provider` (BOOLEAN) - Sync status
- `sync_status` (TEXT) - Sync status: `synced`, `pending`, `failed`, `conflict`
- `sync_error` (TEXT) - Sync error message
- `sync_retry_count` (INTEGER) - Sync retry count
- `last_sync_at` (TIMESTAMP) - Last sync time
- `provider_status` (TEXT) - Provider's status (may differ from ours)
- `provider_status_updated_at` (TIMESTAMP) - Provider status update time

**Provider-Specific IDs**:
- Swiggy: `swiggy_order_id`, `swiggy_restaurant_id`, `swiggy_customer_id`, `swiggy_delivery_partner_id`
- Zomato: `zomato_order_id`, `zomato_restaurant_id`, `zomato_customer_id`, `zomato_delivery_partner_id`
- Rapido: `rapido_booking_id`, `rapido_rider_id`, `rapido_customer_id`, `rapido_trip_id`
- ONDC: `ondc_order_id`
- Shiprocket: `shiprocket_shipment_id`

**Provider Financials**:
- `provider_fare_amount`, `provider_commission`, `provider_rider_payout` (NUMERIC)
- `provider_webhook_data` (JSONB) - Provider webhook data
- `provider_created_at`, `provider_updated_at` (TIMESTAMP)
- `provider_customer_id`, `provider_merchant_id`, `provider_restaurant_id` (TEXT)
- `webhook_event_id` (BIGINT, FK → webhook_events.id)

#### **3PL Provider Integration**
- `tpl_provider_id` (BIGINT, FK → tpl_providers.id) - 3PL provider reference
- `tpl_order_request_id` (BIGINT, FK → tpl_order_requests.id) - 3PL order request reference
- `tpl_inbound_order_id` (BIGINT, FK → tpl_inbound_orders.id) - 3PL inbound order reference
- `is_tpl_order` (BOOLEAN) - Whether 3PL order
- `tpl_direction` (TEXT) - Direction: `outbound`, `inbound`
- `assignment_provider` (TEXT) - Assignment provider: `internal`, `3pl`, provider name

#### **Service-Specific Fields (Denormalized)**
**Food**:
- `restaurant_name`, `restaurant_phone` (TEXT)
- `preparation_time_minutes` (INTEGER)
- `food_items_count` (INTEGER)
- `food_items_total_value` (NUMERIC)
- `requires_utensils` (BOOLEAN)
- `veg_non_veg` (ENUM: `veg`, `non_veg`, `mixed`, `na`)

**Parcel**:
- `package_weight_kg`, `package_length_cm`, `package_width_cm`, `package_height_cm` (NUMERIC)
- `package_value` (NUMERIC)
- `is_fragile` (BOOLEAN)
- `is_cod` (BOOLEAN)
- `cod_amount` (NUMERIC)
- `requires_signature`, `requires_otp_verification` (BOOLEAN)
- `insurance_required` (BOOLEAN)
- `insurance_amount` (NUMERIC)
- `package_description` (TEXT)

**Ride**:
- `passenger_name`, `passenger_phone` (TEXT)
- `passenger_count` (INTEGER)
- `ride_type` (TEXT) - `shared`, `private`, `premium`, `economy`, `luxury`
- `vehicle_type_required` (TEXT) - `bike`, `car`, `auto`, `suv`, `van`
- `base_fare`, `distance_fare`, `time_fare` (NUMERIC)
- `surge_multiplier` (NUMERIC)
- `toll_charges`, `parking_charges`, `waiting_charges` (NUMERIC)
- `scheduled_ride` (BOOLEAN)
- `scheduled_pickup_time` (TIMESTAMP)
- `return_trip` (BOOLEAN)
- `return_pickup_address`, `return_pickup_lat`, `return_pickup_lon`, `return_pickup_time` (TEXT/NUMERIC/TIMESTAMP)

#### **Refund & Agent Actions**
- `refund_status` (TEXT) - Refund status
- `refund_amount` (NUMERIC) - Refund amount
- `last_agent_action` (TEXT) - Last agent action
- `last_agent_id` (INTEGER, FK → system_users.id) - Last agent ID
- `last_agent_action_at` (TIMESTAMP) - Last agent action time

#### **Risk & Flags**
- `risk_flagged` (BOOLEAN) - Risk flagged
- `risk_reason` (TEXT) - Risk reason
- `priority` (TEXT) - Priority: `low`, `normal`, `high`, `urgent`
- `special_requirements` (TEXT[]) - Special requirements

#### **Metadata**
- `order_metadata` (JSONB) - Flexible metadata storage
- `items` (JSONB) - Denormalized items snapshot

#### **Legacy Fields**
- `food_order_status` (ENUM) - Legacy food order status
- `parent_merchant_id` (TEXT) - Legacy merchant parent reference
- `contact_person_name`, `contact_person_phone` (TEXT)
- `delivery_proof_url`, `delivery_proof_type` (TEXT)
- `customer_rating` (SMALLINT) - Customer rating (1-5)
- `customer_feedback` (TEXT) - Customer feedback

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `current_status` (via trigger from timeline), status timestamps (via triggers)
- ⚠️ Manual update: `status`, `current_rider_id`, `payment_status` (by system/agents)
- 🔒 Never update: `id`, `order_uuid`, `order_type`, `created_at`

**Relationships**:
- References: `customers.id`, `riders.id`, `merchant_stores.id`, `merchant_parents.id`, `order_cancellation_reasons.id`, `customer_addresses.id`, `tpl_providers.id`, `tpl_order_requests.id`, `tpl_inbound_orders.id`, `webhook_events.id`, `system_users.id`
- Referenced by: All order-related tables (items, payments, timeline, assignments, etc.)

**Critical Notes**:
1. **Order ID**: Starts at 1000000 (6+ digits)
2. **Order Type**: Determines which service-specific tables contain details
3. **Status**: Use `order_timeline` for immutable history, `status` for current state
4. **Multi-Rider**: Use `order_rider_assignments` for rider history (never update `current_rider_id` directly)
5. **Multi-Payment**: Use `order_payments` for payment attempts (never update payment fields directly)
6. **Provider Sync**: Use `order_provider_mapping` and `order_sync_logs` for provider integration

---

## 🍕 **SERVICE-SPECIFIC DETAIL TABLES**

### 2. **`order_food_details`** - Food Order Details

**Purpose**: Service-specific details for food delivery orders (1:1 with orders where order_type='food').

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id, UNIQUE) - One record per food order
- `restaurant_id` (BIGINT) - Restaurant/store ID
- `restaurant_name`, `restaurant_phone`, `restaurant_address` (TEXT) - Restaurant details
- `preparation_time_minutes` (INTEGER) - Estimated prep time
- `estimated_preparation_time`, `actual_preparation_time` (TIMESTAMP) - Prep time tracking
- `food_items_count` (INTEGER) - Number of food items
- `food_items_total_value` (NUMERIC) - Total food value
- `requires_utensils`, `requires_packaging` (BOOLEAN) - Packaging requirements
- `veg_non_veg` (ENUM: `veg`, `non_veg`, `mixed`, `na`) - Food classification
- `food_metadata` (JSONB) - Additional food-specific metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `actual_preparation_time` (when ready)
- ⚠️ Manual update: `preparation_time_minutes`, `estimated_preparation_time` (by merchant/system)
- 🔒 Never update: `id`, `order_id`, `created_at`

**Relationships**:
- References: `orders.id` (1:1 for food orders)
- Used by: Food delivery tracking, preparation time estimation

---

### 3. **`order_parcel_details`** - Parcel Order Details

**Purpose**: Service-specific details for parcel delivery orders (1:1 with orders where order_type='parcel').

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id, UNIQUE) - One record per parcel order
- `package_weight_kg`, `package_length_cm`, `package_width_cm`, `package_height_cm` (NUMERIC) - Package dimensions
- `package_volume_liters` (NUMERIC) - Calculated volume
- `package_value` (NUMERIC) - Declared value
- `package_description` (TEXT) - Package description
- `package_contents` (TEXT[]) - Array of contents
- `is_fragile`, `is_hazardous` (BOOLEAN) - Package flags
- `requires_handling` (TEXT) - `careful`, `upright`, `temperature_controlled`, etc.
- `is_cod` (BOOLEAN) - Cash on delivery
- `cod_amount` (NUMERIC) - COD amount
- `cod_collected` (BOOLEAN) - Whether COD collected
- `cod_collected_at` (TIMESTAMP) - When COD collected
- `requires_signature`, `requires_otp_verification`, `requires_photo_proof` (BOOLEAN) - Verification requirements
- `delivery_proof_url` (TEXT) - Proof of delivery URL
- `insurance_required` (BOOLEAN) - Whether insurance required
- `insurance_amount` (NUMERIC) - Insurance amount
- `insurance_provider` (TEXT) - Insurance provider
- `scheduled_pickup_time`, `scheduled_delivery_time` (TIMESTAMP) - Scheduled times
- `parcel_metadata` (JSONB) - Additional parcel metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `cod_collected`, `cod_collected_at` (when COD collected)
- ⚠️ Manual update: `delivery_proof_url` (when proof uploaded)
- 🔒 Never update: `id`, `order_id`, `created_at`

**Relationships**:
- References: `orders.id` (1:1 for parcel orders)
- Used by: Parcel tracking, COD collection, insurance

---

### 4. **`order_ride_details`** - Ride Order Details

**Purpose**: Service-specific details for ride booking orders (1:1 with orders where order_type='ride').

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id, UNIQUE) - One record per ride order
- `passenger_name`, `passenger_phone`, `passenger_email` (TEXT) - Passenger details
- `passenger_count` (INTEGER) - Number of passengers
- `ride_type` (TEXT) - `shared`, `private`, `premium`, `economy`, `luxury`
- `vehicle_type_required` (TEXT) - `bike`, `car`, `auto`, `suv`, `van`
- `base_fare`, `distance_fare`, `time_fare` (NUMERIC) - Fare components
- `surge_multiplier` (NUMERIC) - Surge multiplier (default: 1.0)
- `surge_amount` (NUMERIC) - Surge amount
- `toll_charges`, `parking_charges`, `waiting_charges`, `night_charges` (NUMERIC) - Additional charges
- `gst_amount`, `discount_amount` (NUMERIC) - Tax and discount
- `total_fare` (NUMERIC) - Total fare
- `scheduled_ride` (BOOLEAN) - Whether scheduled
- `scheduled_pickup_time` (TIMESTAMP) - Scheduled pickup time
- `return_trip` (BOOLEAN) - Whether round trip
- `return_pickup_address`, `return_pickup_lat`, `return_pickup_lon` (TEXT/NUMERIC) - Return trip details
- `return_pickup_time` (TIMESTAMP) - Return pickup time
- `route_polyline` (TEXT) - Route polyline
- `route_waypoints` (JSONB) - Route waypoints
- `estimated_route_distance_km`, `actual_route_distance_km` (NUMERIC) - Route distances
- `ride_metadata` (JSONB) - Additional ride metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `actual_route_distance_km` (when ride completes)
- ⚠️ Manual update: `surge_multiplier`, `surge_amount` (by system based on demand)
- 🔒 Never update: `id`, `order_id`, `created_at`

**Relationships**:
- References: `orders.id` (1:1 for ride orders)
- Used by: Ride fare calculation, route tracking

---

## 📦 **ORDER ITEMS TABLES**

### 5. **`order_items`** - Order Items (Generic)

**Purpose**: Stores all items in an order (food items, parcel items, etc.). Supports all service types.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order this item belongs to
- `item_id` (BIGINT) - Reference to merchant menu item (if applicable)
- `merchant_menu_id` (BIGINT) - Reference to merchant menu item ID
- `item_name` (TEXT) - Item name
- `item_title` (TEXT) - Display title
- `item_description` (TEXT) - Item description
- `item_image_url` (TEXT) - Item image URL
- `item_category`, `item_subcategory` (TEXT) - Category classification
- `item_type` (TEXT) - `food_item`, `parcel`, `passenger`, etc.
- `unit_price` (NUMERIC) - Price per unit
- `quantity` (INTEGER) - Quantity ordered
- `tax_percentage`, `tax_amount` (NUMERIC) - Tax details
- `total_price` (NUMERIC) - Total price (unit_price * quantity)
- `merchant_offer`, `platform_offer` (JSONB) - Applied offers
- `final_item_price` (NUMERIC) - Final price after discounts
- `discount_amount` (NUMERIC) - Discount applied
- `is_veg` (BOOLEAN) - Whether item is vegetarian (food)
- `spice_level` (TEXT) - `mild`, `medium`, `hot`, `extra_hot` (food)
- `customizations` (TEXT) - Customization instructions
- `item_weight_kg` (NUMERIC) - Item weight (parcel)
- `item_value` (NUMERIC) - Declared value (parcel)
- `item_metadata` (JSONB) - Additional item metadata
- `created_at` (TIMESTAMP) - When item was added

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: All fields (by system when order is created)
- 🔒 Never update: `id`, `order_id`, `created_at` (immutable after order creation)

**Relationships**:
- References: `orders.id`
- Referenced by: `order_item_addons`

---

### 6. **`order_item_addons`** - Item Addons

**Purpose**: Addons for order items (extra cheese, no onions, etc.).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_item_id` (BIGINT, FK → order_items.id) - Which item this addon belongs to
- `addon_id` (BIGINT) - Reference to merchant menu addon (if applicable)
- `addon_name` (TEXT) - Addon name
- `addon_type` (TEXT) - `extra`, `remove`, `substitute`
- `addon_price` (NUMERIC) - Addon price
- `quantity` (INTEGER) - Quantity of addon
- `addon_metadata` (JSONB) - Additional addon metadata
- `created_at` (TIMESTAMP) - When addon was added

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: All fields (immutable after order creation)

**Relationships**:
- References: `order_items.id`

---

## 🚴 **RIDER ASSIGNMENT TABLES**

### 7. **`order_rider_assignments`** - Rider Assignments (Multi-Rider Support)

**Purpose**: Tracks ALL rider assignments for an order. History is preserved - never deleted.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `rider_id` (INTEGER, FK → riders.id) - Assigned rider
- `rider_name`, `rider_mobile` (TEXT) - Rider snapshot (at time of assignment)
- `rider_vehicle_type`, `rider_vehicle_number` (TEXT) - Vehicle snapshot
- `delivery_provider` (TEXT) - `internal`, `swiggy`, `zomato`, `rapido`, `3pl`, etc.
- `provider_rider_id` (TEXT) - Provider's rider ID (if external provider)
- `provider_assignment_id` (TEXT) - Provider's assignment ID
- `provider_assignment_status` (TEXT) - Provider's assignment status
- `assignment_status` (ENUM: `pending`, `assigned`, `accepted`, `rejected`, `cancelled`, `completed`, `failed`) - Assignment status
- `assignment_method` (TEXT) - `auto`, `manual`, `broadcast`, `rider_request`
- `assignment_score` (NUMERIC) - Algorithm score (for auto-assignment)
- `distance_to_pickup_km` (NUMERIC) - Distance from rider to pickup
- `estimated_arrival_minutes` (INTEGER) - Estimated arrival time
- `assigned_at`, `accepted_at`, `rejected_at` (TIMESTAMP) - Status timestamps
- `reached_merchant_at`, `picked_up_at`, `delivered_at` (TIMESTAMP) - Delivery timestamps
- `cancelled_at` (TIMESTAMP) - Cancellation time
- `cancellation_reason`, `cancellation_reason_code` (TEXT) - Cancellation details
- `cancelled_by` (TEXT) - `rider`, `system`, `merchant`, `customer`, `agent`
- `cancelled_by_id` (BIGINT) - Who cancelled
- `distance_to_merchant_km`, `distance_to_customer_km`, `total_distance_km` (NUMERIC) - Distance tracking
- `rider_earning`, `commission_amount`, `tip_amount` (NUMERIC) - Earnings
- `synced_to_provider` (BOOLEAN) - Whether synced to provider
- `provider_sync_error` (TEXT) - Provider sync error
- `provider_sync_retry_count` (INTEGER) - Provider sync retry count
- `provider_response` (JSONB) - Provider response
- `provider_metadata` (JSONB) - Provider metadata
- `assignment_metadata` (JSONB) - Additional assignment data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), status timestamps (when status changes)
- ⚠️ Manual update: `assignment_status`, `accepted_at`, `rejected_at`, etc. (by system/rider)
- 🔒 Never update: `id`, `order_id`, `rider_id`, `assigned_at`, `created_at`

**Relationships**:
- References: `orders.id`, `riders.id`
- Referenced by: `order_rider_distances`, `order_rider_actions`

**Critical Notes**:
1. **History Preserved**: Never delete assignments, only add new ones
2. **One Active**: Only one assignment with status `pending`, `assigned`, or `accepted` per order (enforced by unique index)
3. **Snapshot Data**: Rider details are snapshotted at assignment time (for historical accuracy)
4. **Provider Support**: Supports internal riders and external provider riders

---

### 8. **`order_rider_distances`** - Distance Tracking

**Purpose**: Tracks distances for each rider assignment.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_assignment_id` (BIGINT, FK → order_rider_assignments.id) - Which assignment
- `merchant_to_rider_km` (NUMERIC) - Distance from merchant to rider location
- `merchant_to_customer_km` (NUMERIC) - Direct distance merchant to customer
- `rider_to_merchant_km` (NUMERIC) - Distance rider traveled to merchant
- `rider_to_customer_km` (NUMERIC) - Distance rider traveled to customer
- `total_distance_km` (NUMERIC) - Total distance traveled
- `route_polyline` (TEXT) - Route polyline
- `route_duration_seconds` (INTEGER) - Route duration
- `route_metadata` (JSONB) - Additional route data
- `recorded_at` (TIMESTAMP) - When distance was recorded

**When to Update**:
- ✅ Auto-updated: All fields (by system when distances calculated)
- 🔒 Never update: This is an **immutable distance record** - never update or delete

**Relationships**:
- References: `order_rider_assignments.id`
- Used by: Fare calculation, distance-based analytics

---

### 9. **`order_rider_actions`** - Rider Accept/Reject Actions

**Purpose**: Logs all accept/reject actions by riders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `rider_assignment_id` (BIGINT, FK → order_rider_assignments.id) - Related assignment
- `rider_id` (INTEGER, FK → riders.id)
- `action` (TEXT) - `accept`, `reject`, `auto_reject`, `timeout`
- `reason`, `reason_code` (TEXT) - Reason for action
- `response_time_seconds` (INTEGER) - Time taken to respond
- `distance_from_pickup_km` (NUMERIC) - Distance when action taken
- `action_metadata` (JSONB) - Additional action data
- `timestamp` (TIMESTAMP) - When action occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system when action occurs)
- 🔒 Never update: This is an **immutable action log** - never update or delete

**Relationships**:
- References: `orders.id`, `order_rider_assignments.id`, `riders.id`
- Used by: Rider performance analytics, assignment algorithm tuning

---

## 🔐 **OTP VERIFICATION TABLES**

### 10. **`order_otps`** - Order OTPs (Rider-Specific)

**Purpose**: Rider-specific OTPs for pickup and delivery verification. Each rider assignment has individual OTPs for pickup and delivery. Supports food, parcel, and ride services.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Order reference
- `rider_assignment_id` (BIGINT, FK → order_rider_assignments.id) - **CRITICAL**: Links to specific rider assignment (each rider has their own OTPs)
- `otp_type` (ENUM: `pickup`, `delivery`) - Type of OTP
- `otp_code` (TEXT) - 4-6 digit OTP code
- `otp_status` (ENUM: `pending`, `verified`, `expired`, `failed`, `cancelled`, `bypassed`) - OTP status
- `expires_at` (TIMESTAMP) - OTP expiry time (typically 5-10 minutes)
- `attempt_count` (INTEGER) - Number of verification attempts
- `max_attempts` (INTEGER) - Maximum allowed attempts (default: 3)
- `locked_until` (TIMESTAMP) - Lockout until this time (if too many failed attempts)
- `verified_at` (TIMESTAMP) - When OTP was verified
- `verified_by` (TEXT) - Who verified: `rider`, `merchant`, `customer`, `system`, `agent`
- `verified_by_id` (BIGINT) - ID of who verified
- `verification_method` (ENUM: `manual_entry`, `auto_verify`, `admin_override`, `system_bypass`) - How OTP was verified
- `verification_location_lat`, `verification_location_lon` (DOUBLE PRECISION) - Location where verified
- `verification_location_address` (TEXT) - Address where verified
- `bypassed` (BOOLEAN) - Whether OTP was bypassed
- `bypass_reason` (TEXT) - Reason for bypass
- `bypassed_by`, `bypassed_by_id`, `bypassed_at` (TEXT/BIGINT/TIMESTAMP) - Bypass details
- `cancelled`, `cancellation_reason`, `cancelled_by`, `cancelled_by_id`, `cancelled_at` (BOOLEAN/TEXT/TEXT/BIGINT/TIMESTAMP) - Cancellation details
- `otp_metadata` (JSONB) - Additional OTP metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `otp_status` (on verification/expiry/failure)
- ⚠️ Manual update: `otp_code` (on generation), `verified_at`, `verified_by` (on verification)
- 🔒 Never update: `id`, `order_id`, `rider_assignment_id`, `created_at`

**Relationships**:
- References: `orders.id`, `order_rider_assignments.id` (each rider assignment has its own OTPs)
- Referenced by: `order_otp_audit.order_otp_id`

**Critical Notes**:
1. **Rider-Specific**: Each rider assignment has individual OTPs for pickup and delivery
2. **Unique Constraint**: Only one active (`pending`) OTP per rider assignment per type (pickup/delivery)
3. **Service Usage**:
   - **Food**: Pickup OTP (verified by merchant), Delivery OTP (verified by customer)
   - **Parcel**: Pickup OTP (verified by sender), Delivery OTP (verified by recipient)
   - **Ride**: Usually only pickup OTP (passenger present), delivery OTP optional
4. **Security**: OTP codes should be encrypted or hashed in production
5. **Expiry**: OTPs expire after 5-10 minutes (configurable)
6. **Lockout**: After max attempts, OTP is locked for 15 minutes (configurable)

**Usage Example**:
```sql
-- Generate pickup OTP for rider assignment
INSERT INTO order_otps (order_id, rider_assignment_id, otp_type, otp_code, expires_at)
VALUES (123456, 789, 'pickup', '123456', NOW() + INTERVAL '10 minutes');

-- Verify OTP
SELECT verify_otp(otp_id, '123456', 'merchant', merchant_id, 'manual_entry');
```

---

### 11. **`order_otp_audit`** - OTP Audit Log

**Purpose**: Immutable audit log of all OTP actions. Tracks OTP generation, validation attempts, expiry, cancellation, and bypass.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Order reference
- `order_otp_id` (BIGINT, FK → order_otps.id) - OTP reference (if exists)
- `rider_assignment_id` (BIGINT, FK → order_rider_assignments.id) - Rider assignment reference
- `action` (TEXT) - Action type: `GENERATE`, `VALIDATE_SUCCESS`, `VALIDATE_FAIL`, `EXPIRE`, `CANCEL`, `BYPASS`, `LOCK`
- `otp_type` (ENUM: `pickup`, `delivery`) - Type of OTP
- `otp_code` (TEXT) - OTP code (may be masked in audit log)
- `otp_status` (ENUM) - Status at time of action
- `actor_type` (TEXT) - Who performed action: `rider`, `merchant`, `customer`, `system`, `agent`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `attempted_code` (TEXT) - Code that was attempted (for validation failures)
- `attempt_number` (INTEGER) - Attempt number (1, 2, 3, etc.)
- `failure_reason` (TEXT) - Reason for failure (if applicable)
- `location_lat`, `location_lon` (DOUBLE PRECISION) - Location where action occurred
- `location_address` (TEXT) - Address where action occurred
- `action_metadata` (JSONB) - Additional action metadata
- `created_at` (TIMESTAMP) - When action occurred

**When to Update**:
- 🔒 **Never**: This is an immutable audit log - only inserts, never updates or deletes

**Relationships**:
- References: `orders.id`, `order_otps.id`, `order_rider_assignments.id`
- Used by: OTP verification tracking, security audits, compliance

**Critical Notes**:
1. **Immutable**: Never update or delete audit log entries
2. **Complete History**: Tracks all OTP actions for security and compliance
3. **Security**: OTP codes may be masked/redacted in audit log

---

## 📅 **TIMELINE & HISTORY TABLES**

### 12. **`order_timeline`** - Immutable Order Timeline

**Purpose**: **IMMUTABLE** chronological history of all order status changes. Never updated, only inserted.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `status` (ENUM) - Current status at this point in time
- `previous_status` (ENUM) - Previous status (before change)
- `actor_type` (TEXT) - `customer`, `rider`, `merchant`, `system`, `agent`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `location_lat`, `location_lon` (DOUBLE PRECISION) - Location where status changed
- `location_address` (TEXT) - Address where status changed
- `status_message` (TEXT) - Status message/description
- `status_metadata` (JSONB) - Additional status data
- `synced_to_provider` (BOOLEAN) - Whether synced to external provider
- `provider_status` (TEXT) - Provider's status
- `provider_event_id` (TEXT) - Provider's event ID
- `provider_sync_error` (TEXT) - Sync error if failed
- `occurred_at` (TIMESTAMP) - When status change occurred

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system when status changes)
- 🔒 Never update: This is an **IMMUTABLE timeline** - NEVER update or delete records

**Relationships**:
- References: `orders.id`
- Used by: Order history, audit trail, status tracking

**Critical Notes**:
1. **Immutable**: Never update or delete records
2. **Chronological**: Records are in chronological order by `occurred_at`
3. **Trigger**: Automatically creates records when `orders.status` changes
4. **Status Sync**: `orders.current_status` is synced from this table via trigger

---

### 13. **`order_audit_log`** - Complete Order Audit Trail

**Purpose**: Comprehensive audit trail of ALL order changes (not just status).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `action_type` (TEXT) - `create`, `update`, `delete`, `status_change`, `payment`, `refund`, etc.
- `action_field` (TEXT) - Field name if specific field changed
- `old_value`, `new_value` (JSONB) - Old and new values
- `action_reason` (TEXT) - Reason for action
- `actor_type` (TEXT) - `customer`, `rider`, `merchant`, `agent`, `system`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `actor_ip`, `actor_user_agent` (TEXT) - Actor context
- `action_metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP) - When action occurred

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system)
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- References: `orders.id`
- Used by: Complete audit trail, compliance, support

**Note**: This captures ALL changes, not just status changes.

---

### 14. **`order_status_history`** - Status History (Legacy)

**Purpose**: Alternative status history table (may be deprecated in favor of `order_timeline`).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `from_status`, `to_status` (ENUM) - Status transition
- `changed_by` (TEXT) - `rider`, `customer`, `merchant`, `system`, `admin`
- `changed_by_id` (INTEGER) - Who changed
- `reason` (TEXT) - Reason for change
- `location_lat`, `location_lon` (DOUBLE PRECISION) - Location
- `metadata` (JSONB) - Additional data
- `synced_to_provider` (BOOLEAN) - Whether synced to provider
- `provider_status` (TEXT) - Provider's status
- `created_at` (TIMESTAMP) - When change occurred

**When to Update**:
- ✅ Auto-updated: All fields (by trigger when status changes)
- 🔒 Never update: This is an **immutable history** - never update or delete

**Note**: Check if this is still used or if `order_timeline` replaced it.

---

## 💳 **PAYMENT TABLES**

### 15. **`order_payments`** - Order Payment Attempts

**Purpose**: Tracks ALL payment attempts for an order (multiple attempts supported).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `payment_attempt_no` (INTEGER) - Attempt number (1, 2, 3, etc.)
- `payment_source` (TEXT) - `customer_app`, `merchant_app`, `web`, `api`
- `payment_mode` (ENUM: `cash`, `online`, `wallet`, `upi`, `card`, `netbanking`, `cod`, `other`)
- `transaction_id` (TEXT, UNIQUE) - Unique transaction ID
- `mp_transaction_id` (TEXT) - Marketplace transaction ID
- `pg_transaction_id` (TEXT) - Payment gateway transaction ID
- `pg_name` (TEXT) - `razorpay`, `stripe`, `payu`, etc.
- `pg_order_id`, `pg_payment_id`, `pg_signature` (TEXT) - Gateway IDs
- `payment_status` (ENUM: `pending`, `processing`, `completed`, `failed`, `refunded`, `partially_refunded`, `cancelled`)
- `payment_amount` (NUMERIC) - Payment amount
- `payment_fee` (NUMERIC) - Payment gateway fee
- `net_amount` (NUMERIC) - Net amount after fees
- `coupon_code` (TEXT) - Coupon used
- `coupon_type` (TEXT) - `percentage`, `fixed`, `free_delivery`
- `coupon_value`, `coupon_max_discount` (NUMERIC) - Coupon details
- `coupon_discount_applied` (NUMERIC) - Discount applied
- `is_refunded` (BOOLEAN) - Whether payment was refunded
- `refunded_amount` (NUMERIC) - Amount refunded
- `refund_transaction_id` (TEXT) - Refund transaction ID
- `pg_response` (JSONB) - Gateway response
- `payment_metadata` (JSONB) - Additional payment data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `payment_status`, `pg_payment_id`, `pg_transaction_id` (by payment gateway webhook)
- ⚠️ Manual update: `is_refunded`, `refunded_amount` (by refund system)
- 🔒 Never update: `id`, `order_id`, `payment_attempt_no`, `payment_amount`, `created_at`

**Relationships**:
- References: `orders.id`
- Referenced by: `order_refunds.order_payment_id`

**Critical Notes**:
1. **Multiple Attempts**: One order can have multiple payment attempts
2. **Unique Constraint**: `(order_id, payment_attempt_no)` ensures sequential attempts
3. **Gateway Integration**: Stores all gateway-specific IDs and responses

---

### 16. **`order_refunds`** - Order Refunds

**Purpose**: Tracks partial and full refunds for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `order_payment_id` (BIGINT, FK → order_payments.id) - Which payment was refunded
- `refund_type` (ENUM: `full`, `partial`, `item`, `delivery_fee`, `tip`, `penalty`)
- `refund_reason`, `refund_description` (TEXT) - Refund details
- `redemption_id` (TEXT) - Redemption ID
- `refund_id` (TEXT, UNIQUE) - Unique refund ID
- `pg_transaction_id`, `pg_refund_id` (TEXT) - Payment gateway IDs
- `product_type` (TEXT) - `order`, `item`, `delivery_fee`, `tip`, `penalty`
- `refund_amount` (NUMERIC) - Refund amount
- `refund_fee` (NUMERIC) - Refund processing fee
- `net_refund_amount` (NUMERIC) - Net refund after fees
- `issued_coupon_code`, `issued_coupon_value`, `issued_coupon_expiry` (TEXT/NUMERIC/TIMESTAMP) - Coupon issued as refund
- `mx_debit_amount` (NUMERIC) - Amount debited from merchant
- `mx_debit_reason` (TEXT) - Reason for merchant debit
- `refund_status` (TEXT) - `pending`, `processing`, `completed`, `failed`
- `refund_initiated_by` (TEXT) - `customer`, `merchant`, `rider`, `agent`, `system`
- `refund_initiated_by_id` (BIGINT) - Who initiated
- `refund_processed_by`, `refund_processed_by_id` (TEXT/BIGINT) - Who processed
- `pg_refund_response` (JSONB) - Gateway refund response
- `refund_metadata` (JSONB) - Additional refund data
- `created_at`, `processed_at`, `completed_at` (TIMESTAMP) - Refund timestamps

**When to Update**:
- ✅ Auto-updated: `refund_status`, `processed_at`, `completed_at` (by refund system)
- ⚠️ Manual update: `refund_status`, `refund_processed_by` (by finance team)
- 🔒 Never update: `id`, `order_id`, `refund_amount`, `refund_type`, `created_at`

**Relationships**:
- References: `orders.id`, `order_payments.id`
- Used by: Refund processing, financial reconciliation

---

## 🎫 **TICKET & DISPUTE TABLES**

### 17. **`order_tickets`** - Order Support Tickets

**Purpose**: Support tickets related to orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `ticket_source` (ENUM: `customer`, `rider`, `merchant`, `system`, `agent`)
- `raised_by_id` (BIGINT) - Who raised ticket
- `raised_by_name`, `raised_by_type` (TEXT) - Raised by details
- `issue_category` (TEXT) - `delivery_delay`, `wrong_item`, `payment_issue`, etc.
- `issue_subcategory` (TEXT) - More specific category
- `description` (TEXT) - Issue description
- `attachments` (TEXT[]) - Attachment URLs
- `priority` (ENUM: `low`, `medium`, `high`, `urgent`, `critical`)
- `status` (ENUM: `open`, `in_progress`, `resolved`, `closed`)
- `assigned_to_agent_id`, `assigned_to_agent_name` (INTEGER/TEXT) - Assigned agent
- `assigned_at` (TIMESTAMP) - When assigned
- `resolution` (TEXT) - Resolution details
- `resolved_at` (TIMESTAMP) - When resolved
- `resolved_by`, `resolved_by_name` (INTEGER/TEXT) - Who resolved
- `follow_up_required` (BOOLEAN) - Whether follow-up needed
- `follow_up_date` (TIMESTAMP) - Follow-up date
- `ticket_metadata` (JSONB) - Additional ticket data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `assigned_to_agent_id`, `resolution` (by support agents)
- 🔒 Never update: `id`, `order_id`, `ticket_source`, `created_at`

**Relationships**:
- References: `orders.id`
- Referenced by: `order_disputes.order_ticket_id`

**Note**: This is order-specific tickets. See `unified_tickets` for platform-wide ticket system.

---

### 18. **`order_disputes`** - Order Disputes

**Purpose**: Legal disputes raised for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `order_ticket_id` (BIGINT, FK → order_tickets.id) - Related ticket
- `dispute_type` (TEXT) - `refund`, `damage`, `non_delivery`, `fraud`, etc.
- `dispute_reason`, `dispute_description` (TEXT) - Dispute details
- `raised_by` (TEXT) - `customer`, `merchant`, `rider`
- `raised_by_id` (BIGINT) - Who raised
- `disputed_against` (TEXT) - `customer`, `merchant`, `rider`, `platform`
- `disputed_against_id` (BIGINT) - Who is disputed against
- `evidence_urls` (TEXT[]) - Evidence file URLs
- `evidence_description` (TEXT) - Evidence description
- `dispute_status` (TEXT) - `open`, `investigating`, `resolved`, `closed`, `escalated`
- `resolution`, `resolution_amount` (TEXT/NUMERIC) - Resolution details
- `resolved_at` (TIMESTAMP) - When resolved
- `resolved_by`, `resolved_by_name` (INTEGER/TEXT) - Who resolved
- `legal_case_id`, `legal_notes` (TEXT) - Legal information
- `dispute_metadata` (JSONB) - Additional dispute data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `dispute_status`, `resolution`, `resolved_at` (by legal/admin team)
- 🔒 Never update: `id`, `order_id`, `raised_by`, `dispute_type`, `created_at`

**Relationships**:
- References: `orders.id`, `order_tickets.id` (optional)
- Used by: Legal team, dispute resolution

---

## 💬 **COMMUNICATION TABLES**

### 19. **`order_remarks`** - Order Remarks

**Purpose**: Remarks/notes added to orders by customers, riders, merchants, or agents.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `actor_type` (TEXT) - `customer`, `rider`, `merchant`, `agent`, `system`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `action_taken` (TEXT) - `status_changed`, `refund_issued`, `rider_reassigned`, etc.
- `remark` (TEXT) - Remark text
- `remark_category` (TEXT) - `complaint`, `feedback`, `instruction`, `note`
- `remark_priority` (TEXT) - `low`, `normal`, `high`, `urgent`
- `visible_to` (TEXT[]) - Array of actor types who can see this remark
- `is_internal` (BOOLEAN) - Whether internal agent note
- `remark_metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP) - When remark added

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `remark`, `remark_category` (by actors)
- 🔒 Never update: `id`, `order_id`, `actor_type`, `actor_id`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Customer support, order notes, communication

---

### 20. **`order_instructions`** - Order Instructions

**Purpose**: Special instructions for merchant, rider, or customer.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `instruction_for` (TEXT) - `merchant`, `rider`, `customer`
- `instruction_text` (TEXT) - Instruction content
- `instruction_priority` (TEXT) - `low`, `normal`, `high`, `urgent`
- `created_at` (TIMESTAMP) - When instruction added
- `created_by` (TEXT) - `customer`, `merchant`, `rider`, `agent`, `system`
- `created_by_id` (BIGINT) - Who created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `instruction_text` (by actors)
- 🔒 Never update: `id`, `order_id`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Order fulfillment, delivery instructions

---

### 21. **`order_notifications`** - Order Notifications

**Purpose**: Tracks all notifications sent for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `notification_type` (TEXT) - `order_placed`, `order_accepted`, `order_delivered`, etc.
- `notification_channel` (ENUM: `push`, `sms`, `email`, `in_app`, `whatsapp`, `call`)
- `message` (TEXT) - Notification message
- `message_template_id` (TEXT) - Template used
- `sent_to` (TEXT) - Phone, email, or user ID
- `recipient_type` (TEXT) - `customer`, `rider`, `merchant`
- `recipient_id` (BIGINT) - Recipient ID
- `sent_at` (TIMESTAMP) - When sent
- `delivered_at` (TIMESTAMP) - When delivered
- `read_at` (TIMESTAMP) - When read
- `failed_at` (TIMESTAMP) - When failed
- `provider_message_id` (TEXT) - Provider's message ID
- `provider_response` (JSONB) - Provider response
- `notification_metadata` (JSONB) - Additional metadata

**When to Update**:
- ✅ Auto-updated: `delivered_at`, `read_at`, `failed_at` (by notification service)
- 🔒 Never update: `id`, `order_id`, `sent_at`, `message`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Notification tracking, delivery reports

---

## ⭐ **RATINGS & CANCELLATION TABLES**

### 22. **`order_ratings`** - Order Ratings

**Purpose**: Ratings given for orders (separate from general ratings).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `rider_id` (INTEGER, FK → riders.id)
- `rated_by` (TEXT) - `customer`, `merchant`, `rider`
- `rated_by_id` (INTEGER) - Who rated
- `rating` (SMALLINT) - Rating 1-5
- `comment` (TEXT) - Rating comment
- `rating_categories` (JSONB) - Category ratings (e.g., `{"punctuality": 5, "communication": 4}`)
- `created_at` (TIMESTAMP) - When rating given

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable rating** - never update or delete

**Relationships**:
- References: `orders.id`, `riders.id`
- Used by: Rider performance, order quality metrics

---

### 23. **`order_cancellation_reasons`** - Cancellation Details

**Purpose**: Tracks cancellation details and reasons for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `cancelled_by` (TEXT) - `customer`, `rider`, `merchant`, `system`, `agent`
- `cancelled_by_id` (INTEGER) - Who cancelled
- `reason_code` (TEXT) - Standardized reason code
- `reason_text` (TEXT) - Human-readable reason text
- `refund_status` (TEXT) - `pending`, `processing`, `completed`, `failed`, `not_applicable`
- `refund_amount` (NUMERIC) - Refund amount
- `penalty_applied` (BOOLEAN) - Whether penalty applied
- `penalty_amount` (NUMERIC) - Penalty amount
- `metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP) - When cancellation reason recorded

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `refund_status`, `refund_amount`, `penalty_applied`, `penalty_amount` (by system/finance team)
- 🔒 Never update: `id`, `order_id`, `cancelled_by`, `reason_code`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Cancellation tracking, refund processing, penalty calculation

---

### 24. **`order_delivery_images`** - Delivery Proof Images

**Purpose**: Delivery proof images and other images related to orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `image_url` (TEXT) - URL to the image
- `image_type` (TEXT) - `delivery_proof`, `signature`, `damage`, `other`
- `uploaded_by` (TEXT) - `rider`, `customer`, `merchant`, `agent`
- `uploaded_by_id` (BIGINT) - Who uploaded
- `image_metadata` (JSONB) - Additional image metadata (size, dimensions, etc.)
- `created_at` (TIMESTAMP) - When image uploaded

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: `id`, `order_id`, `created_at` (immutable)

**Relationships**:
- References: `orders.id`
- Used by: Delivery proof, dispute evidence, order verification

---

## 🔗 **PROVIDER INTEGRATION TABLES**

### 25. **`order_providers`** - Provider Master Table

**Purpose**: Master table for external order providers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `code` (TEXT, UNIQUE) - Provider code: `swiggy`, `zomato`, `rapido`, etc.
- `name` (TEXT) - Provider display name: Swiggy, Zomato, Rapido, etc.
- `is_active` (BOOLEAN) - Whether provider is currently active
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**Relationships**:
- Referenced by: `order_provider_mapping`, `provider_order_*` tables

---

### 26. **`order_provider_mapping`** - Provider Order Mapping

**Purpose**: Mapping between our orders and external provider orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `provider_id` (BIGINT, FK → order_providers.id)
- `provider_order_id` (TEXT) - Provider's order ID
- `provider_reference` (TEXT) - Provider's reference number
- `provider_status` (TEXT) - Provider's status (may differ from ours)
- `provider_status_updated_at` (TIMESTAMP) - When provider status updated
- `synced_at` (TIMESTAMP) - When synced
- `sync_status` (TEXT) - `synced`, `pending`, `failed`, `conflict`
- `sync_error` (TEXT) - Sync error message
- `provider_fare` (NUMERIC) - Provider's fare amount
- `provider_commission` (NUMERIC) - Provider's commission
- `provider_metadata` (JSONB) - Additional provider metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed
- UNIQUE(order_id, provider_id) - One mapping per provider per order

**Relationships**:
- References: `orders.id`, `order_providers.id`
- Used by: Provider sync system, order tracking

---

### 27. **`order_conflicts`** - Order Conflicts

**Purpose**: Tracks conflicts between our system and external providers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `provider_type` (ENUM: `swiggy`, `zomato`, `rapido`, etc.)
- `conflict_type` (TEXT) - `status_mismatch`, `fare_mismatch`, `rider_mismatch`, `payment_mismatch`, `item_mismatch`
- `our_value`, `provider_value` (JSONB) - Our value vs provider's value
- `resolution_strategy` (TEXT) - `manual_review`, `ours_wins`, `theirs_wins`, `merge`
- `resolved` (BOOLEAN) - Whether conflict resolved
- `resolved_by` (INTEGER, FK → system_users.id) - Admin who resolved
- `resolved_at` (TIMESTAMP) - When resolved
- `resolution_notes` (TEXT) - Resolution notes
- `created_at` (TIMESTAMP) - When conflict detected

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `resolved`, `resolved_by`, `resolved_at` (by admin)
- 🔒 Never update: `id`, `order_id`, `our_value`, `provider_value`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Provider sync system, conflict resolution

---

### 28. **`order_sync_logs`** - Order Sync Logs

**Purpose**: Logs all sync attempts with external providers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `provider_type` (ENUM: `swiggy`, `zomato`, `rapido`, etc.)
- `sync_direction` (TEXT) - `outbound` (us → provider), `inbound` (provider → us)
- `sync_type` (TEXT) - `status`, `payment`, `rider`, `item`, `full`
- `old_status`, `new_status` (ENUM) - Status changes
- `old_data`, `new_data` (JSONB) - Data changes
- `success` (BOOLEAN) - Whether sync succeeded
- `error_message` (TEXT) - Error if failed
- `retry_count` (INTEGER) - Retry count
- `created_at` (TIMESTAMP) - When sync attempted

**When to Update**:
- ✅ Auto-updated: All fields (by sync system)
- 🔒 Never update: This is an **immutable sync log** - never update or delete

**Relationships**:
- References: `orders.id`
- Used by: Sync monitoring, error tracking

---

### 27-31. **Provider-Specific Mapping Tables**

**`provider_order_analytics`** - Provider performance analytics
**`provider_order_conflicts`** - Provider-specific conflicts
**`provider_order_item_mapping`** - Provider item mapping
**`provider_order_payment_mapping`** - Provider payment mapping
**`provider_order_refund_mapping`** - Provider refund mapping
**`provider_order_status_sync`** - Provider status sync tracking

**Purpose**: Provider-specific mapping and tracking tables for detailed provider integration.

---

## 📍 **TRACKING TABLES**

### 32. **`order_route_snapshots`** - Route Snapshots

**Purpose**: Route snapshots for orders at different points in time.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `snapshot_type` (TEXT) - `initial`, `updated`, `final`, `recalculated`
- `distance_km` (NUMERIC) - Route distance
- `duration_seconds` (INTEGER) - Route duration
- `polyline` (TEXT) - Encoded polyline string
- `mapbox_response` (JSONB) - Map service API response
- `recorded_at` (TIMESTAMP) - When snapshot recorded
- `created_at` (TIMESTAMP) - When record created

**When to Update**:
- ✅ Auto-updated: All fields (by system when snapshot created)
- 🔒 Never update: This is an **immutable snapshot** - never update or delete

**Relationships**:
- References: `orders.id`
- Used by: Route tracking, distance calculations, fare calculations

---

### 33. **`parcel_tracking_events`** - Parcel Tracking Events

**Purpose**: Immutable tracking events for parcel delivery.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `event_type` (TEXT) - `picked_up`, `in_transit`, `out_for_delivery`, `delivery_attempted`, `delivered`, `returned`
- `location` (TEXT) - Current location description
- `lat`, `lon` (DOUBLE PRECISION) - Location coordinates
- `status_description` (TEXT) - Event description
- `handled_by` (TEXT) - `rider`, `warehouse`, `customer`, `merchant`
- `proof_url` (TEXT) - Photo/signature proof URL
- `created_at` (TIMESTAMP) - When event occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system when event occurs)
- 🔒 Never update: This is an **immutable tracking log** - never update or delete

**Relationships**:
- References: `orders.id`
- Used by: Parcel tracking, customer notifications

---

### 34. **`cod_collections`** - COD Collection Tracking

**Purpose**: Tracks COD (Cash on Delivery) collections.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `amount` (NUMERIC) - COD amount collected
- `collected_at` (TIMESTAMP) - When collected
- `collected_by` (INTEGER, FK → riders.id) - Rider who collected
- `collection_method` (TEXT) - `cash`, `upi`, `card`
- `transaction_id` (TEXT) - Transaction ID (for digital payments)
- `receipt_url` (TEXT) - Receipt/proof URL
- `deposited_to_bank` (BOOLEAN) - Whether deposited to bank
- `deposited_at` (TIMESTAMP) - When deposited
- `metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP) - When record created

**When to Update**:
- ✅ Auto-updated: `collected_at`, `created_at`
- ⚠️ Manual update: `deposited_to_bank`, `deposited_at` (by finance team)
- 🔒 Never update: `id`, `order_id`, `amount`, `collected_by`, `created_at`

**Relationships**:
- References: `orders.id`, `riders.id`
- Used by: COD reconciliation, financial reports

---

## 🔗 **CORE RELATIONSHIPS**

```
orders (1) ──→ (many) order_items
order_items (1) ──→ (many) order_item_addons
orders (1) ──→ (many) order_payments
order_payments (1) ──→ (many) order_refunds
orders (1) ──→ (many) order_rider_assignments
order_rider_assignments (1) ──→ (many) order_otps (pickup and delivery OTPs per rider)
order_otps (1) ──→ (many) order_otp_audit
order_rider_assignments (1) ──→ (many) order_rider_distances
orders (1) ──→ (many) order_rider_actions
orders (1) ──→ (many) order_timeline
orders (1) ──→ (many) order_audit_log
orders (1) ──→ (many) order_status_history
orders (1) ──→ (many) order_notifications
orders (1) ──→ (many) order_remarks
orders (1) ──→ (many) order_instructions
orders (1) ──→ (many) order_tickets
order_tickets (1) ──→ (many) order_disputes
orders (1) ──→ (many) order_ratings
orders (1) ──→ (many) order_cancellation_reasons
orders (1) ──→ (many) order_delivery_images
orders (1) ──→ (1) order_food_details (if order_type = 'food')
orders (1) ──→ (1) order_parcel_details (if order_type = 'parcel')
orders (1) ──→ (1) order_ride_details (if order_type = 'ride')
orders (1) ──→ (many) order_provider_mapping
order_provider_mapping (many) ──→ (1) order_providers
orders (1) ──→ (many) order_conflicts
orders (1) ──→ (many) order_sync_logs
orders (1) ──→ (many) order_route_snapshots
orders (1) ──→ (many) parcel_tracking_events
orders (1) ──→ (many) cod_collections
```

---

## 📊 **ORDER TYPE MAPPING**

| Order Type | Service-Specific Table | Additional Tables |
|------------|----------------------|-------------------|
| `food` | `order_food_details` | `order_food_items` (if legacy) |
| `parcel` | `order_parcel_details` | `parcel_tracking_events`, `cod_collections` |
| `ride` | `order_ride_details` | `order_route_snapshots` |
| `3pl` | None (uses base orders table) | `tpl_*` tables |

---

## ⚠️ **IMPORTANT DESIGN PRINCIPLES**

1. **Single Source of Truth**: `orders` table is the master
2. **Immutable History**: `order_timeline` never updates, only inserts
3. **Multi-Rider Support**: Multiple riders can be assigned (history preserved in `order_rider_assignments`)
4. **Multi-Payment Support**: Multiple payment attempts tracked in `order_payments`
5. **Never Delete**: Orders are never deleted, only marked as cancelled
6. **Status Sync**: `current_status` is synced from `order_timeline` via trigger
7. **Provider Agnostic**: Supports internal orders and external providers (Swiggy, Zomato, Rapido, ONDC, Shiprocket)
8. **3PL Support**: Supports third-party logistics providers
9. **Scalability**: Indexes and partitioning strategy for millions of orders

---

## 🚀 **USAGE EXAMPLES**

### Creating a Food Order

```sql
-- 1. Create order
INSERT INTO orders (
  order_type, order_category, order_source,
  customer_id, merchant_store_id,
  pickup_address_raw, pickup_lat, pickup_lon,
  drop_address_raw, drop_lat, drop_lon,
  status, payment_status
) VALUES (
  'food', 'food', 'internal',
  12345, 67890,
  '123 Restaurant St', 12.9716, 77.5946,
  '456 Customer St', 12.9352, 77.6245,
  'assigned', 'pending'
) RETURNING id;

-- 2. Create food details
INSERT INTO order_food_details (
  order_id, restaurant_id, restaurant_name,
  preparation_time_minutes, food_items_count
) VALUES (
  <order_id>, 67890, 'Restaurant Name',
  30, 3
);

-- 3. Create order items
INSERT INTO order_items (
  order_id, item_name, item_type,
  unit_price, quantity, total_price, final_item_price
) VALUES
  (<order_id>, 'Pizza', 'food_item', 500, 1, 500, 500),
  (<order_id>, 'Burger', 'food_item', 200, 2, 400, 400);

-- 4. Create timeline entry
INSERT INTO order_timeline (
  order_id, status, previous_status,
  actor_type, actor_id
) VALUES (
  <order_id>, 'assigned', NULL,
  'system', NULL
);
```

### Assigning Multiple Riders

```sql
-- 1. First rider assignment (rejected)
INSERT INTO order_rider_assignments (
  order_id, rider_id, assignment_status,
  assignment_method, assigned_at, rejected_at
) VALUES (
  <order_id>, 100, 'rejected',
  'auto', NOW(), NOW()
);

-- 2. Second rider assignment (accepted)
INSERT INTO order_rider_assignments (
  order_id, rider_id, assignment_status,
  assignment_method, assigned_at, accepted_at
) VALUES (
  <order_id>, 200, 'accepted',
  'auto', NOW(), NOW()
);

-- Note: orders.current_rider_id is automatically updated to 200 via trigger
```

### Creating Payment Attempts

```sql
-- First payment attempt (failed)
INSERT INTO order_payments (
  order_id, payment_attempt_no, payment_mode,
  payment_status, payment_amount
) VALUES (
  <order_id>, 1, 'card',
  'failed', 500
);

-- Second payment attempt (success)
INSERT INTO order_payments (
  order_id, payment_attempt_no, payment_mode,
  payment_status, payment_amount, pg_transaction_id
) VALUES (
  <order_id>, 2, 'upi',
  'completed', 500, 'TXN123456'
);
```

### Creating Refund

```sql
INSERT INTO order_refunds (
  order_id, order_payment_id, refund_type,
  refund_reason, refund_amount, refund_status,
  refund_initiated_by, refund_initiated_by_id
) VALUES (
  <order_id>, <payment_id>, 'full',
  'Customer cancelled', 500, 'pending',
  'customer', 12345
);
```

### Creating Support Ticket

```sql
INSERT INTO order_tickets (
  order_id, ticket_source, raised_by_id,
  issue_category, description, priority, status
) VALUES (
  <order_id>, 'customer', 12345,
  'delivery_delay', 'Order delayed by 30 minutes', 'high', 'open'
);
```

### Generating and Verifying OTP

```sql
-- 1. Generate pickup OTP for rider assignment
INSERT INTO order_otps (
  order_id, rider_assignment_id, otp_type,
  otp_code, expires_at, max_attempts
) VALUES (
  <order_id>, <rider_assignment_id>, 'pickup',
  '123456', NOW() + INTERVAL '10 minutes', 3
);

-- 2. Merchant verifies pickup OTP
SELECT verify_otp(
  <otp_id>, 
  '123456', 
  'merchant', 
  <merchant_id>, 
  'manual_entry',
  <merchant_lat>, 
  <merchant_lon>, 
  'Merchant Address'
);

-- 3. Generate delivery OTP for rider assignment
INSERT INTO order_otps (
  order_id, rider_assignment_id, otp_type,
  otp_code, expires_at, max_attempts
) VALUES (
  <order_id>, <rider_assignment_id>, 'delivery',
  '654321', NOW() + INTERVAL '10 minutes', 3
);

-- 4. Customer verifies delivery OTP
SELECT verify_otp(
  <otp_id>, 
  '654321', 
  'customer', 
  <customer_id>, 
  'manual_entry',
  <customer_lat>, 
  <customer_lon>, 
  'Customer Address'
);

-- 5. Query OTP status
SELECT 
  otp_type, 
  otp_status, 
  expires_at, 
  attempt_count,
  verified_at,
  verified_by
FROM order_otps
WHERE order_id = <order_id>
  AND rider_assignment_id = <rider_assignment_id>
ORDER BY created_at DESC;
```

---

## 📈 **PERFORMANCE CONSIDERATIONS**

### Indexes

All tables have comprehensive indexes for:
- Foreign keys
- Status queries
- Time-based queries
- Provider sync queries
- Customer/merchant order history queries

### Partitioning Strategy (For Future)

For tables with millions of rows, consider partitioning:
- `order_timeline`: Partition by `created_at` (monthly partitions)
- `order_audit_log`: Partition by `created_at` (monthly partitions)
- `order_payments`: Partition by `created_at` (monthly partitions)
- `order_notifications`: Partition by `sent_at` (monthly partitions)
- `order_otp_audit`: Partition by `created_at` (monthly partitions)

### Query Optimization Tips

1. **Use current_rider_id**: For quick rider lookups, use `current_rider_id` (denormalized)
2. **Use current_status**: For quick status checks, use `current_status` (denormalized)
3. **Use order_timeline**: For status history, query `order_timeline` (immutable)
4. **Use order_rider_assignments**: For rider history, query `order_rider_assignments` (immutable)
5. **Use order_payments**: For payment history, query `order_payments` (multiple attempts)

---

## 🔄 **MIGRATION GUIDE**

See `migrate_to_unified_orders.sql` for complete migration script.

**Migration Steps**:
1. Create backup tables (`orders_backup`, `orders_core_backup`)
2. Create unified orders table (if not exists)
3. Migrate data from `orders` table
4. Migrate data from `orders_core` table (if exists)
5. Update foreign key references
6. Migrate service-specific data
7. Migrate OTP data from `order_food_otps` and `order_otps` to unified `order_otps` table
8. Migrate OTP audit logs from `order_food_otp_audit` to unified `order_otp_audit` table
9. Verify data integrity

**Rollback**: Backup tables are created for rollback if needed.

---

## 📚 **RELATED DOCUMENTATION**

- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART1_CORE.md` - Core orders table (legacy)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART2_ITEMS_SERVICES.md` - Items and services (legacy)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART3_ASSIGNMENTS_TIMELINE.md` - Assignments and timeline (legacy)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART4_PAYMENTS_DISPUTES.md` - Payments and disputes (legacy)

---

## ✅ **SUMMARY**

**Total Tables**: 50+ tables

**Core Tables**:
- `orders` - Master orders table (unified)
- `order_food_details`, `order_parcel_details`, `order_ride_details` - Service-specific details
- `order_items`, `order_item_addons` - Order items
- `order_rider_assignments`, `order_rider_distances`, `order_rider_actions` - Rider assignments
- `order_otps`, `order_otp_audit` - OTP verification (rider-specific pickup and delivery OTPs)
- `order_timeline`, `order_audit_log`, `order_status_history` - Timeline and audit
- `order_payments`, `order_refunds` - Payments and refunds
- `order_tickets`, `order_disputes` - Support tickets and disputes
- `order_remarks`, `order_instructions`, `order_notifications` - Communication
- `order_ratings`, `order_cancellation_reasons`, `order_delivery_images` - Ratings and cancellation
- `order_providers`, `order_provider_mapping`, `order_conflicts`, `order_sync_logs` - Provider integration
- `order_route_snapshots`, `parcel_tracking_events`, `cod_collections` - Tracking

**Key Features**:
- ✅ Single unified orders table
- ✅ Multi-rider support with full history
- ✅ Rider-specific OTP verification (pickup and delivery)
- ✅ Multi-payment support
- ✅ Complete audit trail
- ✅ Provider integration (Swiggy, Zomato, Rapido, ONDC, Shiprocket)
- ✅ 3PL provider support
- ✅ Production-ready indexes
- ✅ Scalable architecture for millions of orders

---

**Last Updated**: 2025-02-18
