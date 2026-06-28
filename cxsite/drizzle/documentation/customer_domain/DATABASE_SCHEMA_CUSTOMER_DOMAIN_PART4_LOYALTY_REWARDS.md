# Customer Domain - Part 4: Loyalty & Rewards

## 🎁 **LOYALTY & REWARDS TABLES**

### 1. **`customer_loyalty`** - Loyalty Program Status
**Purpose**: Tracks customer loyalty tier, points, and achievements.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One loyalty record per customer
- `loyalty_tier` (ENUM) - `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND`
- `tier_updated_at` (TIMESTAMP) - When tier was last updated
- `total_orders` (INTEGER) - Total orders across all services
- `food_orders_count`, `parcel_orders_count`, `ride_orders_count` (INTEGER) - Service-specific counts
- `total_spent` (NUMERIC) - Total amount spent
- `food_spent`, `parcel_spent`, `ride_spent` (NUMERIC) - Service-specific spending
- `reward_points_earned`, `reward_points_redeemed`, `reward_points_balance` (INTEGER) - Points tracking
- `current_order_streak`, `longest_order_streak` (INTEGER) - Order streak tracking
- `streak_last_order_date` (DATE) - Last order date for streak calculation
- `achievements` (TEXT[]) - Array of achievement badges
- `badges` (TEXT[]) - Array of badge names
- `tier_benefits` (JSONB) - Tier-specific benefits
- `last_order_date` (DATE) - Date of last order
- `last_updated_at`, `created_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: All metrics (by trigger/system on order completion)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)
- Used by: Loyalty program, tier upgrades, benefits calculation

**Note**: Tier is automatically calculated based on total_spent and total_orders.

---

### 2. **`customer_reward_transactions`** - Reward Points Ledger
**Purpose**: Immutable ledger of all reward point transactions.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `transaction_type` (TEXT) - `EARN`, `REDEEM`, `EXPIRE`, `ADJUSTMENT`
- `points` (INTEGER) - Points amount (positive for earn, negative for redeem)
- `balance_before` (INTEGER) - Points balance before transaction
- `balance_after` (INTEGER) - Points balance after transaction
- `reference_id` (TEXT) - Reference ID (order_id, referral_id, etc.)
- `reference_type` (TEXT) - `ORDER`, `REFERRAL`, `SIGNUP_BONUS`, `MANUAL`
- `description` (TEXT) - Human-readable description
- `expires_at` (TIMESTAMP) - When points expire (if applicable)
- `created_at` (TIMESTAMP) - When transaction occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system when transaction occurs)
- 🔒 Never update: This is an **immutable ledger** - never update or delete

**Relationships**:
- References: `customers.id`
- Used by: Points balance calculation, expiry tracking

---

### 3. **`customer_coupons`** - Customer Coupons
**Purpose**: Stores coupons assigned to customers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `coupon_code` (TEXT) - Coupon code
- `coupon_title`, `coupon_description` (TEXT) - Coupon details
- `coupon_type` (TEXT) - `PERCENTAGE`, `FLAT`, `FREE_DELIVERY`, `CASHBACK`
- `discount_value` (NUMERIC) - Flat discount amount
- `discount_percentage` (NUMERIC) - Percentage discount
- `max_discount_amount` (NUMERIC) - Maximum discount cap
- `min_order_amount` (NUMERIC) - Minimum order amount required
- `applicable_services` (ENUM[]) - Array of service types
- `applicable_merchant_ids` (BIGINT[]) - Array of merchant IDs (NULL = all merchants)
- `usage_limit` (INTEGER) - Maximum usage count (default: 1)
- `used_count` (INTEGER) - Current usage count
- `valid_from`, `valid_till` (TIMESTAMP) - Validity period
- `status` (ENUM) - `ACTIVE`, `USED`, `EXPIRED`, `CANCELLED`
- `coupon_source` (TEXT) - `SIGNUP`, `REFERRAL`, `LOYALTY`, `PROMOTION`, `COMPENSATION`
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `used_count`, `status` (when coupon is used), `updated_at`
- ⚠️ Manual update: `status` (by admin for cancellation)
- 🔒 Never update: `id`, `customer_id`, `coupon_code`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Order discount application, coupon validation

---

### 4. **`customer_coupon_usage`** - Coupon Usage History
**Purpose**: Tracks when and how coupons were used.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `customer_coupon_id` (BIGINT, FK → customer_coupons.id) - Coupon used
- `order_id` (BIGINT, FK → orders.id) - Order where coupon was used
- `coupon_code` (TEXT) - Coupon code (snapshot)
- `discount_applied` (NUMERIC) - Discount amount applied
- `order_amount` (NUMERIC) - Order amount before discount
- `created_at` (TIMESTAMP) - When coupon was used

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable usage log** - never update or delete

**Relationships**:
- References: `customers.id`, `customer_coupons.id`, `orders.id`
- Used by: Coupon analytics, usage reports

---

### 5. **`customer_ratings_given`** - Ratings & Reviews Given
**Purpose**: Ratings and reviews given by customers to merchants/riders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id) - Order for which rating was given
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`
- `target_type` (TEXT) - `MERCHANT`, `RIDER`, `DRIVER`, `PLATFORM`
- `target_id` (BIGINT) - ID of rated entity
- `overall_rating` (SMALLINT) - Overall rating (1-5)
- `food_quality_rating`, `delivery_rating`, `packaging_rating` (SMALLINT) - Category ratings
- `review_title`, `review_text` (TEXT) - Review content
- `review_images` (TEXT[]) - Array of image URLs
- `review_tags` (TEXT[]) - Tags like `FRESH`, `HOT`, `LATE`, `COLD`, `DAMAGED`
- `helpful_count`, `not_helpful_count` (INTEGER) - Helpfulness votes
- `merchant_response` (TEXT) - Merchant's response to review
- `merchant_responded_at` (TIMESTAMP) - When merchant responded
- `is_verified` (BOOLEAN) - Whether review is verified (order confirmed)
- `is_featured` (BOOLEAN) - Whether review is featured
- `is_flagged` (BOOLEAN) - Whether review is flagged for moderation
- `flag_reason` (TEXT) - Reason for flagging
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `helpful_count`, `not_helpful_count` (on votes), `updated_at`
- ⚠️ Manual update: `merchant_response`, `is_featured`, `is_flagged` (by merchant/admin)
- 🔒 Never update: `id`, `customer_id`, `order_id`, `overall_rating`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`
- Used by: Merchant ratings, review display, analytics

---

### 6. **`customer_ratings_received`** - Ratings Received (Ride Service)
**Purpose**: Ratings received by customers as passengers in ride service.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id)
- `rider_id` (INTEGER, FK → riders.id)
- `rating` (SMALLINT) - Overall rating (1-5)
- `comment` (TEXT) - Optional comment
- `behavior_rating`, `punctuality_rating` (SMALLINT) - Category ratings
- `created_at` (TIMESTAMP) - When rating was given

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable rating** - never update or delete

**Relationships**:
- References: `customers.id`, `orders.id`, `riders.id`
- Used by: Customer reputation, ride service analytics

---

### 7. **`customer_review_helpfulness`** - Review Helpfulness Votes
**Purpose**: Tracks helpful/not helpful votes on reviews.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `review_id` (BIGINT, FK → customer_ratings_given.id)
- `voted_by_customer_id` (BIGINT, FK → customers.id)
- `is_helpful` (BOOLEAN) - TRUE = helpful, FALSE = not helpful
- `created_at` (TIMESTAMP) - When vote was cast

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable vote** - never update or delete

**Relationships**:
- References: `customer_ratings_given.id`, `customers.id`
- Used by: Review ranking, helpfulness calculation

**Note**: Unique constraint on `(review_id, voted_by_customer_id)` - one vote per customer per review.

---

### 8. **`customer_favorites`** - Favorite Merchants/Items
**Purpose**: Stores customer's favorite merchants, menu items, and routes.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `favorite_type` (TEXT) - `MERCHANT`, `MENU_ITEM`, `ROUTE`, `LOCATION`
- `merchant_store_id` (BIGINT, FK → merchant_stores.id) - If favorite is merchant
- `menu_item_id` (BIGINT, FK → merchant_menu_items.id) - If favorite is menu item
- `route_name` (TEXT) - Route name (for ride service)
- `route_from_lat`, `route_from_lon` (NUMERIC) - Route start coordinates
- `route_to_lat`, `route_to_lon` (NUMERIC) - Route end coordinates
- `order_count` (INTEGER) - Number of orders from this favorite
- `last_ordered_at` (TIMESTAMP) - When last ordered from this favorite
- `created_at` (TIMESTAMP) - When favorite was added

**When to Update**:
- ✅ Auto-updated: `order_count`, `last_ordered_at` (on order creation)
- ⚠️ Manual update: Favorite can be removed (delete record)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id`, `merchant_stores.id`, `merchant_menu_items.id`
- Used by: Quick reorder, personalized recommendations

**Note**: Constraint ensures at least one target field is set based on favorite_type.

---

## 🔗 **RELATIONSHIPS**

```
customers (1) ──→ (1) customer_loyalty
customers (1) ──→ (many) customer_reward_transactions
customers (1) ──→ (many) customer_coupons
customers (1) ──→ (many) customer_coupon_usage
customers (1) ──→ (many) customer_ratings_given
customers (1) ──→ (many) customer_ratings_received
customers (1) ──→ (many) customer_review_helpfulness
customers (1) ──→ (many) customer_favorites
customer_ratings_given (1) ──→ (many) customer_review_helpfulness
orders (1) ──→ (many) customer_coupon_usage
orders (1) ──→ (many) customer_ratings_given
orders (1) ──→ (many) customer_ratings_received
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `customer_loyalty` | Loyalty program | Tier tracking, points, streaks, achievements |
| `customer_reward_transactions` | Points ledger | Immutable points transaction history |
| `customer_coupons` | Customer coupons | Discount coupons, validity, usage limits |
| `customer_coupon_usage` | Coupon usage log | Immutable usage history |
| `customer_ratings_given` | Reviews given | Ratings, reviews, merchant responses |
| `customer_ratings_received` | Ratings received | Passenger ratings in ride service |
| `customer_review_helpfulness` | Review votes | Helpful/not helpful votes |
| `customer_favorites` | Favorites | Favorite merchants, items, routes |

**Total**: 8 tables in Part 4

---

**Next**: See `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART5_SUPPORT_ANALYTICS.md` for support and analytics tables.
