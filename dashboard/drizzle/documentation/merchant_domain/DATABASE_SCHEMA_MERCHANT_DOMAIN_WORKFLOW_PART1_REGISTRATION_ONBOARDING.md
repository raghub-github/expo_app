# Merchant Domain - Workflow Documentation
## Part 1: Registration & Onboarding Process

This document explains **WHICH tables are used** and **IN WHICH ORDER** during the merchant registration and onboarding process.

---

## 📋 **WORKFLOW OVERVIEW**

The merchant onboarding process follows these steps:
1. **Parent Registration** → `merchant_parents`
2. **Store Registration (Child)** → `merchant_stores`
3. **Document Upload** → `merchant_store_documents`
4. **Verification** → `merchant_store_verification`
5. **Tax Details** → `merchant_store_tax_details`
6. **Bank Account** → `merchant_store_bank_accounts`
7. **Service Configuration** → `merchant_store_services`
8. **Status Tracking** → `merchant_store_status_history`

---

## 🏢 **STEP 1: PARENT REGISTRATION**

### **Table: `merchant_parents`**

**When to Use**: First step - When a merchant brand/chain owner registers on the platform.

**Purpose**: Creates the parent merchant account (brand/chain owner). This is the top-level entity that can have multiple stores.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
parent_merchant_id          TEXT UNIQUE          -- Human-readable ID (e.g., "MER-2024-001")
parent_name                 TEXT NOT NULL        -- Merchant/brand name
merchant_type               ENUM                -- 'LOCAL', 'CHAIN', 'FRANCHISE', 'CLOUD_KITCHEN'

-- Owner Details
owner_name                  TEXT NOT NULL        -- Owner's full name
owner_email                 TEXT                 -- Owner's email
registered_phone            TEXT UNIQUE          -- Primary phone (must be unique)
registered_phone_normalized TEXT                -- Normalized phone for matching
alternate_phone             TEXT                 -- Alternate phone number

-- Business Details
business_name               TEXT                 -- Legal business name
brand_name                  TEXT                 -- Brand/trading name
business_category           TEXT                 -- Business category

-- Status
status                      ENUM                 -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE'
is_active                   BOOLEAN              -- Whether merchant is active

-- Soft Delete
deleted_at                  TIMESTAMP            -- When deleted (soft delete)
deleted_by                  INTEGER              -- Who deleted

-- Audit
created_at                  TIMESTAMP            -- Auto: When parent registered
updated_at                  TIMESTAMP            -- Auto: Last update time
created_by                  INTEGER              -- Admin who created
updated_by                  INTEGER              -- Admin who last updated
```

**What Happens**:
1. Merchant fills registration form
2. System creates record in `merchant_parents` with `status = 'PENDING_APPROVAL'`
3. Admin reviews and approves/rejects
4. Once approved, `status = 'APPROVED'` or `'ACTIVE'`
5. Merchant can now create stores (children)

**Next Step**: After parent is approved, proceed to **Store Registration (Step 2)**

---

## 🏪 **STEP 2: STORE REGISTRATION (CHILD)**

### **Table: `merchant_stores`**

**When to Use**: Second step - After parent is approved, merchant creates individual store/outlet.

**Purpose**: Creates a store/outlet location under the parent merchant. One parent can have multiple stores.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    TEXT UNIQUE          -- Human-readable ID (e.g., "STORE-2024-001")
parent_id                   BIGINT FK            -- References merchant_parents.id

-- Store Identity
store_name                  TEXT NOT NULL        -- Store name
store_display_name          TEXT                 -- Display name (can differ from store_name)
store_description           TEXT                 -- Store description
store_type                  TEXT                 -- 'RESTAURANT', 'CLOUD_KITCHEN', 'WAREHOUSE', 'STORE', 'GARAGE'

-- Contact
store_email                 TEXT                 -- Store email
store_phones                TEXT[]               -- Array of phone numbers

-- Address
full_address                TEXT NOT NULL        -- Complete address
address_line1               TEXT                 -- Address line 1
address_line2               TEXT                 -- Address line 2
landmark                    TEXT                 -- Landmark
city                        TEXT NOT NULL        -- City
state                       TEXT NOT NULL        -- State
postal_code                 TEXT NOT NULL        -- Postal code
country                     TEXT                 -- Country (default: 'IN')
latitude                    NUMERIC(10,8)        -- GPS latitude
longitude                   NUMERIC(11,8)        -- GPS longitude

-- Media
logo_url                    TEXT                 -- Store logo URL
banner_url                  TEXT                 -- Store banner URL
gallery_images              TEXT[]               -- Array of gallery image URLs

-- Cuisine/Category (for food)
cuisine_types               TEXT[]               -- Array of cuisine types
food_categories             TEXT[]               -- Array of food categories

-- Configuration
avg_preparation_time_minutes INTEGER             -- Average prep time in minutes
min_order_amount            NUMERIC(10,2)        -- Minimum order amount
max_order_amount            NUMERIC(10,2)        -- Maximum order amount
delivery_radius_km          NUMERIC(5,2)         -- Delivery radius in km
is_pure_veg                 BOOLEAN              -- Whether pure vegetarian
accepts_online_payment       BOOLEAN              -- Whether accepts online payment
accepts_cash                 BOOLEAN              -- Whether accepts cash

-- Status & Approval
status                      ENUM                 -- 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED'
approval_status             TEXT                 -- Approval status
approval_reason             TEXT                 -- Approval reason
approved_by                 INTEGER              -- Admin who approved
approved_at                 TIMESTAMP            -- When approved
rejected_reason             TEXT                 -- Rejection reason (if rejected)

-- Registration Progress
current_onboarding_step     INTEGER              -- Current step (1, 2, 3, etc.)
onboarding_completed        BOOLEAN              -- Whether onboarding completed
onboarding_completed_at      TIMESTAMP            -- When onboarding completed

-- Operational
is_active                   BOOLEAN              -- Whether store is active
is_accepting_orders          BOOLEAN              -- Whether accepting orders
is_available                 BOOLEAN              -- Whether available
last_activity_at             TIMESTAMP            -- Last activity timestamp

-- Soft Delete
deleted_at                  TIMESTAMP            -- When deleted
deleted_by                  INTEGER              -- Who deleted
delist_reason               TEXT                 -- Reason for delisting
delisted_at                 TIMESTAMP            -- When delisted

-- Audit
created_at                  TIMESTAMP            -- Auto: When store created
updated_at                  TIMESTAMP            -- Auto: Last update time
created_by                  INTEGER              -- Who created
updated_by                  INTEGER              -- Who last updated
```

**What Happens**:
1. Merchant fills store registration form
2. System creates record in `merchant_stores` with:
   - `parent_id` = parent merchant ID
   - `status = 'DRAFT'`
   - `current_onboarding_step = 1`
   - `onboarding_completed = FALSE`
3. Merchant progresses through onboarding steps
4. Each step updates `current_onboarding_step`
5. When all steps complete, `onboarding_completed = TRUE`

**Onboarding Steps** (tracked by `current_onboarding_step`):
- Step 1: Basic store information
- Step 2: Address and location
- Step 3: Documents upload
- Step 4: Tax and bank details
- Step 5: Menu setup (later)
- Step 6: Operating hours
- Step 7: Final review and approval

**Next Step**: After store is created, proceed to **Document Upload (Step 3)**

---

## 📄 **STEP 3: DOCUMENT UPLOAD**

### **Table: `merchant_store_documents`**

**When to Use**: Third step - During onboarding, merchant uploads required documents.

**Purpose**: Stores all documents uploaded by merchants (PAN, GST, FSSAI, Trade License, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
document_type               ENUM                -- 'PAN', 'GST', 'FSSAI', 'TRADE_LICENSE', 'BANK_STATEMENT', etc.
document_number             TEXT                 -- Document number (e.g., GST number)
document_url                TEXT                 -- Document file URL (uploaded file)
document_name               TEXT                 -- Document name

-- Verification
is_verified                 BOOLEAN              -- Whether document verified
verified_by                 INTEGER              -- Admin who verified
verified_at                 TIMESTAMP            -- When verified
rejection_reason            TEXT                 -- Rejection reason (if rejected)

-- Validity
issued_date                 DATE                 -- Document issued date
expiry_date                 DATE                 -- Document expiry date
is_expired                  BOOLEAN              -- Whether expired (auto-updated)

-- Versioning
document_version            INTEGER              -- Version number
is_latest                   BOOLEAN              -- Whether latest version
replaced_by                 BIGINT FK            -- References merchant_store_documents.id (if replaced)

-- Audit
created_at                  TIMESTAMP            -- Auto: When document uploaded
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant uploads document (PAN, GST, FSSAI, etc.)
2. System creates record in `merchant_store_documents` with:
   - `is_verified = FALSE`
   - `document_version = 1`
   - `is_latest = TRUE`
3. Admin reviews document
4. Admin updates `is_verified = TRUE`, `verified_by`, `verified_at`
5. If document expires, merchant uploads new version:
   - New record created with `document_version = 2`
   - Old record: `is_latest = FALSE`, `replaced_by = new_document_id`
   - New record: `is_latest = TRUE`

**Required Documents** (typically):
- PAN Card
- GST Certificate
- FSSAI License (for food)
- Trade License
- Bank Statement (for verification)
- Shop Act License

**Next Step**: After documents uploaded, proceed to **Verification (Step 4)**

---

## ✅ **STEP 4: VERIFICATION**

### **Table: `merchant_store_verification`**

**When to Use**: Fourth step - Admin verifies the store and documents.

**Purpose**: Tracks verification status for different aspects of the store (KYC, Address, Business, Bank, Tax).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
verification_type           TEXT                 -- 'KYC', 'ADDRESS', 'BUSINESS', 'BANK', 'TAX'
verification_status         ENUM                 -- 'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'EXPIRED'
verified_by                 INTEGER              -- Admin who verified
verified_at                 TIMESTAMP            -- When verified
verification_notes          TEXT                 -- Verification notes
rejected_reason             TEXT                 -- Rejection reason
rejected_at                 TIMESTAMP            -- When rejected
expires_at                  TIMESTAMP            -- Verification expiry
renewal_required            BOOLEAN              -- Whether renewal needed
verification_metadata       JSONB                -- Additional verification data

-- Audit
created_at                  TIMESTAMP            -- Auto: When verification started
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Admin starts verification process
2. System creates records in `merchant_store_verification` for each verification type:
   - `verification_type = 'KYC'`, `verification_status = 'IN_PROGRESS'`
   - `verification_type = 'ADDRESS'`, `verification_status = 'IN_PROGRESS'`
   - `verification_type = 'BUSINESS'`, `verification_status = 'IN_PROGRESS'`
   - `verification_type = 'BANK'`, `verification_status = 'PENDING'`
   - `verification_type = 'TAX'`, `verification_status = 'PENDING'`
3. Admin verifies each type
4. Updates `verification_status = 'APPROVED'`, `verified_by`, `verified_at`
5. If rejected, updates `verification_status = 'REJECTED'`, `rejected_reason`

**Verification Types**:
- **KYC**: Owner identity verification
- **ADDRESS**: Store address verification
- **BUSINESS**: Business license verification
- **BANK**: Bank account verification
- **TAX**: Tax document verification

**Next Step**: After verification, proceed to **Tax Details (Step 5)**

---

## 💰 **STEP 5: TAX DETAILS**

### **Table: `merchant_store_tax_details`**

**When to Use**: Fifth step - Merchant provides tax registration details.

**Purpose**: Stores tax registration information (GST, VAT, Sales Tax, Service Tax).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
tax_type                    TEXT                 -- 'GST', 'VAT', 'SALES_TAX', 'SERVICE_TAX'
tax_number                  TEXT                 -- Tax registration number
tax_name                    TEXT                 -- Tax name
is_verified                 BOOLEAN              -- Whether verified
verified_by                 INTEGER              -- Admin who verified
verified_at                 TIMESTAMP            -- When verified
tax_document_url            TEXT                 -- Tax document URL
registered_date             DATE                 -- Registration date
expiry_date                 DATE                 -- Expiry date (if applicable)
is_active                   BOOLEAN              -- Whether active

-- Audit
created_at                  TIMESTAMP            -- Auto: When tax details added
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant enters tax details (GST number, etc.)
2. System creates record in `merchant_store_tax_details`
3. Admin verifies tax details
4. Updates `is_verified = TRUE`, `verified_by`, `verified_at`

**Next Step**: After tax details, proceed to **Bank Account (Step 6)**

---

## 🏦 **STEP 6: BANK ACCOUNT**

### **Table: `merchant_store_bank_accounts`**

**When to Use**: Sixth step - Merchant adds bank account for payouts.

**Purpose**: Stores bank account details for receiving payouts.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
account_holder_name         TEXT                 -- Account holder name
account_number              TEXT                 -- Account number (ENCRYPTED)
ifsc_code                   TEXT                 -- IFSC code
bank_name                   TEXT                 -- Bank name
branch_name                 TEXT                 -- Branch name
account_type                TEXT                 -- 'savings', 'current'
is_primary                  BOOLEAN              -- Whether primary account (only one per store)
is_verified                 BOOLEAN              -- Whether verified
verified_by                 INTEGER              -- Admin who verified
verified_at                 TIMESTAMP            -- When verified

-- Audit
created_at                  TIMESTAMP            -- Auto: When bank account added
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant adds bank account details
2. System creates record in `merchant_store_bank_accounts` with:
   - `is_primary = TRUE` (if first account)
   - `is_verified = FALSE`
3. Admin verifies bank account
4. Updates `is_verified = TRUE`, `verified_by`, `verified_at`
5. Merchant can add multiple accounts, but only one can be `is_primary = TRUE`

**Important**: Account number is **ENCRYPTED** - never store plain text.

**Next Step**: After bank account, proceed to **Service Configuration (Step 7)**

---

## ⚙️ **STEP 7: SERVICE CONFIGURATION**

### **Table: `merchant_store_services`**

**When to Use**: Seventh step - Merchant enables services (Food, Parcel, Ride).

**Purpose**: Configures which services the store offers (Food Delivery, Parcel Delivery, Ride Booking).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
service_type                ENUM                 -- 'FOOD', 'PARCEL', 'RIDE'
is_enabled                  BOOLEAN              -- Whether service enabled
is_available                 BOOLEAN              -- Whether service available
service_radius_km           NUMERIC(5,2)         -- Service radius in km
min_order_amount             NUMERIC(10,2)        -- Minimum order amount
avg_service_time_minutes     INTEGER              -- Average service time in minutes
service_config              JSONB                -- Service-specific configuration
enabled_at                   TIMESTAMP            -- When enabled
disabled_at                  TIMESTAMP            -- When disabled

-- Audit
created_at                  TIMESTAMP            -- Auto: When service configured
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant selects which services to offer (Food, Parcel, Ride)
2. System creates records in `merchant_store_services` for each selected service:
   - `service_type = 'FOOD'`, `is_enabled = TRUE`, `is_available = TRUE`
   - `service_type = 'PARCEL'`, `is_enabled = TRUE`, `is_available = TRUE`
   - etc.
3. Merchant can enable/disable services later
4. Updates `is_enabled`, `is_available` accordingly

**Unique Constraint**: One record per `(store_id, service_type)` - cannot have duplicate services.

**Next Step**: After services configured, proceed to **Status Tracking (Step 8)**

---

## 📊 **STEP 8: STATUS TRACKING**

### **Table: `merchant_store_status_history`**

**When to Use**: Throughout the process - Automatically tracks all status changes.

**Purpose**: Immutable history of all store status changes (DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
from_status                 ENUM                 -- Previous status
to_status                   ENUM                 -- New status
changed_by                  TEXT                 -- Who changed ('MERCHANT', 'ADMIN', 'SYSTEM')
changed_by_id               INTEGER              -- ID of who changed
change_reason               TEXT                 -- Reason for change

-- Audit
created_at                  TIMESTAMP            -- Auto: When status changed
```

**What Happens**:
1. **Automatic**: Trigger fires when `merchant_stores.status` changes
2. System creates record in `merchant_store_status_history`:
   - `from_status = 'DRAFT'`
   - `to_status = 'PENDING_APPROVAL'`
   - `changed_by = 'MERCHANT'`
   - `changed_by_id = merchant_user_id`
3. This is an **IMMUTABLE** log - never updated or deleted

**Status Flow**:
```
DRAFT → PENDING_APPROVAL → UNDER_VERIFICATION → APPROVED → ACTIVE
                                    ↓
                               REJECTED
                                    ↓
                               (can resubmit)
```

**Next Step**: After store is approved and active, proceed to **Menu Setup (Part 2)**

---

## 🔗 **RELATIONSHIPS IN REGISTRATION FLOW**

```
merchant_parents (1)
    ↓
    └─→ merchant_stores (many)
            ↓
            ├─→ merchant_store_documents (many)
            ├─→ merchant_store_verification (many)
            ├─→ merchant_store_tax_details (many)
            ├─→ merchant_store_bank_accounts (many)
            ├─→ merchant_store_services (many)
            └─→ merchant_store_status_history (many)
```

---

## 📝 **SUMMARY: REGISTRATION & ONBOARDING TABLES**

| Step | Table | Purpose | Key Fields |
|------|-------|---------|------------|
| 1 | `merchant_parents` | Parent registration | `parent_merchant_id`, `status`, `owner_name` |
| 2 | `merchant_stores` | Store registration | `store_id`, `parent_id`, `status`, `current_onboarding_step` |
| 3 | `merchant_store_documents` | Document upload | `document_type`, `document_url`, `is_verified` |
| 4 | `merchant_store_verification` | Verification | `verification_type`, `verification_status` |
| 5 | `merchant_store_tax_details` | Tax details | `tax_type`, `tax_number`, `is_verified` |
| 6 | `merchant_store_bank_accounts` | Bank account | `account_number`, `ifsc_code`, `is_primary` |
| 7 | `merchant_store_services` | Service config | `service_type`, `is_enabled`, `is_available` |
| 8 | `merchant_store_status_history` | Status tracking | `from_status`, `to_status`, `changed_by` |

**Total Tables in Part 1**: 8 tables

---

**Next**: See `DATABASE_SCHEMA_MERCHANT_DOMAIN_WORKFLOW_PART2_MENU_OPERATIONS.md` for menu setup, operations, and access management.
