# Merchant Domain - Part 3: Operations, Financial & Access Control

## ⚙️ **OPERATIONS TABLES**

### 1. **`merchant_store_operating_hours`** - Operating Hours
**Purpose**: Store operating hours by day of week.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `day_of_week` (ENUM) - Day of week
- `is_open` (BOOLEAN) - Whether open
- `slot1_start`, `slot1_end`, `slot2_start`, `slot2_end` (TIME) - Time slots
- `total_duration_minutes` (INTEGER) - Total duration
- `is_24_hours` (BOOLEAN) - Whether 24/7
- `same_for_all_days` (BOOLEAN) - Whether same for all days
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_open`, `slot1_start`, `slot1_end`, `slot2_start`, `slot2_end` (by merchant)
- 🔒 Never update: `id`, `store_id`, `day_of_week`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Store availability checks

**Note**: Unique constraint on `(store_id, day_of_week)` - one record per day per store.

---

### 2. **`merchant_store_availability`** - Real-Time Availability
**Purpose**: Real-time availability status for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id, UNIQUE) - One record per store
- `is_available`, `is_accepting_orders` (BOOLEAN) - Availability flags
- `unavailable_reason` (TEXT) - Reason if unavailable
- `auto_unavailable_at`, `auto_available_at` (TIMESTAMP) - Auto-unavailable times
- `current_pending_orders` (INTEGER) - Current pending orders
- `max_concurrent_orders` (INTEGER) - Max concurrent orders
- `updated_by`, `updated_by_id` (TEXT/INTEGER) - Who updated
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `current_pending_orders` (on order status change)
- ⚠️ Manual update: `is_available`, `is_accepting_orders` (by merchant/system)
- 🔒 Never update: `id`, `store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id` (1:1)
- Used by: Order placement, availability checks

---

### 3. **`merchant_store_holidays`** - Store Holidays
**Purpose**: Holiday closures for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `holiday_name` (TEXT) - Holiday name
- `holiday_type` (TEXT) - `PUBLIC`, `STORE_SPECIFIC`, `EMERGENCY`
- `holiday_date` (DATE) - Holiday date
- `is_full_day` (BOOLEAN) - Whether full day closure
- `closed_from`, `closed_till` (TIME) - Partial closure times
- `closure_reason` (TEXT) - Closure reason
- `created_at` (TIMESTAMP) - When created
- `created_by` (INTEGER) - Who created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: All fields (by merchant/admin)
- 🔒 Never update: `id`, `store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Availability checks, holiday planning

---

### 4. **`merchant_store_preparation_times`** - Preparation Times
**Purpose**: Preparation time configuration per service/category/item.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `config_type` (TEXT) - `SERVICE`, `CATEGORY`, `ITEM`, `DEFAULT`
- `service_type` (ENUM) - Service type (if SERVICE)
- `category_id` (BIGINT, FK → merchant_menu_categories.id) - Category (if CATEGORY)
- `menu_item_id` (BIGINT, FK → merchant_menu_items.id) - Item (if ITEM)
- `preparation_time_minutes` (INTEGER) - Prep time
- `applicable_time_start`, `applicable_time_end` (TIME) - Time window
- `applicable_days` (day_of_week[]) - Applicable days
- `priority` (INTEGER) - Priority (higher = more specific)
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `preparation_time_minutes` (by merchant)
- 🔒 Never update: `id`, `store_id`, `config_type`, `created_at`

**Relationships**:
- References: `merchant_stores.id`, `merchant_menu_categories.id` (optional), `merchant_menu_items.id` (optional)
- Used by: Order time estimation

---

### 5. **`merchant_area_managers`** - Area Managers
**Purpose**: Area managers assigned to regions.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `manager_id` (TEXT, UNIQUE) - Human-readable manager ID
- `name`, `email`, `mobile`, `alternate_mobile` (TEXT) - Manager details
- `region` (TEXT) - Region
- `cities`, `postal_codes` (TEXT[]) - Assigned areas
- `status` (TEXT) - `ACTIVE`, `INACTIVE`, `ON_LEAVE`
- `user_id` (INTEGER) - Link to system user
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `cities`, `postal_codes` (by admin)
- 🔒 Never update: `id`, `manager_id`, `created_at`

**Relationships**:
- Referenced by: `merchant_store_manager_assignments`

---

### 6. **`merchant_store_manager_assignments`** - Manager Assignments
**Purpose**: Assigns area managers to stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `area_manager_id` (BIGINT, FK → merchant_area_managers.id)
- `assigned_at` (TIMESTAMP) - When assigned
- `assigned_by` (INTEGER) - Who assigned
- `is_active` (BOOLEAN) - Whether active
- `created_at` (TIMESTAMP) - When created

**When to Update**:
- ✅ Auto-updated: `assigned_at`, `created_at`
- ⚠️ Manual update: `is_active` (by admin)
- 🔒 Never update: `id`, `store_id`, `area_manager_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`, `merchant_area_managers.id`
- Used by: Manager assignment tracking

---

### 7. **`merchant_store_activity_log`** - Activity Log
**Purpose**: Logs all store activities.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `activity_type` (TEXT) - Activity type
- `activity_description` (TEXT) - Description
- `performed_by` (TEXT) - Who performed
- `performed_by_id` (INTEGER) - Performer ID
- `activity_metadata` (JSONB) - Additional data
- `created_at` (TIMESTAMP) - When occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system)
- 🔒 Never update: This is an **immutable activity log** - never update or delete

**Relationships**:
- References: `merchant_stores.id`
- Used by: Activity tracking, audit

---

### 8. **`merchant_store_status_history`** - Status History
**Purpose**: Immutable history of store status changes.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `from_status`, `to_status` (ENUM) - Status transition
- `changed_by` (TEXT) - Who changed
- `changed_by_id` (INTEGER) - Changer ID
- `change_reason` (TEXT) - Reason
- `created_at` (TIMESTAMP) - When changed

**When to Update**:
- ✅ Auto-updated: All fields (by trigger/system)
- 🔒 Never update: This is an **immutable history** - never update or delete

**Relationships**:
- References: `merchant_stores.id`
- Used by: Status tracking, audit

---

### 9. **`merchant_store_settings`** - Store Settings
**Purpose**: Store-specific settings and configuration.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id, UNIQUE) - One record per store
- `setting_key` (TEXT) - Setting key
- `setting_value` (JSONB) - Setting value
- `setting_category` (TEXT) - Setting category
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `setting_value` (by merchant/admin)
- 🔒 Never update: `id`, `store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id` (1:1)
- Used by: Store configuration

**Note**: This may be a key-value table or a single JSONB column. Check actual schema.

---

## 💰 **FINANCIAL TABLES**

### 10. **`merchant_store_commission_rules`** - Commission Rules
**Purpose**: Commission rules for stores or merchant parents.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id) - Store-specific OR
- `parent_id` (BIGINT, FK → merchant_parents.id) - Parent-wide
- `service_type` (ENUM) - Service type
- `commission_type` (TEXT) - `PERCENTAGE`, `FIXED`, `TIERED`
- `commission_value` (NUMERIC) - Commission value
- `min_order_value`, `max_order_value` (NUMERIC) - Tier conditions
- `applicable_cities` (TEXT[]) - Applicable cities
- `effective_from`, `effective_to` (TIMESTAMP) - Validity
- `is_active` (BOOLEAN) - Whether active
- `created_at` (TIMESTAMP) - When created
- `created_by` (INTEGER) - Who created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `is_active`, `effective_to` (by admin)
- 🔒 Never update: `id`, `store_id`, `parent_id`, `commission_value`, `created_at`

**Relationships**:
- References: `merchant_stores.id` OR `merchant_parents.id` (one must be set)
- Used by: Commission calculation

**Note**: Constraint ensures either `store_id` OR `parent_id` is set, not both.

---

### 11. **`merchant_store_payouts`** - Store Payouts
**Purpose**: Payout records for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `payout_id` (TEXT, UNIQUE) - Human-readable payout ID
- `store_id` (BIGINT, FK → merchant_stores.id)
- `parent_id` (BIGINT, FK → merchant_parents.id) - Optional
- `bank_account_id` (BIGINT, FK → merchant_store_bank_accounts.id) - Bank account
- `payout_amount`, `processing_fee`, `tds_deducted`, `adjustment_amount`, `net_payout_amount` (NUMERIC) - Amounts
- `period_start_date`, `period_end_date` (DATE) - Payout period
- `total_orders_count`, `completed_orders_count` (INTEGER) - Order counts
- `bank_account_holder`, `bank_account_number`, `bank_ifsc_code`, `bank_name`, `upi_id` (TEXT) - Bank snapshot
- `transaction_id`, `utr_number`, `pg_transaction_id` (TEXT) - Transaction IDs
- `status` (ENUM) - `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`
- `failure_reason` (TEXT) - Failure reason
- `requested_at`, `processed_at`, `completed_at`, `failed_at` (TIMESTAMP) - Status timestamps
- `requested_by`, `processed_by` (INTEGER) - Actors
- `payout_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `status`, `processed_at`, `completed_at` (by payout system)
- ⚠️ Manual update: `status`, `processed_by` (by finance team)
- 🔒 Never update: `id`, `payout_id`, `store_id`, `payout_amount`, `created_at`

**Relationships**:
- References: `merchant_stores.id`, `merchant_parents.id` (optional), `merchant_store_bank_accounts.id`
- Referenced by: `merchant_store_payout_history`, `merchant_store_settlements.payout_id`

---

### 12. **`merchant_store_payout_history`** - Payout History
**Purpose**: Immutable history of payout status changes.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `payout_id` (BIGINT, FK → merchant_store_payouts.id)
- `from_status`, `to_status` (ENUM) - Status transition
- `changed_by`, `changed_by_id` (TEXT/INTEGER) - Who changed
- `change_reason` (TEXT) - Reason
- `change_metadata` (JSONB) - Additional data
- `created_at` (TIMESTAMP) - When changed

**When to Update**:
- ✅ Auto-updated: All fields (by trigger/system)
- 🔒 Never update: This is an **immutable history** - never update or delete

**Relationships**:
- References: `merchant_store_payouts.id`
- Used by: Payout tracking, audit

---

### 13. **`merchant_store_settlements`** - Settlement Records
**Purpose**: Settlement records for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `settlement_id` (TEXT, UNIQUE) - Human-readable settlement ID
- `store_id` (BIGINT, FK → merchant_stores.id)
- `settlement_date`, `period_start_date`, `period_end_date` (DATE) - Settlement period
- `total_orders`, `completed_orders`, `cancelled_orders` (INTEGER) - Order counts
- `gross_order_value`, `total_discounts`, `total_tax`, `total_commission`, `total_refunds`, `total_adjustments`, `net_settlement_amount` (NUMERIC) - Financial summary
- `payout_id` (BIGINT, FK → merchant_store_payouts.id) - Linked payout
- `settlement_status` (TEXT) - `PENDING`, `CALCULATED`, `PAID`, `DISPUTED`
- `settlement_breakdown` (JSONB) - Detailed breakdown
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), financial fields (by settlement system)
- ⚠️ Manual update: `settlement_status`, `payout_id` (by finance team)
- 🔒 Never update: `id`, `settlement_id`, `store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`, `merchant_store_payouts.id` (optional)
- Used by: Financial reconciliation, reporting

---

## 👥 **ACCESS CONTROL TABLES**

### 14. **`merchant_users`** - Merchant Users
**Purpose**: Store managers and staff users.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `user_id` (TEXT, UNIQUE) - Human-readable user ID
- `parent_id` (BIGINT, FK → merchant_parents.id) - Merchant parent
- `name`, `email`, `mobile` (TEXT) - User details
- `password_hash` (TEXT) - Password hash
- `last_login_at` (TIMESTAMP) - Last login
- `login_count` (INTEGER) - Login count
- `role` (TEXT) - `OWNER`, `STORE_MANAGER`, `STAFF`, `ACCOUNTANT`
- `is_active`, `is_verified` (BOOLEAN) - Status flags
- `user_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `last_login_at`, `login_count` (on login)
- ⚠️ Manual update: `is_active`, `is_verified`, `role` (by admin)
- 🔒 Never update: `id`, `user_id`, `email`, `mobile`, `created_at`

**Relationships**:
- References: `merchant_parents.id`
- Referenced by: `merchant_user_store_access`

---

### 15. **`merchant_user_store_access`** - User Store Access
**Purpose**: Grants users access to specific stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `user_id` (BIGINT, FK → merchant_users.id)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `access_level` (TEXT) - `FULL`, `READ_WRITE`, `READ_ONLY`
- `can_manage_menu`, `can_manage_orders`, `can_manage_payouts`, `can_view_reports` (BOOLEAN) - Permissions
- `is_active` (BOOLEAN) - Whether active
- `granted_at` (TIMESTAMP) - When granted
- `granted_by` (INTEGER) - Who granted
- `revoked_at`, `revoked_by` (TIMESTAMP/INTEGER) - Revocation
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_active`, `revoked_at`, `revoked_by` (by admin)
- 🔒 Never update: `id`, `user_id`, `store_id`, `granted_at`, `created_at`

**Relationships**:
- References: `merchant_users.id`, `merchant_stores.id`
- Used by: Access control

**Note**: Unique constraint on `(user_id, store_id)` - one access record per user per store.

---

## 📋 **COMPLIANCE & AUDIT TABLES**

### 16. **`merchant_audit_logs`** - Audit Logs
**Purpose**: Comprehensive audit trail for all merchant entities.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `entity_type` (TEXT) - `PARENT`, `STORE`, `MENU_ITEM`, `OFFER`, `PAYOUT`, etc.
- `entity_id` (BIGINT) - Entity ID
- `action` (TEXT) - `CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `APPROVE`, `REJECT`
- `action_field` (TEXT) - Field name if specific field
- `old_value`, `new_value` (JSONB) - Old and new values
- `performed_by`, `performed_by_id`, `performed_by_name`, `performed_by_email` (TEXT/INTEGER/TEXT/TEXT) - Actor
- `ip_address`, `user_agent` (TEXT) - Context
- `audit_metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP) - When occurred

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system)
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- Used by: Complete audit trail, compliance

---

### 17. **`merchant_store_blocks`** - Store Blocks
**Purpose**: Block/unblock history for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `block_type` (TEXT) - `TEMPORARY`, `PERMANENT`, `COMPLIANCE`, `PAYMENT`
- `block_reason`, `block_reason_code`, `block_notes` (TEXT) - Block details
- `blocked_at`, `blocked_until` (TIMESTAMP) - Block duration
- `auto_unblock` (BOOLEAN) - Whether auto-unblock
- `blocked_by`, `blocked_by_id`, `blocked_by_name` (TEXT/INTEGER/TEXT) - Who blocked
- `is_unblocked`, `unblocked_at`, `unblocked_by`, `unblock_reason` (BOOLEAN/TIMESTAMP/INTEGER/TEXT) - Unblock details
- `blocked_services` (service_type[]) - Which services blocked
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `is_unblocked`, `unblocked_at` (when unblocked)
- ⚠️ Manual update: `blocked_until`, `is_unblocked` (by admin)
- 🔒 Never update: `id`, `store_id`, `blocked_at`, `blocked_by`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Block management, compliance

---

### 18. **`merchant_store_compliance`** - Compliance Tracking
**Purpose**: Compliance tracking for stores.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `compliance_type` (TEXT) - `GST`, `FSSAI`, `TRADE_LICENSE`, `HEALTH_INSPECTION`, etc.
- `compliance_status` (ENUM) - `PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `EXPIRED`
- `compliance_number`, `compliance_document_url` (TEXT) - Compliance details
- `issued_date`, `expiry_date` (DATE) - Validity
- `is_expired`, `renewal_required`, `renewal_due_date` (BOOLEAN/BOOLEAN/DATE) - Renewal
- `verified_by`, `verified_at`, `verification_notes` (INTEGER/TIMESTAMP/TEXT) - Verification
- `compliance_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `is_expired` (by trigger/system)
- ⚠️ Manual update: `compliance_status`, `verified_by`, `verified_at` (by admin)
- 🔒 Never update: `id`, `store_id`, `compliance_type`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: Compliance monitoring, expiry alerts

---

## 🔗 **INTEGRATION TABLES**

### 19. **`merchant_store_ondc_mapping`** - ONDC Integration
**Purpose**: ONDC (Open Network for Digital Commerce) integration mapping.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id, UNIQUE) - One mapping per store
- `ondc_store_id` (TEXT, UNIQUE) - ONDC store ID
- `ondc_provider_id`, `ondc_location_id` (TEXT) - ONDC IDs
- `ondc_registered_name`, `ondc_category`, `ondc_subcategory` (TEXT) - ONDC details
- `ondc_status` (TEXT) - `PENDING`, `ACTIVE`, `SUSPENDED`, `DELISTED`
- `ondc_registered_at` (TIMESTAMP) - Registration time
- `last_synced_at` (TIMESTAMP) - Last sync
- `sync_status` (TEXT) - Sync status
- `ondc_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `last_synced_at`, `sync_status` (by sync system)
- ⚠️ Manual update: `ondc_status` (by admin)
- 🔒 Never update: `id`, `store_id`, `ondc_store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id` (1:1)
- Used by: ONDC integration, sync

---

### 20. **`merchant_store_provider_mapping`** - External Provider Mapping
**Purpose**: Mapping to external providers (Swiggy, Zomato, etc.).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, FK → merchant_stores.id)
- `provider_type` (ENUM) - Provider type
- `provider_store_id`, `provider_restaurant_id`, `provider_merchant_id` (TEXT) - Provider IDs
- `provider_store_name`, `provider_status` (TEXT) - Provider details
- `last_synced_at` (TIMESTAMP) - Last sync
- `sync_status` (TEXT) - Sync status
- `provider_metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `last_synced_at`, `sync_status` (by sync system)
- 🔒 Never update: `id`, `store_id`, `provider_type`, `provider_store_id`, `created_at`

**Relationships**:
- References: `merchant_stores.id`
- Used by: External provider integration, sync

---

## 🔗 **RELATIONSHIPS**

```
merchant_stores (1) ──→ (many) merchant_store_operating_hours
merchant_stores (1) ──→ (1) merchant_store_availability
merchant_stores (1) ──→ (many) merchant_store_holidays
merchant_stores (1) ──→ (many) merchant_store_preparation_times
merchant_area_managers (1) ──→ (many) merchant_store_manager_assignments
merchant_stores (1) ──→ (many) merchant_store_manager_assignments
merchant_stores (1) ──→ (many) merchant_store_activity_log
merchant_stores (1) ──→ (many) merchant_store_status_history
merchant_stores (1) ──→ (1) merchant_store_settings
merchant_stores (1) ──→ (many) merchant_store_commission_rules
merchant_parents (1) ──→ (many) merchant_store_commission_rules
merchant_stores (1) ──→ (many) merchant_store_payouts
merchant_store_payouts (1) ──→ (many) merchant_store_payout_history
merchant_stores (1) ──→ (many) merchant_store_settlements
merchant_parents (1) ──→ (many) merchant_users
merchant_users (1) ──→ (many) merchant_user_store_access
merchant_stores (1) ──→ (many) merchant_user_store_access
merchant_stores (1) ──→ (many) merchant_store_blocks
merchant_stores (1) ──→ (many) merchant_store_compliance
merchant_stores (1) ──→ (1) merchant_store_ondc_mapping
merchant_stores (1) ──→ (many) merchant_store_provider_mapping
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `merchant_store_operating_hours` | Operating hours | Day-wise hours, slots |
| `merchant_store_availability` | Real-time availability | Availability status, pending orders |
| `merchant_store_holidays` | Holiday closures | Holiday tracking |
| `merchant_store_preparation_times` | Preparation times | Service/category/item prep times |
| `merchant_area_managers` | Area managers | Manager details, regions |
| `merchant_store_manager_assignments` | Manager assignments | Store-manager mapping |
| `merchant_store_activity_log` | Activity log | Immutable activity log |
| `merchant_store_status_history` | Status history | Immutable status history |
| `merchant_store_settings` | Store settings | Store configuration |
| `merchant_store_commission_rules` | Commission rules | Commission calculation |
| `merchant_store_payouts` | Payouts | Payout processing |
| `merchant_store_payout_history` | Payout history | Immutable payout history |
| `merchant_store_settlements` | Settlements | Settlement records |
| `merchant_users` | Merchant users | Store managers, staff |
| `merchant_user_store_access` | User access | Store access control |
| `merchant_audit_logs` | Audit logs | Comprehensive audit trail |
| `merchant_store_blocks` | Store blocks | Block/unblock history |
| `merchant_store_compliance` | Compliance | Compliance tracking |
| `merchant_store_ondc_mapping` | ONDC mapping | ONDC integration |
| `merchant_store_provider_mapping` | Provider mapping | External provider integration |

**Total**: 20 tables in Part 3

---

## 📊 **MERCHANT DOMAIN COMPLETE SUMMARY**

- **Part 1**: 7 tables (Core merchant structure)
- **Part 2**: 8 tables (Menu management)
- **Part 3**: 20 tables (Operations, financial, access control)

**Total Merchant Domain**: 35 tables documented

---

**Next**: See Tickets Domain, Access Management, Payments Domain, Providers Domain, and System Domain documentation.
