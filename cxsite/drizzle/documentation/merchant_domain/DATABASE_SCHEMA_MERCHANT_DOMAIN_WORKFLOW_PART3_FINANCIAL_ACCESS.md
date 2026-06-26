# Merchant Domain - Workflow Documentation
## Part 3: Financial Operations, Access Management & Ongoing Operations

This document continues from Part 2 and explains financial operations, access management, and ongoing operational workflows.

---

## 📋 **WORKFLOW CONTINUATION**

After menu and operations setup:
20. **Commission Rules** → `merchant_store_commission_rules`
21. **Settlements** → `merchant_store_settlements`
22. **Payouts** → `merchant_store_payouts`
23. **Payout History** → `merchant_store_payout_history`
24. **Merchant Users** → `merchant_users`
25. **User Store Access** → `merchant_user_store_access`
26. **Area Managers** → `merchant_area_managers`
27. **Manager Assignments** → `merchant_store_manager_assignments`
28. **Store Holidays** → `merchant_store_holidays`
29. **Store Settings** → `merchant_store_settings`
30. **Activity Log** → `merchant_store_activity_log`
31. **Audit Logs** → `merchant_audit_logs`
32. **Store Blocks** → `merchant_store_blocks`
33. **Compliance** → `merchant_store_compliance`
34. **ONDC Mapping** → `merchant_store_ondc_mapping`
35. **Provider Mapping** → `merchant_store_provider_mapping`

---

## 💰 **STEP 20: COMMISSION RULES**

### **Table: `merchant_store_commission_rules`**

**When to Use**: After store is active - Admin sets commission rules for stores or merchant parents.

**Purpose**: Commission rules for calculating platform commission (percentage, fixed, or tiered).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- Store-specific OR
parent_id                   BIGINT FK            -- Parent-wide (one must be set)
service_type                ENUM                 -- 'FOOD', 'PARCEL', 'RIDE'
commission_type             TEXT                 -- 'PERCENTAGE', 'FIXED', 'TIERED'
commission_value            NUMERIC(10,2)        -- Commission value
min_order_value             NUMERIC(10,2)        -- Minimum order value (for tiered)
max_order_value             NUMERIC(10,2)        -- Maximum order value (for tiered)
applicable_cities            TEXT[]               -- Applicable cities
effective_from               TIMESTAMP            -- Rule effective from
effective_to                 TIMESTAMP            -- Rule effective to (NULL = indefinite)
is_active                   BOOLEAN              -- Whether rule is active

-- Audit
created_at                  TIMESTAMP            -- Auto: When rule created
created_by                  INTEGER              -- Admin who created
```

**What Happens**:
1. Admin sets commission rule (e.g., "15% commission on Food orders")
2. System creates record in `merchant_store_commission_rules`:
   - `service_type = 'FOOD'`
   - `commission_type = 'PERCENTAGE'`
   - `commission_value = 15.00`
   - `effective_from = '2024-01-01'`
3. Can be set at store level OR parent level (applies to all stores under parent)
4. Multiple rules can exist (different for different services, cities, time periods)

**Commission Types**:
- **PERCENTAGE**: `commission_value = 15.00` means 15%
- **FIXED**: `commission_value = 50.00` means ₹50 per order
- **TIERED**: Different commission based on order value ranges

**Next Step**: After commission rules, proceed to **Settlements (Step 21)**

---

## 💵 **STEP 21: SETTLEMENTS**

### **Table: `merchant_store_settlements`**

**When to Use**: Periodically (daily/weekly) - System calculates settlement amounts for stores.

**Purpose**: Settlement records showing financial summary for a period (orders, commission, refunds, net amount).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
settlement_id               TEXT UNIQUE          -- Human-readable settlement ID
store_id                    BIGINT FK            -- References merchant_stores.id

-- Settlement Period
settlement_date             DATE                 -- Settlement date
period_start_date           DATE                 -- Period start date
period_end_date             DATE                 -- Period end date

-- Order Summary
total_orders                INTEGER              -- Total orders in period
completed_orders             INTEGER              -- Completed orders
cancelled_orders             INTEGER              -- Cancelled orders

-- Financial Summary
gross_order_value            NUMERIC(12,2)        -- Gross order value
total_discounts              NUMERIC(12,2)        -- Total discounts given
total_tax                    NUMERIC(12,2)        -- Total tax collected
total_commission             NUMERIC(12,2)        -- Total commission deducted
total_refunds                NUMERIC(12,2)        -- Total refunds
total_adjustments            NUMERIC(12,2)        -- Total adjustments
net_settlement_amount        NUMERIC(12,2)        -- Net amount to pay merchant

-- Linked Payout
payout_id                   BIGINT FK            -- References merchant_store_payouts.id (if paid)

-- Status
settlement_status            TEXT                 -- 'PENDING', 'CALCULATED', 'PAID', 'DISPUTED'

-- Audit
settlement_breakdown         JSONB                -- Detailed breakdown
created_at                  TIMESTAMP            -- Auto: When settlement created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. System runs settlement calculation (daily/weekly)
2. System creates record in `merchant_store_settlements`:
   - Calculates all financial metrics for the period
   - `settlement_status = 'CALCULATED'`
   - `net_settlement_amount = gross_order_value - total_commission - total_refunds`
3. Merchant reviews settlement
4. If approved, finance team creates payout (Step 22)
5. Updates `payout_id` and `settlement_status = 'PAID'`

**Calculation Example**:
```
Gross Order Value: ₹100,000
- Total Discounts: ₹10,000
- Total Commission (15%): ₹13,500
- Total Refunds: ₹2,000
= Net Settlement Amount: ₹74,500
```

**Next Step**: After settlement calculated, proceed to **Payouts (Step 22)**

---

## 💸 **STEP 22: PAYOUTS**

### **Table: `merchant_store_payouts`**

**When to Use**: After settlement - Finance team processes payout to merchant bank account.

**Purpose**: Payout records for transferring money to merchant bank accounts.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
payout_id                   TEXT UNIQUE          -- Human-readable payout ID
store_id                    BIGINT FK            -- References merchant_stores.id
parent_id                   BIGINT FK            -- Optional: Parent merchant ID
bank_account_id             BIGINT FK            -- References merchant_store_bank_accounts.id

-- Payout Amount
payout_amount               NUMERIC(12,2)        -- Gross payout amount
processing_fee              NUMERIC(10,2)        -- Processing fee
tds_deducted                NUMERIC(10,2)        -- TDS deducted
adjustment_amount           NUMERIC(10,2)        -- Adjustments (if any)
net_payout_amount           NUMERIC(12,2)        -- Net amount transferred

-- Payout Period
period_start_date           DATE                 -- Period start
period_end_date             DATE                 -- Period end

-- Order Count
total_orders_count          INTEGER              -- Total orders
completed_orders_count      INTEGER              -- Completed orders

-- Bank Details (Snapshot)
bank_account_holder         TEXT                 -- Account holder name
bank_account_number         TEXT                 -- Account number (masked)
bank_ifsc_code              TEXT                 -- IFSC code
bank_name                   TEXT                 -- Bank name
upi_id                      TEXT                 -- UPI ID (if applicable)

-- Transaction
transaction_id              TEXT                 -- Internal transaction ID
utr_number                  TEXT                 -- UTR number (for bank transfer)
pg_transaction_id           TEXT                 -- Payment gateway transaction ID

-- Status
status                      ENUM                 -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
failure_reason              TEXT                 -- Failure reason (if failed)

-- Timestamps
requested_at                TIMESTAMP            -- When payout requested
processed_at                 TIMESTAMP            -- When processing started
completed_at                 TIMESTAMP            -- When completed
failed_at                    TIMESTAMP            -- When failed

-- Actors
requested_by                INTEGER              -- Who requested
processed_by                INTEGER              -- Who processed

-- Audit
payout_metadata             JSONB                -- Additional metadata
created_at                  TIMESTAMP            -- Auto: When payout created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Finance team creates payout from settlement
2. System creates record in `merchant_store_payouts`:
   - `status = 'PENDING'`
   - `payout_amount = settlement.net_settlement_amount`
   - `bank_account_id = primary_bank_account_id`
   - Snapshot bank details (for audit)
3. Finance team processes payout:
   - `status = 'PROCESSING'`
   - Initiates bank transfer
4. On success:
   - `status = 'COMPLETED'`
   - `completed_at = NOW()`
   - `utr_number = bank_utr`
5. On failure:
   - `status = 'FAILED'`
   - `failed_at = NOW()`
   - `failure_reason = 'Insufficient funds'`

**Next Step**: After payout created, proceed to **Payout History (Step 23)**

---

## 📜 **STEP 23: PAYOUT HISTORY**

### **Table: `merchant_store_payout_history`**

**When to Use**: Automatically - Tracks all payout status changes.

**Purpose**: Immutable history of all payout status changes (PENDING → PROCESSING → COMPLETED).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
payout_id                   BIGINT FK            -- References merchant_store_payouts.id
from_status                 ENUM                 -- Previous status
to_status                   ENUM                 -- New status
changed_by                  TEXT                 -- Who changed ('ADMIN', 'SYSTEM', 'FINANCE')
changed_by_id               INTEGER              -- ID of who changed
change_reason               TEXT                 -- Reason for change
change_metadata             JSONB                -- Additional change data

-- Audit
created_at                  TIMESTAMP            -- Auto: When status changed
```

**What Happens**:
1. **Automatic**: Trigger fires when `merchant_store_payouts.status` changes
2. System creates record in `merchant_store_payout_history`:
   - `from_status = 'PENDING'`
   - `to_status = 'PROCESSING'`
   - `changed_by = 'FINANCE'`
   - `changed_by_id = finance_user_id`
3. This is an **IMMUTABLE** log - never updated or deleted

**Status Flow**:
```
PENDING → PROCESSING → COMPLETED
              ↓
           FAILED
              ↓
         (can retry)
```

**Next Step**: After financial setup, proceed to **Merchant Users (Step 24)**

---

## 👥 **STEP 24: MERCHANT USERS**

### **Table: `merchant_users`**

**When to Use**: After store is active - Admin creates user accounts for store managers and staff.

**Purpose**: User accounts for store managers, staff, accountants who can access merchant portal.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
user_id                     TEXT UNIQUE          -- Human-readable user ID
parent_id                   BIGINT FK            -- References merchant_parents.id

-- User Details
name                        TEXT NOT NULL        -- User full name
email                       TEXT UNIQUE          -- Email address
mobile                      TEXT UNIQUE          -- Mobile number

-- Authentication
password_hash               TEXT                 -- Password hash (encrypted)
last_login_at               TIMESTAMP            -- Last login timestamp
login_count                 INTEGER              -- Total login count

-- Role
role                        TEXT                 -- 'OWNER', 'STORE_MANAGER', 'STAFF', 'ACCOUNTANT'

-- Status
is_active                   BOOLEAN              -- Whether user is active
is_verified                 BOOLEAN              -- Whether user is verified

-- Audit
user_metadata               JSONB                -- Additional metadata
created_at                  TIMESTAMP            -- Auto: When user created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Admin creates user account for store manager/staff
2. System creates record in `merchant_users`:
   - `parent_id = merchant_parent_id`
   - `role = 'STORE_MANAGER'`
   - `is_active = TRUE`
   - `is_verified = FALSE` (until email/mobile verified)
3. User receives credentials and logs in
4. System updates `last_login_at`, `login_count` on each login

**Next Step**: After user created, proceed to **User Store Access (Step 25)**

---

## 🔐 **STEP 25: USER STORE ACCESS**

### **Table: `merchant_user_store_access`**

**When to Use**: After user created - Admin grants user access to specific stores.

**Purpose**: Grants users access to specific stores with permission levels.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
user_id                     BIGINT FK            -- References merchant_users.id
store_id                    BIGINT FK            -- References merchant_stores.id

-- Access Level
access_level                TEXT                 -- 'FULL', 'READ_WRITE', 'READ_ONLY'

-- Permissions
can_manage_menu             BOOLEAN              -- Can manage menu
can_manage_orders            BOOLEAN              -- Can manage orders
can_manage_payouts           BOOLEAN              -- Can manage payouts
can_view_reports             BOOLEAN              -- Can view reports

-- Status
is_active                   BOOLEAN              -- Whether access is active
granted_at                  TIMESTAMP            -- When access granted
granted_by                  INTEGER              -- Admin who granted
revoked_at                  TIMESTAMP            -- When access revoked
revoked_by                  INTEGER              -- Admin who revoked

-- Audit
created_at                  TIMESTAMP            -- Auto: When access granted
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Admin grants user access to store
2. System creates record in `merchant_user_store_access`:
   - `user_id = merchant_user_id`
   - `store_id = store_id`
   - `access_level = 'READ_WRITE'`
   - `can_manage_menu = TRUE`
   - `can_manage_orders = TRUE`
   - `is_active = TRUE`
   - `granted_at = NOW()`
3. User can now access store in portal
4. If access revoked, updates `is_active = FALSE`, `revoked_at = NOW()`

**Unique Constraint**: One access record per `(user_id, store_id)`.

**Next Step**: After access granted, proceed to **Area Managers (Step 26)**

---

## 👔 **STEP 26: AREA MANAGERS**

### **Table: `merchant_area_managers`**

**When to Use**: Admin setup - Creates area managers who manage stores in specific regions.

**Purpose**: Area managers assigned to geographic regions to manage stores.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
manager_id                  TEXT UNIQUE          -- Human-readable manager ID
name                        TEXT NOT NULL        -- Manager name
email                       TEXT UNIQUE          -- Email address
mobile                      TEXT UNIQUE          -- Mobile number
alternate_mobile            TEXT                 -- Alternate mobile
region                      TEXT NOT NULL        -- Region name
cities                      TEXT[]               -- Array of assigned cities
postal_codes                TEXT[]               -- Array of assigned postal codes
status                      TEXT                 -- 'ACTIVE', 'INACTIVE', 'ON_LEAVE'
user_id                     INTEGER              -- Link to system_users.id

-- Audit
created_at                  TIMESTAMP            -- Auto: When manager created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Admin creates area manager
2. System creates record in `merchant_area_managers`:
   - `region = 'North Delhi'`
   - `cities = ['Delhi']`
   - `postal_codes = ['110001', '110002', ...]`
   - `status = 'ACTIVE'`
3. Manager is assigned to stores in their region (Step 27)

**Next Step**: After manager created, proceed to **Manager Assignments (Step 27)**

---

## 📍 **STEP 27: MANAGER ASSIGNMENTS**

### **Table: `merchant_store_manager_assignments`**

**When to Use**: After area manager created - Admin assigns manager to stores.

**Purpose**: Assigns area managers to specific stores.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
area_manager_id             BIGINT FK            -- References merchant_area_managers.id
assigned_at                 TIMESTAMP            -- When assigned
assigned_by                 INTEGER              -- Admin who assigned
is_active                   BOOLEAN              -- Whether assignment is active

-- Audit
created_at                  TIMESTAMP            -- Auto: When assigned
```

**What Happens**:
1. Admin assigns area manager to store
2. System creates record in `merchant_store_manager_assignments`:
   - `store_id = store_id`
   - `area_manager_id = manager_id`
   - `is_active = TRUE`
   - `assigned_at = NOW()`
3. Manager can now manage the assigned store

**Next Step**: After manager assigned, proceed to **Store Holidays (Step 28)**

---

## 🎉 **STEP 28: STORE HOLIDAYS**

### **Table: `merchant_store_holidays`**

**When to Use**: Ongoing - Merchant sets holiday closures.

**Purpose**: Holiday closures for stores (public holidays, store-specific holidays, emergency closures).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
holiday_name                TEXT NOT NULL        -- Holiday name
holiday_type                TEXT                 -- 'PUBLIC', 'STORE_SPECIFIC', 'EMERGENCY'
holiday_date                DATE NOT NULL         -- Holiday date
is_full_day                 BOOLEAN              -- Whether full day closure
closed_from                 TIME                 -- Partial closure start time
closed_till                 TIME                 -- Partial closure end time
closure_reason              TEXT                 -- Closure reason

-- Audit
created_at                  TIMESTAMP            -- Auto: When holiday set
created_by                  INTEGER              -- Who created
```

**What Happens**:
1. Merchant sets holiday (e.g., "Diwali - Full Day")
2. System creates record in `merchant_store_holidays`:
   - `holiday_date = '2024-11-01'`
   - `is_full_day = TRUE`
   - `holiday_type = 'PUBLIC'`
3. System checks holidays when accepting orders
4. If holiday exists, store is marked unavailable

**Next Step**: After holidays set, proceed to **Store Settings (Step 29)**

---

## ⚙️ **STEP 29: STORE SETTINGS**

### **Table: `merchant_store_settings`**

**When to Use**: Ongoing - Merchant configures store-specific settings.

**Purpose**: Store-specific settings and configuration (key-value pairs or JSONB).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK UNIQUE     -- One record per store
setting_key                 TEXT                 -- Setting key
setting_value               JSONB                -- Setting value (flexible)
setting_category            TEXT                 -- Setting category

-- Audit
created_at                  TIMESTAMP            -- Auto: When setting created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant configures store settings
2. System creates/updates record in `merchant_store_settings`:
   - `setting_key = 'notification_preferences'`
   - `setting_value = {'email': true, 'sms': false}`
   - `setting_category = 'notifications'`
3. Settings are used by system for store behavior

**Note**: This may be a key-value table or single JSONB column - check actual schema.

**Next Step**: After settings, proceed to **Activity Log (Step 30)**

---

## 📊 **STEP 30: ACTIVITY LOG**

### **Table: `merchant_store_activity_log`**

**When to Use**: Automatically - Logs all store activities.

**Purpose**: Immutable log of all store activities (menu updates, status changes, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
activity_type               TEXT                 -- Activity type
activity_description        TEXT                 -- Activity description
performed_by                TEXT                 -- Who performed ('MERCHANT', 'ADMIN', 'SYSTEM')
performed_by_id             INTEGER              -- ID of who performed
activity_metadata           JSONB                -- Additional activity data

-- Audit
created_at                  TIMESTAMP            -- Auto: When activity occurred
```

**What Happens**:
1. **Automatic**: System logs all store activities
2. System creates record in `merchant_store_activity_log`:
   - `activity_type = 'MENU_UPDATED'`
   - `activity_description = 'Added new item: Margherita Pizza'`
   - `performed_by = 'MERCHANT'`
   - `performed_by_id = merchant_user_id`
3. This is an **IMMUTABLE** log - never updated or deleted

**Next Step**: After activity logging, proceed to **Audit Logs (Step 31)**

---

## 📋 **STEP 31: AUDIT LOGS**

### **Table: `merchant_audit_logs`**

**When to Use**: Automatically - Comprehensive audit trail for all merchant entities.

**Purpose**: Complete audit trail of all changes to merchant entities (parent, store, menu, offers, payouts, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
entity_type                 TEXT                 -- 'PARENT', 'STORE', 'MENU_ITEM', 'OFFER', 'PAYOUT', etc.
entity_id                   BIGINT               -- Entity ID
action                      TEXT                 -- 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE', 'REJECT'
action_field                TEXT                 -- Field name if specific field changed
old_value                   JSONB                -- Old value (before change)
new_value                   JSONB                -- New value (after change)
performed_by                TEXT                 -- Who performed ('MERCHANT', 'ADMIN', 'SYSTEM', 'AREA_MANAGER')
performed_by_id             INTEGER              -- ID of who performed
performed_by_name            TEXT                 -- Name of who performed
performed_by_email           TEXT                 -- Email of who performed
ip_address                  TEXT                 -- IP address
user_agent                  TEXT                 -- User agent
audit_metadata              JSONB                -- Additional audit data

-- Audit
created_at                  TIMESTAMP            -- Auto: When action occurred
```

**What Happens**:
1. **Automatic**: Triggers fire on all entity changes
2. System creates record in `merchant_audit_logs`:
   - `entity_type = 'STORE'`
   - `entity_id = store_id`
   - `action = 'UPDATE'`
   - `action_field = 'status'`
   - `old_value = {'status': 'PENDING_APPROVAL'}`
   - `new_value = {'status': 'APPROVED'}`
   - `performed_by = 'ADMIN'`
3. This is an **IMMUTABLE** audit log - never updated or deleted

**Next Step**: After audit logging, proceed to **Store Blocks (Step 32)**

---

## 🚫 **STEP 32: STORE BLOCKS**

### **Table: `merchant_store_blocks`**

**When to Use**: When store needs to be blocked - Admin blocks store (temporary or permanent).

**Purpose**: Block/unblock history for stores (compliance, payment issues, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
block_type                  TEXT                 -- 'TEMPORARY', 'PERMANENT', 'COMPLIANCE', 'PAYMENT'
block_reason                TEXT NOT NULL        -- Block reason
block_reason_code           TEXT                 -- Block reason code
block_notes                 TEXT                 -- Additional notes
blocked_at                  TIMESTAMP            -- When blocked
blocked_until               TIMESTAMP            -- When to unblock (if temporary)
auto_unblock                BOOLEAN              -- Whether auto-unblock
blocked_by                  TEXT                 -- Who blocked ('ADMIN', 'SYSTEM')
blocked_by_id               INTEGER              -- ID of who blocked
blocked_by_name              TEXT                 -- Name of who blocked
is_unblocked                BOOLEAN              -- Whether unblocked
unblocked_at                TIMESTAMP            -- When unblocked
unblocked_by                INTEGER              -- Admin who unblocked
unblock_reason              TEXT                 -- Unblock reason
blocked_services            service_type[]       -- Which services blocked

-- Audit
created_at                  TIMESTAMP            -- Auto: When block created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Admin blocks store (e.g., payment issue)
2. System creates record in `merchant_store_blocks`:
   - `block_type = 'TEMPORARY'`
   - `block_reason = 'Payment pending'`
   - `blocked_until = '2024-01-15'`
   - `blocked_services = ['FOOD', 'PARCEL']`
   - `is_unblocked = FALSE`
3. System updates `merchant_stores.is_active = FALSE`
4. When unblocked:
   - `is_unblocked = TRUE`
   - `unblocked_at = NOW()`
   - `unblocked_by = admin_id`

**Next Step**: After blocks, proceed to **Compliance (Step 33)**

---

## ✅ **STEP 33: COMPLIANCE**

### **Table: `merchant_store_compliance`**

**When to Use**: Ongoing - Tracks compliance requirements (GST, FSSAI, Trade License, etc.).

**Purpose**: Compliance tracking for stores (expiry dates, renewal requirements, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
compliance_type             TEXT                 -- 'GST', 'FSSAI', 'TRADE_LICENSE', 'HEALTH_INSPECTION', etc.
compliance_status           ENUM                 -- 'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'EXPIRED'
compliance_number           TEXT                 -- Compliance number
compliance_document_url     TEXT                 -- Compliance document URL
issued_date                 DATE                 -- Issued date
expiry_date                 DATE                 -- Expiry date
is_expired                  BOOLEAN              -- Whether expired (auto-updated)
renewal_required            BOOLEAN              -- Whether renewal required
renewal_due_date            DATE                 -- Renewal due date
verified_by                 INTEGER              -- Admin who verified
verified_at                 TIMESTAMP            -- When verified
verification_notes          TEXT                 -- Verification notes
compliance_metadata         JSONB                -- Additional compliance data

-- Audit
created_at                  TIMESTAMP            -- Auto: When compliance record created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Merchant uploads compliance document (e.g., FSSAI license)
2. System creates record in `merchant_store_compliance`:
   - `compliance_type = 'FSSAI'`
   - `compliance_status = 'PENDING'`
   - `expiry_date = '2025-12-31'`
3. Admin verifies:
   - `compliance_status = 'APPROVED'`
   - `verified_by = admin_id`
   - `verified_at = NOW()`
4. System checks expiry dates and updates `is_expired = TRUE` when expired
5. System sends renewal alerts before `renewal_due_date`

**Next Step**: After compliance, proceed to **ONDC Mapping (Step 34)**

---

## 🌐 **STEP 34: ONDC MAPPING**

### **Table: `merchant_store_ondc_mapping`**

**When to Use**: If store is on ONDC network - Maps store to ONDC (Open Network for Digital Commerce).

**Purpose**: ONDC integration mapping for stores.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK UNIQUE     -- One mapping per store
ondc_store_id               TEXT UNIQUE          -- ONDC store ID
ondc_provider_id            TEXT                 -- ONDC provider ID
ondc_location_id            TEXT                 -- ONDC location ID
ondc_registered_name        TEXT                 -- ONDC registered name
ondc_category               TEXT                 -- ONDC category
ondc_subcategory            TEXT                 -- ONDC subcategory
ondc_status                 TEXT                 -- 'PENDING', 'ACTIVE', 'SUSPENDED', 'DELISTED'
ondc_registered_at          TIMESTAMP            -- When registered on ONDC
last_synced_at              TIMESTAMP            -- Last sync timestamp
sync_status                 TEXT                 -- Sync status
ondc_metadata               JSONB                -- Additional ONDC data

-- Audit
created_at                  TIMESTAMP            -- Auto: When mapping created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Store registers on ONDC network
2. System creates record in `merchant_store_ondc_mapping`:
   - `ondc_store_id = ondc_generated_id`
   - `ondc_status = 'ACTIVE'`
   - `ondc_registered_at = NOW()`
3. System syncs store data with ONDC periodically
4. Updates `last_synced_at`, `sync_status` on each sync

**Next Step**: After ONDC mapping, proceed to **Provider Mapping (Step 35)**

---

## 🔌 **STEP 35: PROVIDER MAPPING**

### **Table: `merchant_store_provider_mapping`**

**When to Use**: If store is on external platforms - Maps store to external providers (Swiggy, Zomato, etc.).

**Purpose**: External provider integration mapping (Swiggy, Zomato, Rapido, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
store_id                    BIGINT FK            -- References merchant_stores.id
provider_type               ENUM                 -- Provider type
provider_store_id           TEXT NOT NULL        -- Provider's store ID
provider_restaurant_id      TEXT                 -- Provider's restaurant ID
provider_merchant_id         TEXT                 -- Provider's merchant ID
provider_store_name         TEXT                 -- Provider's store name
provider_status             TEXT                 -- Provider status
last_synced_at              TIMESTAMP            -- Last sync timestamp
sync_status                 TEXT                 -- Sync status
provider_metadata           JSONB                -- Additional provider data

-- Audit
created_at                  TIMESTAMP            -- Auto: When mapping created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Store registers on external platform (e.g., Swiggy)
2. System creates record in `merchant_store_provider_mapping`:
   - `provider_type = 'SWIGGY'`
   - `provider_store_id = swiggy_store_id`
   - `provider_status = 'ACTIVE'`
3. System syncs orders, menu, status with provider
4. Updates `last_synced_at`, `sync_status` on each sync

---

## 🔗 **COMPLETE WORKFLOW RELATIONSHIPS**

```
merchant_parents (1)
    ↓
    ├─→ merchant_stores (many)
    │       ├─→ merchant_store_documents (many)
    │       ├─→ merchant_store_verification (many)
    │       ├─→ merchant_store_tax_details (many)
    │       ├─→ merchant_store_bank_accounts (many)
    │       ├─→ merchant_store_services (many)
    │       ├─→ merchant_store_status_history (many)
    │       ├─→ merchant_menu_categories (many)
    │       │       └─→ merchant_menu_items (many)
    │       │               ├─→ merchant_menu_item_customizations (many)
    │       │               │       └─→ merchant_menu_item_addons (many)
    │       │               └─→ merchant_menu_item_variants (many)
    │       ├─→ merchant_store_operating_hours (many)
    │       ├─→ merchant_store_availability (1:1)
    │       ├─→ merchant_store_preparation_times (many)
    │       ├─→ merchant_store_holidays (many)
    │       ├─→ merchant_store_settings (1:1)
    │       ├─→ merchant_store_commission_rules (many)
    │       ├─→ merchant_store_settlements (many)
    │       │       └─→ merchant_store_payouts (many)
    │       │               └─→ merchant_store_payout_history (many)
    │       ├─→ merchant_store_manager_assignments (many)
    │       ├─→ merchant_store_activity_log (many)
    │       ├─→ merchant_store_blocks (many)
    │       ├─→ merchant_store_compliance (many)
    │       ├─→ merchant_store_ondc_mapping (1:1)
    │       └─→ merchant_store_provider_mapping (many)
    │
    ├─→ merchant_store_commission_rules (many)
    ├─→ merchant_coupons (many)
    └─→ merchant_users (many)
            └─→ merchant_user_store_access (many)
                    └─→ merchant_stores (many)

merchant_area_managers (1)
    └─→ merchant_store_manager_assignments (many)
            └─→ merchant_stores (many)

merchant_offers (1)
    └─→ merchant_offer_applicability (many)
            ├─→ merchant_menu_items (many)
            └─→ merchant_menu_categories (many)
```

---

## 📝 **COMPLETE SUMMARY: ALL 35 TABLES IN WORKFLOW ORDER**

| Step | Table | Purpose | When Used |
|------|-------|---------|-----------|
| 1 | `merchant_parents` | Parent registration | First step - Brand/chain registration |
| 2 | `merchant_stores` | Store registration | After parent approved - Store creation |
| 3 | `merchant_store_documents` | Document upload | During onboarding - Document upload |
| 4 | `merchant_store_verification` | Verification | After documents - Admin verification |
| 5 | `merchant_store_tax_details` | Tax details | During onboarding - Tax registration |
| 6 | `merchant_store_bank_accounts` | Bank account | During onboarding - Payout account |
| 7 | `merchant_store_services` | Service config | After store created - Enable services |
| 8 | `merchant_store_status_history` | Status tracking | Automatic - All status changes |
| 9 | `merchant_menu_categories` | Menu categories | After store active - Menu setup |
| 10 | `merchant_menu_items` | Menu items | After categories - Add items |
| 11 | `merchant_menu_item_customizations` | Customizations | After items - Add customization options |
| 12 | `merchant_menu_item_addons` | Addons | After customizations - Add addon options |
| 13 | `merchant_menu_item_variants` | Variants | After items - Add variants |
| 14 | `merchant_store_operating_hours` | Operating hours | After menu - Set hours |
| 15 | `merchant_store_availability` | Availability | After hours - Real-time availability |
| 16 | `merchant_store_preparation_times` | Prep times | After availability - Set prep times |
| 17 | `merchant_offers` | Offers | After menu - Create offers |
| 18 | `merchant_coupons` | Coupons | After offers - Create coupons |
| 19 | `merchant_offer_applicability` | Offer mapping | After offers - Map to items/categories |
| 20 | `merchant_store_commission_rules` | Commission rules | Admin setup - Commission configuration |
| 21 | `merchant_store_settlements` | Settlements | Periodic - Settlement calculation |
| 22 | `merchant_store_payouts` | Payouts | After settlement - Payout processing |
| 23 | `merchant_store_payout_history` | Payout history | Automatic - Payout status changes |
| 24 | `merchant_users` | Merchant users | After store active - User accounts |
| 25 | `merchant_user_store_access` | User access | After users - Grant store access |
| 26 | `merchant_area_managers` | Area managers | Admin setup - Manager creation |
| 27 | `merchant_store_manager_assignments` | Manager assignments | After managers - Assign to stores |
| 28 | `merchant_store_holidays` | Holidays | Ongoing - Holiday closures |
| 29 | `merchant_store_settings` | Store settings | Ongoing - Store configuration |
| 30 | `merchant_store_activity_log` | Activity log | Automatic - All activities |
| 31 | `merchant_audit_logs` | Audit logs | Automatic - All changes |
| 32 | `merchant_store_blocks` | Store blocks | When needed - Block/unblock stores |
| 33 | `merchant_store_compliance` | Compliance | Ongoing - Compliance tracking |
| 34 | `merchant_store_ondc_mapping` | ONDC mapping | If on ONDC - ONDC integration |
| 35 | `merchant_store_provider_mapping` | Provider mapping | If on external platforms - Provider integration |

**Total Tables**: 35 tables documented in workflow order

---

## 🎯 **QUICK REFERENCE: TABLE USAGE BY PHASE**

### **Phase 1: Registration & Onboarding** (Steps 1-8)
- Parent registration → Store registration → Documents → Verification → Tax → Bank → Services → Status tracking

### **Phase 2: Menu & Operations** (Steps 9-19)
- Categories → Items → Customizations → Addons → Variants → Hours → Availability → Prep times → Offers → Coupons → Applicability

### **Phase 3: Financial & Access** (Steps 20-27)
- Commission → Settlements → Payouts → Payout history → Users → Access → Managers → Assignments

### **Phase 4: Ongoing Operations** (Steps 28-35)
- Holidays → Settings → Activity log → Audit logs → Blocks → Compliance → ONDC → Provider mapping

---

**Documentation Complete!** All 35 merchant domain tables documented in workflow order with detailed attributes and usage instructions.
