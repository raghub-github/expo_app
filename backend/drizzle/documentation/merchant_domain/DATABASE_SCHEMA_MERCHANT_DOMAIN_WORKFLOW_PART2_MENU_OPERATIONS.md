# Merchant Domain - Workflow Documentation
## Part 2: Menu Setup & Operations

This document continues from Part 1 and explains the menu setup, operations, and access management workflow.

---

## 📋 **WORKFLOW CONTINUATION**

After store is approved and active:
9. **Menu Categories** → `merchant_menu_categories`
10. **Menu Items** → `merchant_menu_items`
11. **Item Customizations** → `merchant_menu_item_customizations`
12. **Item Addons** → `merchant_menu_item_addons`
13. **Item Variants** → `merchant_menu_item_variants`
14. **Operating Hours** → `merchant_store_operating_hours`
15. **Availability** → `merchant_store_availability`
16. **Preparation Times** → `merchant_store_preparation_times`
17. **Offers** → `merchant_offers`
18. **Coupons** → `merchant_coupons`
19. **Offer Applicability** → `merchant_offer_applicability`

---

## 📋 **STEP 9: MENU CATEGORIES**

### **Table: `merchant_menu_categories`**

**When to Use**: After store is active - Merchant creates menu categories to organize items.

**Purpose**: Categories for organizing menu items (e.g., "Appetizers", "Main Course", "Desserts").

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
category_name               TEXT NOT NULL        -- Category name
category_description        TEXT                 -- Category description
category_image_url          TEXT                 -- Category image URL
display_order               INTEGER              -- Display order (for sorting)
is_active                   BOOLEAN              -- Whether category is active

-- Audit
category_metadata           JSONB                -- Additional metadata
created_at                  TIMESTAMP            -- Auto: When category created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant creates menu category (e.g., "Pizza", "Burgers")
2. System creates record in `merchant_menu_categories`
3. Merchant sets `display_order` to control category order in menu
4. Merchant can activate/deactivate categories

**Next Step**: After categories created, proceed to **Menu Items (Step 10)**

---

## 🍕 **STEP 10: MENU ITEMS**

### **Table: `merchant_menu_items`**

**When to Use**: After categories created - Merchant adds individual menu items.

**Purpose**: Individual menu items (food items, products, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
category_id                 BIGINT FK            -- References merchant_menu_categories.id
item_id                     TEXT UNIQUE          -- Human-readable item ID

-- Item Details
item_name                   TEXT NOT NULL        -- Item name
item_description            TEXT                 -- Item description
item_image_url              TEXT                 -- Item image URL

-- Classification
food_type                   TEXT                 -- 'VEG', 'NON_VEG', 'VEGAN', 'EGG'
spice_level                 TEXT                 -- 'MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT'
cuisine_type                TEXT                 -- Cuisine type

-- Pricing
base_price                  NUMERIC(10,2)        -- Base price
selling_price               NUMERIC(10,2)        -- Selling price (after discount)
discount_percentage         NUMERIC(5,2)         -- Discount percentage
tax_percentage              NUMERIC(5,2)         -- Tax percentage

-- Stock
in_stock                    BOOLEAN              -- Whether in stock
available_quantity           INTEGER              -- Available quantity
low_stock_threshold         INTEGER              -- Low stock alert threshold

-- Features
has_customizations          BOOLEAN              -- Whether has customizations
has_addons                  BOOLEAN              -- Whether has addons
has_variants                BOOLEAN              -- Whether has variants
is_popular                  BOOLEAN              -- Whether marked as popular
is_recommended              BOOLEAN              -- Whether recommended

-- Preparation
preparation_time_minutes     INTEGER              -- Preparation time in minutes
serves                      INTEGER              -- Serves how many people

-- Display
display_order               INTEGER              -- Display order within category
is_active                   BOOLEAN              -- Whether item is active

-- Additional
item_metadata               JSONB                -- Additional item metadata
nutritional_info             JSONB                -- Nutritional information
allergens                   TEXT[]               -- Array of allergens

-- Audit
created_at                  TIMESTAMP            -- Auto: When item created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant creates menu item (e.g., "Margherita Pizza")
2. System creates record in `merchant_menu_items` with:
   - `category_id` = selected category
   - `in_stock = TRUE`
   - `is_active = TRUE`
3. Merchant sets pricing, stock, preparation time
4. If item has customizations/variants/addons, set flags:
   - `has_customizations = TRUE`
   - `has_addons = TRUE`
   - `has_variants = TRUE`

**Next Step**: If item has customizations, proceed to **Item Customizations (Step 11)**

---

## 🎨 **STEP 11: ITEM CUSTOMIZATIONS**

### **Table: `merchant_menu_item_customizations`**

**When to Use**: After menu item created - If item has customization options (size, addons, etc.).

**Purpose**: Customization options for menu items (e.g., "Size", "Toppings", "Extras").

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
customization_id            TEXT UNIQUE          -- Human-readable ID
menu_item_id                BIGINT FK            -- References merchant_menu_items.id
customization_title         TEXT NOT NULL        -- Customization name (e.g., "Size")
customization_type          TEXT                 -- 'SIZE', 'ADDON', 'VARIANT', 'OPTION'
is_required                 BOOLEAN              -- Whether selection required
min_selection               INTEGER              -- Minimum selections required
max_selection               INTEGER              -- Maximum selections allowed
display_order               INTEGER              -- Display order

-- Audit
created_at                  TIMESTAMP            -- Auto: When customization created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant adds customization option (e.g., "Size: Small, Medium, Large")
2. System creates record in `merchant_menu_item_customizations`:
   - `customization_type = 'SIZE'`
   - `is_required = TRUE` (if mandatory)
   - `min_selection = 1`, `max_selection = 1`
3. Then merchant adds addon options (Step 12)

**Example**: Pizza item with customization "Size" → Small, Medium, Large variants

**Next Step**: After customizations, proceed to **Item Addons (Step 12)**

---

## ➕ **STEP 12: ITEM ADDONS**

### **Table: `merchant_menu_item_addons`**

**When to Use**: After customization created - Merchant adds addon options (extra cheese, no onions, etc.).

**Purpose**: Addon options for customizations (e.g., "Extra Cheese", "No Onions", "Extra Spicy").

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
addon_id                    TEXT UNIQUE          -- Human-readable ID
customization_id            BIGINT FK            -- References merchant_menu_item_customizations.id
addon_name                  TEXT NOT NULL        -- Addon name (e.g., "Extra Cheese")
addon_price                 NUMERIC(10,2)        -- Addon price (can be 0)
addon_image_url             TEXT                 -- Addon image URL
in_stock                    BOOLEAN              -- Whether in stock
display_order               INTEGER              -- Display order

-- Audit
created_at                  TIMESTAMP            -- Auto: When addon created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant adds addon option (e.g., "Extra Cheese" for customization "Toppings")
2. System creates record in `merchant_menu_item_addons`:
   - `customization_id` = customization ID
   - `addon_price = 50.00` (if extra charge)
   - `in_stock = TRUE`
3. Multiple addons can be added to one customization

**Example**: 
- Customization: "Toppings"
  - Addon: "Extra Cheese" (₹50)
  - Addon: "Mushrooms" (₹30)
  - Addon: "Olives" (₹20)

**Next Step**: If item has variants, proceed to **Item Variants (Step 13)**

---

## 🔄 **STEP 13: ITEM VARIANTS**

### **Table: `merchant_menu_item_variants`**

**When to Use**: After menu item created - If item has variants (size, color, weight, etc.).

**Purpose**: Variants for menu items (e.g., "Small", "Medium", "Large" sizes with different prices).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
variant_id                  TEXT UNIQUE          -- Human-readable ID
menu_item_id                BIGINT FK            -- References merchant_menu_items.id
variant_name                TEXT NOT NULL        -- Variant name (e.g., "Large")
variant_type                TEXT                 -- 'SIZE', 'COLOR', 'WEIGHT', 'VOLUME'
variant_price               NUMERIC(10,2)        -- Variant price
price_difference            NUMERIC(10,2)        -- Difference from base price
in_stock                    BOOLEAN              -- Whether in stock
available_quantity           INTEGER              -- Available quantity
sku                         TEXT                 -- SKU code
barcode                     TEXT                 -- Barcode
display_order               INTEGER              -- Display order
is_default                  BOOLEAN              -- Whether default variant

-- Audit
created_at                  TIMESTAMP            -- Auto: When variant created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant adds variant (e.g., "Large" size for pizza)
2. System creates record in `merchant_menu_item_variants`:
   - `variant_type = 'SIZE'`
   - `variant_price = 599.00` (Large pizza price)
   - `price_difference = 200.00` (difference from base ₹399)
   - `is_default = FALSE` (unless it's the default)
3. Multiple variants can be added (Small, Medium, Large)

**Example**:
- Base Item: "Margherita Pizza" (₹399)
  - Variant: "Small" (₹299, price_difference = -100)
  - Variant: "Medium" (₹399, price_difference = 0, is_default = TRUE)
  - Variant: "Large" (₹599, price_difference = 200)

**Next Step**: After menu setup, proceed to **Operating Hours (Step 14)**

---

## ⏰ **STEP 14: OPERATING HOURS**

### **Table: `merchant_store_operating_hours`**

**When to Use**: After menu setup - Merchant sets store operating hours.

**Purpose**: Store operating hours by day of week.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
day_of_week                 ENUM                 -- 'MONDAY', 'TUESDAY', ..., 'SUNDAY'
is_open                      BOOLEAN              -- Whether open on this day
slot1_start                  TIME                 -- First slot start time (e.g., '09:00:00')
slot1_end                    TIME                 -- First slot end time (e.g., '14:00:00')
slot2_start                  TIME                 -- Second slot start time (e.g., '17:00:00')
slot2_end                    TIME                 -- Second slot end time (e.g., '22:00:00')
total_duration_minutes       INTEGER              -- Total duration in minutes
is_24_hours                  BOOLEAN              -- Whether 24/7
same_for_all_days            BOOLEAN              -- Whether same hours for all days

-- Audit
created_at                  TIMESTAMP            -- Auto: When hours set
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant sets operating hours for each day
2. System creates records in `merchant_store_operating_hours` (one per day):
   - Monday: `slot1_start = '09:00'`, `slot1_end = '14:00'`, `slot2_start = '17:00'`, `slot2_end = '22:00'`
   - Tuesday: Same or different
   - etc.
3. If `is_24_hours = TRUE`, slots are ignored
4. If `same_for_all_days = TRUE`, merchant sets once and applies to all days

**Unique Constraint**: One record per `(store_id, day_of_week)`.

**Next Step**: After operating hours, proceed to **Availability (Step 15)**

---

## 🟢 **STEP 15: AVAILABILITY**

### **Table: `merchant_store_availability`**

**When to Use**: After operating hours set - Real-time availability management.

**Purpose**: Real-time availability status for stores (whether accepting orders, current load, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK UNIQUE     -- One record per store
is_available                BOOLEAN              -- Whether store is available
is_accepting_orders          BOOLEAN              -- Whether accepting orders
unavailable_reason           TEXT                 -- Reason if unavailable
auto_unavailable_at          TIMESTAMP            -- Auto-unavailable time
auto_available_at            TIMESTAMP            -- Auto-available time
current_pending_orders       INTEGER              -- Current pending orders count
max_concurrent_orders        INTEGER              -- Maximum concurrent orders
updated_by                   TEXT                 -- Who updated ('MERCHANT', 'SYSTEM', 'ADMIN')
updated_by_id                INTEGER              -- ID of who updated

-- Audit
created_at                  TIMESTAMP            -- Auto: When availability record created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. System creates one record per store (1:1 relationship)
2. Merchant can toggle availability:
   - `is_available = TRUE/FALSE`
   - `is_accepting_orders = TRUE/FALSE`
3. System auto-updates `current_pending_orders` when orders change
4. If `current_pending_orders >= max_concurrent_orders`, system can auto-set `is_accepting_orders = FALSE`

**Next Step**: After availability set, proceed to **Preparation Times (Step 16)**

---

## ⏱️ **STEP 16: PREPARATION TIMES**

### **Table: `merchant_store_preparation_times`**

**When to Use**: After availability set - Merchant configures preparation times.

**Purpose**: Preparation time configuration per service/category/item.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
config_type                 TEXT                 -- 'SERVICE', 'CATEGORY', 'ITEM', 'DEFAULT'
service_type                ENUM                 -- Service type (if config_type = 'SERVICE')
category_id                 BIGINT FK            -- Category ID (if config_type = 'CATEGORY')
menu_item_id                BIGINT FK            -- Item ID (if config_type = 'ITEM')
preparation_time_minutes     INTEGER              -- Preparation time in minutes
applicable_time_start        TIME                 -- Applicable time window start
applicable_time_end          TIME                 -- Applicable time window end
applicable_days              day_of_week[]        -- Applicable days array
priority                     INTEGER              -- Priority (higher = more specific)

-- Audit
created_at                  TIMESTAMP            -- Auto: When prep time set
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant sets preparation times at different levels:
   - **DEFAULT**: Default prep time for all items (e.g., 30 minutes)
   - **SERVICE**: Prep time per service (Food: 30 min, Parcel: 15 min)
   - **CATEGORY**: Prep time per category (Pizza: 25 min, Pasta: 20 min)
   - **ITEM**: Prep time per item (specific pizza: 35 min)
2. System uses most specific configuration (highest priority)
3. Can set time-based prep times (peak hours: 40 min, off-peak: 25 min)

**Priority Logic**: Item > Category > Service > Default

**Next Step**: After prep times, proceed to **Offers (Step 17)**

---

## 🎁 **STEP 17: OFFERS**

### **Table: `merchant_offers`**

**When to Use**: After menu setup - Merchant creates promotional offers.

**Purpose**: Promotional offers for stores (discounts, buy X get Y, free delivery, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
offer_id                    TEXT UNIQUE          -- Human-readable offer ID
store_id                    BIGINT FK            -- References merchant_stores.id

-- Offer Details
offer_title                 TEXT NOT NULL        -- Offer title
offer_description           TEXT                 -- Offer description
offer_image_url             TEXT                 -- Offer image URL
offer_terms                 TEXT                 -- Terms and conditions

-- Offer Type
offer_type                  TEXT                 -- 'PERCENTAGE', 'FLAT', 'BUY_X_GET_Y', 'FREE_DELIVERY', 'FREE_ITEM'
offer_sub_type              TEXT                 -- 'ALL_ORDERS', 'SPECIFIC_ITEMS', 'CATEGORY', 'FIRST_ORDER'

-- Discount Details
discount_value              NUMERIC(10,2)        -- Flat discount amount
discount_percentage         NUMERIC(5,2)         -- Percentage discount
max_discount_amount         NUMERIC(10,2)        -- Maximum discount cap

-- Conditions
min_order_amount            NUMERIC(10,2)        -- Minimum order amount
max_order_amount            NUMERIC(10,2)        -- Maximum order amount
min_items                   INTEGER              -- Minimum items required
applicable_on_days          day_of_week[]        -- Applicable days
applicable_time_start       TIME                 -- Applicable time start
applicable_time_end         TIME                 -- Applicable time end

-- Buy X Get Y
buy_quantity                INTEGER              -- Buy quantity
get_quantity                INTEGER              -- Get quantity

-- Usage Limits
max_uses_total              INTEGER              -- Maximum total uses
max_uses_per_user           INTEGER              -- Maximum uses per user
current_uses                 INTEGER              -- Current usage count

-- Validity
valid_from                  TIMESTAMP            -- Offer valid from
valid_till                  TIMESTAMP            -- Offer valid till
is_active                   BOOLEAN              -- Whether offer is active
is_featured                 BOOLEAN              -- Whether featured offer
display_priority            INTEGER              -- Display priority

-- Audit
offer_metadata              JSONB                -- Additional metadata
created_at                  TIMESTAMP            -- Auto: When offer created
updated_at                  TIMESTAMP            -- Auto: Last update time
created_by                  INTEGER              -- Who created
```

**What Happens**:
1. Merchant creates offer (e.g., "50% OFF on orders above ₹500")
2. System creates record in `merchant_offers`:
   - `offer_type = 'PERCENTAGE'`
   - `discount_percentage = 50.00`
   - `min_order_amount = 500.00`
   - `valid_from = '2024-01-01'`, `valid_till = '2024-01-31'`
3. System auto-updates `current_uses` when offer is used
4. If `current_uses >= max_uses_total`, offer becomes inactive

**Next Step**: After offer created, proceed to **Offer Applicability (Step 19)** or **Coupons (Step 18)**

---

## 🎫 **STEP 18: COUPONS**

### **Table: `merchant_coupons`**

**When to Use**: After offers - Merchant creates coupon codes.

**Purpose**: Coupon codes for stores or merchant parents (can be store-specific or parent-wide).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
coupon_id                   TEXT UNIQUE          -- Human-readable coupon ID
store_id                    BIGINT FK            -- Store-specific OR
parent_id                   BIGINT FK            -- Parent-wide (one must be set)
coupon_code                 TEXT UNIQUE          -- Coupon code (e.g., "SAVE50")
coupon_description          TEXT                 -- Coupon description

-- Coupon Type
coupon_type                 TEXT                 -- 'PERCENTAGE', 'FLAT', 'FREE_DELIVERY'
discount_value              NUMERIC(10,2)        -- Flat discount
discount_percentage         NUMERIC(5,2)         -- Percentage discount
max_discount_amount         NUMERIC(10,2)        -- Maximum discount cap

-- Conditions
min_order_amount            NUMERIC(10,2)        -- Minimum order amount
applicable_service_types     service_type[]       -- Applicable services

-- Usage Limits
max_uses_total              INTEGER              -- Maximum total uses
max_uses_per_user           INTEGER              -- Maximum uses per user
current_uses                 INTEGER              -- Current usage count

-- Validity
valid_from                  TIMESTAMP            -- Valid from
valid_till                  TIMESTAMP            -- Valid till
is_active                   BOOLEAN              -- Whether active

-- Audit
coupon_metadata             JSONB                -- Additional metadata
created_at                  TIMESTAMP            -- Auto: When coupon created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant creates coupon code (e.g., "WELCOME50")
2. System creates record in `merchant_coupons`:
   - `coupon_code = 'WELCOME50'`
   - `coupon_type = 'PERCENTAGE'`
   - `discount_percentage = 50.00`
   - `min_order_amount = 200.00`
3. Customer enters coupon code at checkout
4. System validates and applies discount
5. System auto-updates `current_uses`

**Constraint**: Either `store_id` OR `parent_id` must be set (not both).

**Next Step**: After coupons, proceed to **Offer Applicability (Step 19)**

---

## 🎯 **STEP 19: OFFER APPLICABILITY**

### **Table: `merchant_offer_applicability`**

**When to Use**: After offer created - Maps offer to specific items or categories.

**Purpose**: Maps offers to specific menu items or categories (or ALL items).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
offer_id                    BIGINT FK            -- References merchant_offers.id
menu_item_id                BIGINT FK            -- Item-specific OR
category_id                 BIGINT FK            -- Category-specific OR
applicability_type           TEXT                 -- 'ITEM', 'CATEGORY', 'ALL'

-- Audit
created_at                  TIMESTAMP            -- Auto: When mapping created
```

**What Happens**:
1. Merchant selects which items/categories the offer applies to
2. System creates records in `merchant_offer_applicability`:
   - If offer applies to specific item: `menu_item_id = item_id`, `applicability_type = 'ITEM'`
   - If offer applies to category: `category_id = category_id`, `applicability_type = 'CATEGORY'`
   - If offer applies to all: `applicability_type = 'ALL'`, both IDs NULL
3. Multiple records can be created (one per item/category)

**Constraint**: Either `menu_item_id`, `category_id`, or both NULL (for 'ALL' type).

**Example**:
- Offer: "20% OFF on Pizzas"
  - Record 1: `category_id = pizza_category_id`, `applicability_type = 'CATEGORY'`
- Offer: "Buy 1 Get 1 on Margherita Pizza"
  - Record 1: `menu_item_id = margherita_pizza_id`, `applicability_type = 'ITEM'`

---

## 🔗 **RELATIONSHIPS IN MENU & OPERATIONS FLOW**

```
merchant_stores (1)
    ↓
    ├─→ merchant_menu_categories (many)
    │       ↓
    │       └─→ merchant_menu_items (many)
    │               ↓
    │               ├─→ merchant_menu_item_customizations (many)
    │               │       ↓
    │               │       └─→ merchant_menu_item_addons (many)
    │               └─→ merchant_menu_item_variants (many)
    │
    ├─→ merchant_store_operating_hours (many, one per day)
    ├─→ merchant_store_availability (1:1)
    ├─→ merchant_store_preparation_times (many)
    ├─→ merchant_offers (many)
    │       ↓
    │       └─→ merchant_offer_applicability (many)
    └─→ merchant_coupons (many)
```

---

## 📝 **SUMMARY: MENU & OPERATIONS TABLES**

| Step | Table | Purpose | Key Fields |
|------|-------|---------|------------|
| 9 | `merchant_menu_categories` | Menu categories | `category_name`, `display_order` |
| 10 | `merchant_menu_items` | Menu items | `item_name`, `selling_price`, `in_stock` |
| 11 | `merchant_menu_item_customizations` | Customizations | `customization_title`, `customization_type` |
| 12 | `merchant_menu_item_addons` | Addons | `addon_name`, `addon_price` |
| 13 | `merchant_menu_item_variants` | Variants | `variant_name`, `variant_price` |
| 14 | `merchant_store_operating_hours` | Operating hours | `day_of_week`, `slot1_start`, `slot1_end` |
| 15 | `merchant_store_availability` | Availability | `is_available`, `is_accepting_orders` |
| 16 | `merchant_store_preparation_times` | Prep times | `preparation_time_minutes`, `config_type` |
| 17 | `merchant_offers` | Offers | `offer_type`, `discount_percentage`, `valid_till` |
| 18 | `merchant_coupons` | Coupons | `coupon_code`, `coupon_type`, `valid_till` |
| 19 | `merchant_offer_applicability` | Offer mapping | `offer_id`, `menu_item_id`, `category_id` |

**Total Tables in Part 2**: 11 tables

---

**Next**: See `DATABASE_SCHEMA_MERCHANT_DOMAIN_WORKFLOW_PART3_FINANCIAL_ACCESS.md` for financial operations, access management, and ongoing operations.
