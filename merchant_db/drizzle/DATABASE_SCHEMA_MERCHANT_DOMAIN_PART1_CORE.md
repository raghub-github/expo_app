# Merchant Domain - Part 1: Core Merchant Structure

## 🏪 **MERCHANT DOMAIN OVERVIEW**

The Merchant Domain manages:
- Merchant parents (brands/chains)
- Merchant stores (individual outlets)
- Menu management (categories, items, variants, addons)
- Offers, coupons, promotions
- Payouts, settlements, commissions
- Verification, documents, compliance
- Store operations, availability, holidays

**Total Tables**: 30+ tables

---

## 🏢 **CORE MERCHANT TABLES**

### 1. **`merchant_parents`** - Merchant Parents (Brands/Chains)
**Purpose**: Represents merchant brands or chains that can have multiple stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `parent_merchant_id` (TEXT, UNIQUE) - Human-readable merchant ID
- `parent_name` (TEXT) - Merchant/brand name
- `merchant_type` (ENUM) - `LOCAL`, `CHAIN`, `FRANCHISE`, `CLOUD_KITCHEN`
- `owner_name` (TEXT) - Owner name
- `owner_email` (TEXT) - Owner email
- `registered_phone` (TEXT, UNIQUE) - Registered phone number
- `registered_phone_normalized` (TEXT) - Normalized phone
- `alternate_phone` (TEXT) - Alternate phone
- `business_name`, `brand_name` (TEXT) - Business details
- `business_category` (TEXT) - Business category
- `status` (ENUM) - `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SUSPENDED`, `ACTIVE`
- `is_active` (BOOLEAN) - Whether merchant is active
- `deleted_at`, `deleted_by` (TIMESTAMP/INTEGER) - Soft delete
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed
- `created_by`, `updated_by` (INTEGER) - Audit fields

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `is_active` (by admin)
- 🔒 Never update: `id`, `parent_merchant_id`, `registered_phone`, `created_at`

**Relationships**:
- Referenced by: `merchant_stores.parent_id`

---

### 2. **`merchant_stores`** - Merchant Stores (Outlets)
**Purpose**: Individual store/outlet locations belonging to a merchant parent.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (TEXT, UNIQUE) - Human-readable store ID
- `parent_id` (BIGINT, FK → merchant_parents.id) - Which merchant parent
- `store_name`, `store_display_name`, `store_description` (TEXT) - Store details
- `store_type` (TEXT) - `RESTAURANT`, `CLOUD_KITCHEN`, `WAREHOUSE`, `STORE`, `GARAGE`
- `store_email`, `store_phones` (TEXT/TEXT[]) - Contact information
- `full_address`, `address_line1`, `address_line2`, `landmark` (TEXT) - Address
- `city`, `state`, `postal_code`, `country` (TEXT) - Location
- `latitude`, `longitude` (NUMERIC) - GPS coordinates
- `logo_url`, `banner_url`, `gallery_images` (TEXT/TEXT[]) - Media
- `cuisine_types`, `food_categories` (TEXT[]) - Food classification
- `avg_preparation_time_minutes` (INTEGER) - Average prep time
- `min_order_amount`, `max_order_amount` (NUMERIC) - Order limits
- `delivery_radius_km` (NUMERIC) - Delivery radius
- `is_pure_veg`, `accepts_online_payment`, `accepts_cash` (BOOLEAN) - Configuration
- `status` (ENUM) - `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `ACTIVE`, `SUSPENDED`
- `approval_status`, `approval_reason`, `approved_by`, `approved_at` (TEXT/TEXT/INTEGER/TIMESTAMP) - Approval
- `rejected_reason` (TEXT) - Rejection reason
- `current_onboarding_step` (INTEGER) - Onboarding progress
- `onboarding_completed`, `onboarding_completed_at` (BOOLEAN/TIMESTAMP) - Onboarding
- `is_active`, `is_accepting_orders`, `is_available` (BOOLEAN) - Operational status
- `last_activity_at` (TIMESTAMP) - Last activity
- `deleted_at`, `deleted_by`, `delist_reason`, `delisted_at` (TIMESTAMP/INTEGER/TEXT/TIMESTAMP) - Soft delete
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed
- `created_by`, `updated_by` (INTEGER) - Audit fields

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `last_activity_at` (on activity)
- ⚠️ Manual update: `status`, `is_active`, `is_accepting_orders`, `is_available` (by merchant/admin)
- 🔒 Never update: `id`, `store_id`, `parent_id`, `created_at`

**Relationships**:
- References: `merchant_parents.id`
- Referenced by: All merchant-related tables

---

### 3. **`merchant_store_services`** - Store Services
**Purpose**: Multi-service support per store (Food, Parcel, Ride).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`
- `is_enabled`, `is_available` (BOOLEAN) - Service status
- `service_radius_km` (NUMERIC) - Service radius
- `min_order_amount` (NUMERIC) - Minimum order
- `avg_service_time_minutes` (INTEGER) - Average service time
- `service_config` (JSONB) - Service-specific configuration
- `enabled_at`, `disabled_at` (TIMESTAMP) - Status timestamps
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_enabled`, `is_available` (by merchant/admin)
- 🔒 Never update: `id`, `store_id`, `service_type`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Service availability checks

**Note**: Unique constraint on `(store_id, service_type)` - one record per service per store.

---

## 📄 **VERIFICATION & DOCUMENTS TABLES**

### 4. **`merchant_store_verification`** - Store Verification
**Purpose**: Tracks verification status for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `verification_type` (TEXT) - `KYC`, `ADDRESS`, `BUSINESS`, `BANK`, `TAX`
- `verification_status` (ENUM) - `PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `EXPIRED`
- `verified_by` (INTEGER) - Admin who verified
- `verified_at` (TIMESTAMP) - When verified
- `verification_notes` (TEXT) - Verification notes
- `rejected_reason`, `rejected_at` (TEXT/TIMESTAMP) - Rejection details
- `expires_at` (TIMESTAMP) - Verification expiry
- `renewal_required` (BOOLEAN) - Whether renewal needed
- `verification_metadata` (JSONB) - Additional verification data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `verification_status`, `verified_by`, `verified_at` (by admin)
- 🔒 Never update: `id`, `store_id`, `verification_type`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Compliance, store approval

---

### 5. **`merchant_store_documents`** - Store Documents
**Purpose**: Stores all documents uploaded by merchants.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `document_type` (ENUM) - `PAN`, `GST`, `FSSAI`, `TRADE_LICENSE`, `BANK_STATEMENT`, etc.
- `document_number` (TEXT) - Document number
- `document_url` (TEXT) - Document file URL
- `document_name` (TEXT) - Document name
- `is_verified` (BOOLEAN) - Whether verified
- `verified_by`, `verified_at` (INTEGER/TIMESTAMP) - Verification details
- `rejection_reason` (TEXT) - Rejection reason
- `issued_date`, `expiry_date` (DATE) - Document dates
- `is_expired` (BOOLEAN) - Whether expired
- `document_version` (INTEGER) - Version number
- `is_latest` (BOOLEAN) - Whether latest version
- `replaced_by` (BIGINT, FK → merchant_store_documents.id) - Replaced by document
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `is_expired` (by trigger/system)
- ⚠️ Manual update: `is_verified`, `verified_by`, `verified_at` (by admin)
- 🔒 Never update: `id`, `store_id`, `document_url`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Self-referencing: `replaced_by` → `merchant_store_documents.id`
- Used by: Document verification, compliance

---

### 6. **`merchant_store_tax_details`** - Tax Information
**Purpose**: Tax registration and details for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `tax_type` (TEXT) - `GST`, `VAT`, `SALES_TAX`, `SERVICE_TAX`
- `tax_number` (TEXT) - Tax registration number
- `tax_name` (TEXT) - Tax name
- `is_verified` (BOOLEAN) - Whether verified
- `verified_by`, `verified_at` (INTEGER/TIMESTAMP) - Verification
- `tax_document_url` (TEXT) - Tax document URL
- `registered_date` (DATE) - Registration date
- `expiry_date` (DATE) - Expiry date (if applicable)
- `is_active` (BOOLEAN) - Whether active
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_verified`, `is_active` (by admin)
- 🔒 Never update: `id`, `store_id`, `tax_number`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Tax compliance, invoicing

---

### 7. **`merchant_store_bank_accounts`** - Bank Accounts
**Purpose**: Bank account details for payouts.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `account_holder_name` (TEXT) - Account holder name
- `account_number` (TEXT) - Account number (encrypted)
- `ifsc_code` (TEXT) - IFSC code
- `bank_name`, `branch_name` (TEXT) - Bank details
- `account_type` (TEXT) - `savings`, `current`
- `is_primary` (BOOLEAN) - Whether primary account
- `is_verified` (BOOLEAN) - Whether verified
- `verified_by`, `verified_at` (INTEGER/TIMESTAMP) - Verification
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_primary`, `is_verified` (by merchant/admin)
- 🔒 Never update: `id`, `store_id`, `account_number`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Payout processing

**Note**: Only one account can be `is_primary = TRUE` per store (enforced by trigger).

---

## 🔗 **RELATIONSHIPS**

```
merchant_parents (1) ──→ (many) merchant_stores
merchant_stores (1) ──→ (many) merchant_store_services
merchant_stores (1) ──→ (many) merchant_store_verification
merchant_stores (1) ──→ (many) merchant_store_documents
merchant_stores (1) ──→ (many) merchant_store_tax_details
merchant_stores (1) ──→ (many) merchant_store_bank_accounts
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `merchant_parents` | Merchant brands/chains | Multi-store support |
| `merchant_stores` | Individual stores | Store details, status, location |
| `merchant_store_services` | Service configuration | Multi-service per store |
| `merchant_store_verification` | Verification tracking | KYC, address, business verification |
| `merchant_store_documents` | Document management | Document upload, verification, versioning |
| `merchant_store_tax_details` | Tax information | GST, VAT, tax compliance |
| `merchant_store_bank_accounts` | Bank accounts | Payout accounts, verification |

**Total**: 7 tables in Part 1

---

**Next**: See `DATABASE_SCHEMA_MERCHANT_DOMAIN_PART2_MENU.md` for menu management tables.
