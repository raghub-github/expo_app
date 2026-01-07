# Customer Domain - Part 2: Addresses & Preferences

## 📍 **ADDRESS & LOCATION TABLES**

### 1. **`customer_addresses`** - Delivery Addresses
**Purpose**: Stores all delivery addresses for customers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `address_id` (TEXT, UNIQUE) - Human-readable address ID
- `label` (ENUM) - `HOME`, `WORK`, `OTHER`
- `custom_label` (TEXT) - Custom label if label is 'OTHER'
- `address_line1`, `address_line2` (TEXT) - Address lines
- `address_auto` (TEXT) - Google Maps formatted address
- `address_manual` (TEXT) - User-typed address
- `landmark` (TEXT) - Nearby landmark
- `city`, `state`, `postal_code`, `country` (TEXT) - Location details
- `latitude`, `longitude` (NUMERIC) - GPS coordinates
- `is_delivery_address`, `is_pickup_address` (BOOLEAN) - Address type flags
- `contact_name`, `contact_mobile` (TEXT) - Contact person for delivery
- `delivery_instructions` (TEXT) - Special delivery instructions
- `access_code`, `floor_number` (TEXT) - Access details
- `is_default` (BOOLEAN) - Whether this is the default address
- `is_verified` (BOOLEAN) - Whether address is verified
- `is_active` (BOOLEAN) - Whether address is active
- `order_count` (INTEGER) - Number of orders to this address
- `last_used_at` (TIMESTAMP) - When address was last used
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed
- `deleted_at` (TIMESTAMP) - Soft delete

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `order_count`, `last_used_at` (on order creation)
- ⚠️ Manual update: All address fields, `is_default`, `is_active` (by customer)
- 🔒 Never update: `id`, `customer_id`, `address_id`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Order creation, delivery assignment

**Note**: Only one address can be `is_default = TRUE` per customer (enforced by trigger).

---

### 2. **`customer_address_history`** - Address Change History
**Purpose**: Immutable audit trail of address changes.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `address_id` (BIGINT, FK → customer_addresses.id)
- `customer_id` (BIGINT, FK → customers.id)
- `address_snapshot` (JSONB) - Complete address snapshot at time of change
- `change_type` (TEXT) - `CREATE`, `UPDATE`, `DELETE`
- `changed_fields` (TEXT[]) - Array of field names that changed
- `created_at` (TIMESTAMP) - When change occurred

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- References: `customer_addresses.id`, `customers.id`
- Used by: Audit reports, compliance

---

### 3. **`customer_contacts`** - Emergency Contacts
**Purpose**: Stores family, friends, and emergency contacts.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `contact_name` (TEXT) - Contact person name
- `contact_mobile` (TEXT) - Contact mobile number
- `contact_email` (TEXT) - Contact email (optional)
- `relation` (TEXT) - `FAMILY`, `FRIEND`, `COLLEAGUE`, `EMERGENCY`
- `relation_detail` (TEXT) - `SPOUSE`, `PARENT`, `SIBLING`, `CHILD`
- `is_emergency_contact` (BOOLEAN) - Whether this is emergency contact
- `is_verified` (BOOLEAN) - Whether contact is verified
- `verified_at` (TIMESTAMP) - When verified
- `is_active` (BOOLEAN) - Whether contact is active
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: All fields (by customer)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Emergency contact system, order delivery

---

### 4. **`customer_saved_locations`** - Saved Locations
**Purpose**: Stores frequently used locations (home, work, favorites).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `location_name` (TEXT) - Location name (e.g., "Home", "Office")
- `location_type` (TEXT) - `HOME`, `WORK`, `FAVORITE`, `RECENT`
- `formatted_address` (TEXT) - Full formatted address
- `latitude`, `longitude` (NUMERIC) - GPS coordinates
- `usage_count` (INTEGER) - How many times location was used
- `last_used_at` (TIMESTAMP) - When location was last used
- `is_favorite` (BOOLEAN) - Whether location is favorited
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `usage_count`, `last_used_at`, `updated_at` (on usage)
- ⚠️ Manual update: `location_name`, `is_favorite` (by customer)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Quick address selection in app

---

## ⚙️ **PREFERENCES & SETTINGS TABLES**

### 5. **`customer_preferences`** - Service Preferences
**Purpose**: Stores customer preferences for services, delivery, and payments.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One preference record per customer
- `default_service` (ENUM) - `FOOD`, `PARCEL`, `RIDE` (default service type)
- `contact_less_delivery_default` (BOOLEAN) - Default contactless delivery preference
- `leave_at_door_default` (BOOLEAN) - Default leave at door preference
- `preferred_payment_method` (ENUM) - Preferred payment method
- `auto_apply_wallet` (BOOLEAN) - Whether to auto-apply wallet balance
- `save_delivery_instructions` (BOOLEAN) - Whether to save delivery instructions
- `reorder_favorites` (BOOLEAN) - Whether to show reorder favorites
- `allow_calls`, `allow_sms`, `allow_whatsapp` (BOOLEAN) - Communication preferences
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: All preference fields (by customer in app)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)
- Used by: Order creation defaults, payment processing

---

### 6. **`customer_notification_preferences`** - Notification Settings
**Purpose**: Customer preferences for notification types and channels.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One preference record per customer
- `order_updates`, `promotional_notifications`, `offer_notifications`, `loyalty_notifications` (BOOLEAN) - Notification type preferences
- `push_notifications`, `email_notifications`, `sms_notifications`, `whatsapp_notifications` (BOOLEAN) - Channel preferences
- `quiet_hours_enabled` (BOOLEAN) - Whether quiet hours are enabled
- `quiet_hours_start`, `quiet_hours_end` (TIME) - Quiet hours time range
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: All notification preferences (by customer)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)
- Used by: Notification system to respect preferences

---

### 7. **`customer_privacy_settings`** - Privacy & GDPR Settings
**Purpose**: Privacy controls and GDPR consent management.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One privacy record per customer
- `share_location` (BOOLEAN) - Whether to share location with riders
- `share_profile_with_riders` (BOOLEAN) - Whether to share profile with riders
- `show_order_history` (BOOLEAN) - Whether to show order history
- `marketing_consent` (BOOLEAN) - Marketing communication consent
- `marketing_consent_date` (TIMESTAMP) - When consent was given
- `share_data_with_partners` (BOOLEAN) - Whether to share data with partners
- `gdpr_consent` (BOOLEAN) - GDPR consent
- `gdpr_consent_date` (TIMESTAMP) - When GDPR consent was given
- `data_processing_consent` (BOOLEAN) - Data processing consent
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `marketing_consent_date`, `gdpr_consent_date` (when consent changes)
- ⚠️ Manual update: All privacy settings (by customer)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)
- Used by: GDPR compliance, privacy controls

**Note**: Consent dates are important for GDPR compliance and audit trails.

---

## 🔗 **RELATIONSHIPS**

```
customers (1) ──→ (many) customer_addresses
customer_addresses (1) ──→ (many) customer_address_history
customers (1) ──→ (many) customer_contacts
customers (1) ──→ (many) customer_saved_locations
customers (1) ──→ (1) customer_preferences
customers (1) ──→ (1) customer_notification_preferences
customers (1) ──→ (1) customer_privacy_settings
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `customer_addresses` | Delivery addresses | Multiple addresses, default address, usage tracking |
| `customer_address_history` | Address audit trail | Immutable change history |
| `customer_contacts` | Emergency contacts | Family, friends, emergency contacts |
| `customer_saved_locations` | Saved locations | Home, work, favorites |
| `customer_preferences` | Service preferences | Default service, delivery, payment preferences |
| `customer_notification_preferences` | Notification settings | Notification types, channels, quiet hours |
| `customer_privacy_settings` | Privacy controls | GDPR consent, data sharing preferences |

**Total**: 7 tables in Part 2

---

**Next**: See `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART3_WALLET_PAYMENTS.md` for wallet and payment tables.
