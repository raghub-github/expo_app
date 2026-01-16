# Merchant Domain - Part 2: Menu Management

## 📋 **MENU MANAGEMENT TABLES**

### 1. **`merchant_menu_categories`** - Menu Categories
**Purpose**: Categories for organizing menu items.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `category_name`, `category_description` (TEXT) - Category details
- `category_image_url` (TEXT) - Category image
- `display_order` (INTEGER) - Display order
- `is_active` (BOOLEAN) - Whether active
- `category_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `category_name`, `display_order`, `is_active` (by merchant)
- 🔒 Never update: `id`, `store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Referenced by: `merchant_menu_items.category_id`

---

### 2. **`merchant_menu_items`** - Menu Items
**Purpose**: Individual menu items (food items, products, etc.).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `category_id` (BIGINT, FK → merchant_menu_categories.id) - Category
- `item_id` (TEXT, UNIQUE) - Human-readable item ID
- `item_name`, `item_description` (TEXT) - Item details
- `item_image_url` (TEXT) - Item image
- `food_type` (TEXT) - `VEG`, `NON_VEG`, `VEGAN`, `EGG`
- `spice_level` (TEXT) - `MILD`, `MEDIUM`, `HOT`, `EXTRA_HOT`
- `cuisine_type` (TEXT) - Cuisine type
- `base_price`, `selling_price` (NUMERIC) - Pricing
- `discount_percentage`, `tax_percentage` (NUMERIC) - Discounts/tax
- `in_stock`, `available_quantity` (BOOLEAN/INTEGER) - Stock
- `low_stock_threshold` (INTEGER) - Low stock alert
- `has_customizations`, `has_addons`, `has_variants` (BOOLEAN) - Features
- `is_popular`, `is_recommended` (BOOLEAN) - Flags
- `preparation_time_minutes` (INTEGER) - Prep time
- `serves` (INTEGER) - Serves how many
- `display_order` (INTEGER) - Display order
- `is_active` (BOOLEAN) - Whether active
- `item_metadata` (JSONB) - Additional metadata
- `nutritional_info` (JSONB) - Nutritional information
- `allergens` (TEXT[]) - Allergen list
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `selling_price`, `in_stock`, `available_quantity`, `is_active` (by merchant)
- 🔒 Never update: `id`, `store_id`, `item_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`, `merchant_menu_categories.id`
- Referenced by: `merchant_menu_item_customizations`, `merchant_menu_item_variants`, `order_items.merchant_menu_item_id`

---

### 3. **`merchant_menu_item_customizations`** - Item Customizations
**Purpose**: Customization options for menu items (size, addons, variants).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customization_id` (TEXT, UNIQUE) - Human-readable ID
- `menu_item_id` (BIGINT, FK → merchant_menu_items.id)
- `customization_title` (TEXT) - Customization name
- `customization_type` (TEXT) - `SIZE`, `ADDON`, `VARIANT`, `OPTION`
- `is_required` (BOOLEAN) - Whether required
- `min_selection`, `max_selection` (INTEGER) - Selection limits
- `display_order` (INTEGER) - Display order
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `customization_title`, `is_required`, `min_selection`, `max_selection` (by merchant)
- 🔒 Never update: `id`, `menu_item_id`, `customization_id`, `created_at`

**Relationships**:
- References: `merchant_menu_items.id`
- Referenced by: `merchant_menu_item_addons.customization_id`

---

### 4. **`merchant_menu_item_addons`** - Item Addons
**Purpose**: Addon options for customizations (extra cheese, no onions, etc.).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `addon_id` (TEXT, UNIQUE) - Human-readable ID
- `customization_id` (BIGINT, FK → merchant_menu_item_customizations.id)
- `addon_name` (TEXT) - Addon name
- `addon_price` (NUMERIC) - Addon price
- `addon_image_url` (TEXT) - Addon image
- `in_stock` (BOOLEAN) - Whether in stock
- `display_order` (INTEGER) - Display order
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `addon_price`, `in_stock` (by merchant)
- 🔒 Never update: `id`, `customization_id`, `addon_id`, `created_at`

**Relationships**:
- References: `merchant_menu_item_customizations.id`
- Used by: Order item addons

---

### 5. **`merchant_menu_item_variants`** - Item Variants
**Purpose**: Variants for menu items (size, color, weight, etc.).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `variant_id` (TEXT, UNIQUE) - Human-readable ID
- `menu_item_id` (BIGINT, FK → merchant_menu_items.id)
- `variant_name` (TEXT) - Variant name
- `variant_type` (TEXT) - `SIZE`, `COLOR`, `WEIGHT`, `VOLUME`
- `variant_price` (NUMERIC) - Variant price
- `price_difference` (NUMERIC) - Difference from base price
- `in_stock`, `available_quantity` (BOOLEAN/INTEGER) - Stock
- `sku`, `barcode` (TEXT) - SKU/barcode
- `display_order` (INTEGER) - Display order
- `is_default` (BOOLEAN) - Whether default variant
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `variant_price`, `in_stock`, `available_quantity` (by merchant)
- 🔒 Never update: `id`, `menu_item_id`, `variant_id`, `created_at`

**Relationships**:
- References: `merchant_menu_items.id`
- Used by: Order items with variants

---

## 🎁 **OFFERS & PROMOTIONS TABLES**

### 6. **`merchant_offers`** - Merchant Offers
**Purpose**: Promotional offers for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `offer_id` (TEXT, UNIQUE) - Human-readable offer ID
- `store_id` (BIGINT, FK → merchant_stores.id)
- `offer_title`, `offer_description`, `offer_image_url`, `offer_terms` (TEXT) - Offer details
- `offer_type` (TEXT) - `PERCENTAGE`, `FLAT`, `BUY_X_GET_Y`, `FREE_DELIVERY`, `FREE_ITEM`
- `offer_sub_type` (TEXT) - `ALL_ORDERS`, `SPECIFIC_ITEMS`, `CATEGORY`, `FIRST_ORDER`
- `discount_value`, `discount_percentage`, `max_discount_amount` (NUMERIC) - Discount details
- `min_order_amount`, `max_order_amount` (NUMERIC) - Order limits
- `min_items` (INTEGER) - Minimum items
- `applicable_on_days` (day_of_week[]) - Applicable days
- `applicable_time_start`, `applicable_time_end` (TIME) - Time window
- `buy_quantity`, `get_quantity` (INTEGER) - Buy X Get Y
- `max_uses_total`, `max_uses_per_user` (INTEGER) - Usage limits
- `current_uses` (INTEGER) - Current usage count
- `valid_from`, `valid_till` (TIMESTAMP) - Validity period
- `is_active`, `is_featured` (BOOLEAN) - Status flags
- `display_priority` (INTEGER) - Display priority
- `offer_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed
- `created_by` (INTEGER) - Who created

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `current_uses` (when offer used)
- ⚠️ Manual update: `is_active`, `valid_till` (by merchant/admin)
- 🔒 Never update: `id`, `offer_id`, `store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Referenced by: `merchant_offer_applicability`

---

### 7. **`merchant_coupons`** - Merchant Coupons
**Purpose**: Coupon codes for stores or merchant parents.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `coupon_id` (TEXT, UNIQUE) - Human-readable coupon ID
- `store_id` (BIGINT, FK → merchant_stores.id) - Store-specific OR
- `parent_id` (BIGINT, FK → merchant_parents.id) - Parent-wide
- `coupon_code` (TEXT, UNIQUE) - Coupon code
- `coupon_description` (TEXT) - Description
- `coupon_type` (TEXT) - `PERCENTAGE`, `FLAT`, `FREE_DELIVERY`
- `discount_value`, `discount_percentage`, `max_discount_amount` (NUMERIC) - Discount
- `min_order_amount` (NUMERIC) - Minimum order
- `applicable_service_types` (service_type[]) - Applicable services
- `max_uses_total`, `max_uses_per_user` (INTEGER) - Usage limits
- `current_uses` (INTEGER) - Current usage
- `valid_from`, `valid_till` (TIMESTAMP) - Validity
- `is_active` (BOOLEAN) - Whether active
- `coupon_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `current_uses` (when coupon used)
- ⚠️ Manual update: `is_active`, `valid_till` (by merchant/admin)
- 🔒 Never update: `id`, `coupon_id`, `coupon_code`, `store_id`, `parent_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id` OR `merchant_parents.id` (one must be set)
- Used by: Order payments

**Note**: Constraint ensures either `store_id` OR `parent_id` is set, not both.

---

### 8. **`merchant_offer_applicability`** - Offer Applicability
**Purpose**: Maps offers to specific items or categories.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `offer_id` (BIGINT, FK → merchant_offers.id)
- `menu_item_id` (BIGINT, FK → merchant_menu_items.id) - Item-specific OR
- `category_id` (BIGINT, FK → merchant_menu_categories.id) - Category-specific OR
- `applicability_type` (TEXT) - `ITEM`, `CATEGORY`, `ALL`
- `created_at` (TIMESTAMP) - When created

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: All fields (immutable mapping)

**Relationships**:
- References: `merchant_offers.id`, `merchant_menu_items.id` (optional), `merchant_menu_categories.id` (optional)

**Note**: Constraint ensures either `menu_item_id`, `category_id`, or both are NULL (for `ALL` type).

---

## 🔗 **RELATIONSHIPS**

```
merchant_stores (1) ──→ (many) merchant_menu_categories
merchant_menu_categories (1) ──→ (many) merchant_menu_items
merchant_menu_items (1) ──→ (many) merchant_menu_item_customizations
merchant_menu_item_customizations (1) ──→ (many) merchant_menu_item_addons
merchant_menu_items (1) ──→ (many) merchant_menu_item_variants
merchant_stores (1) ──→ (many) merchant_offers
merchant_stores (1) ──→ (many) merchant_coupons
merchant_parents (1) ──→ (many) merchant_coupons
merchant_offers (1) ──→ (many) merchant_offer_applicability
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `merchant_menu_categories` | Menu categories | Organization, display order |
| `merchant_menu_items` | Menu items | Pricing, stock, variants, addons |
| `merchant_menu_item_customizations` | Customization options | Size, addon, variant options |
| `merchant_menu_item_addons` | Addon options | Extra items, pricing |
| `merchant_menu_item_variants` | Item variants | Size, color, weight variants |
| `merchant_offers` | Promotional offers | Discounts, validity, usage limits |
| `merchant_coupons` | Coupon codes | Store or parent-wide coupons |
| `merchant_offer_applicability` | Offer mapping | Item/category/ALL applicability |

**Total**: 8 tables in Part 2

---

**Next**: See `DATABASE_SCHEMA_MERCHANT_DOMAIN_PART3_OPERATIONS_FINANCIAL.md` for operations, financial, and access control tables.
