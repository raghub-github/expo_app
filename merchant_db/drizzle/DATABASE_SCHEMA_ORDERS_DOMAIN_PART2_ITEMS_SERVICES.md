# Orders Domain - Part 2: Order Items & Service-Specific Details

## 📦 **ORDER ITEMS TABLES**

### 1. **`order_items`** - Order Items (Generic)
**Purpose**: Stores all items in an order (food items, parcel items, etc.).

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

### 2. **`order_item_addons`** - Item Addons
**Purpose**: Addons for order items (extra cheese, no onions, etc.).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_item_id` (BIGINT, FK → order_items.id) - Which item this addon belongs to
- `addon_id` (BIGINT) - Reference to merchant menu addon (if applicable)
- `addon_name` (TEXT) - Addon name
- `addon_type` (TEXT) - `extra`, `remove`, `substitute`
- `addon_price` (NUMERIC) - Addon price
- `quantity` (INTEGER) - Quantity of addon
- `created_at` (TIMESTAMP) - When addon was added

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: All fields (immutable after order creation)

**Relationships**:
- References: `order_items.id`

---

## 🍕 **FOOD DELIVERY TABLES**

### 3. **`order_food_details`** - Food Order Details
**Purpose**: Service-specific details for food delivery orders.

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

### 4. **`order_food_items`** - Food Items (Legacy/Additional)
**Purpose**: Additional food items table (may be legacy, check if still used).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `item_name` (TEXT) - Item name
- `quantity` (INTEGER) - Quantity
- `unit_price`, `total_price` (NUMERIC) - Pricing
- `special_instructions` (TEXT) - Special instructions
- `created_at` (TIMESTAMP) - When added

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: All fields (immutable)

**Note**: This may be a legacy table. Check if `order_items` with `item_type = 'food_item'` is used instead.

---

## 📦 **PARCEL DELIVERY TABLES**

### 5. **`order_parcel_details`** - Parcel Order Details
**Purpose**: Service-specific details for parcel delivery orders.

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

### 6. **`parcel_tracking_events`** - Parcel Tracking Events
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

### 7. **`cod_collections`** - COD Collection Tracking
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

## 🚗 **RIDE BOOKING TABLES**

### 8. **`order_ride_details`** - Ride Order Details
**Purpose**: Service-specific details for ride booking orders.

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
- `return_pickup_address`, `return_pickup_lat`, `return_pickup_lon` (TEXT/DOUBLE PRECISION) - Return trip details
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

### 9. **`ride_fare_breakdown`** - Ride Fare Breakdown
**Purpose**: Detailed fare breakdown for ride orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id, UNIQUE) - One breakdown per ride
- `base_fare`, `distance_fare`, `time_fare` (NUMERIC) - Fare components
- `surge_multiplier` (NUMERIC) - Surge multiplier
- `surge_amount` (NUMERIC) - Surge amount
- `toll_charges`, `parking_charges`, `waiting_charges`, `night_charges` (NUMERIC) - Additional charges
- `gst_amount`, `discount_amount` (NUMERIC) - Tax and discount
- `total_fare` (NUMERIC) - Total fare
- `rider_earning` (NUMERIC) - Rider earning (after commission)
- `commission_amount` (NUMERIC) - Platform commission
- `created_at` (TIMESTAMP) - When breakdown calculated

**When to Update**:
- ✅ Auto-updated: All fields (by system when fare is calculated)
- 🔒 Never update: This is an **immutable fare record** - never update or delete

**Relationships**:
- References: `orders.id` (1:1 for ride orders)
- Used by: Fare calculation, rider earnings, financial reports

---

### 10. **`ride_routes`** - Ride Route Waypoints
**Purpose**: Tracks waypoints and route for ride orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `waypoint_order` (INTEGER) - 0 = pickup, 1+ = waypoints, last = drop
- `address` (TEXT) - Waypoint address
- `lat`, `lon` (DOUBLE PRECISION) - Waypoint coordinates
- `arrived_at`, `departed_at` (TIMESTAMP) - Arrival/departure times
- `waiting_time_seconds` (INTEGER) - Waiting time at waypoint
- `created_at` (TIMESTAMP) - When waypoint added

**When to Update**:
- ✅ Auto-updated: `arrived_at`, `departed_at`, `waiting_time_seconds` (by app/system)
- 🔒 Never update: `id`, `order_id`, `waypoint_order`, `address`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Route tracking, fare calculation (waiting charges)

---

## 🔗 **RELATIONSHIPS**

```
orders (1) ──→ (many) order_items
order_items (1) ──→ (many) order_item_addons
orders (1) ──→ (1) order_food_details (if order_type = 'food')
orders (1) ──→ (many) order_food_items (legacy)
orders (1) ──→ (1) order_parcel_details (if order_type = 'parcel')
orders (1) ──→ (many) parcel_tracking_events
orders (1) ──→ (many) cod_collections
orders (1) ──→ (1) order_ride_details (if order_type = 'ride')
orders (1) ──→ (1) ride_fare_breakdown
orders (1) ──→ (many) ride_routes
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `order_items` | Generic order items | Supports all order types, pricing, offers |
| `order_item_addons` | Item addons | Extra items, removals, substitutions |
| `order_food_details` | Food order details | Prep time, restaurant info |
| `order_food_items` | Food items (legacy) | May be legacy, check usage |
| `order_parcel_details` | Parcel order details | Dimensions, COD, insurance |
| `parcel_tracking_events` | Parcel tracking | Immutable tracking log |
| `cod_collections` | COD collection | COD tracking, bank deposits |
| `order_ride_details` | Ride order details | Passenger, fare, route |
| `ride_fare_breakdown` | Ride fare breakdown | Detailed fare components |
| `ride_routes` | Ride route waypoints | Waypoint tracking |

**Total**: 10 tables in Part 2

---

**Next**: See `DATABASE_SCHEMA_ORDERS_DOMAIN_PART3_ASSIGNMENTS_TIMELINE.md` for rider assignments and timeline.
