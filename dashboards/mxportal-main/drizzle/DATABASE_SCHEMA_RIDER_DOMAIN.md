# Rider Domain - Complete Table Documentation

## 🏍️ **RIDER DOMAIN OVERVIEW**

The Rider Domain manages all aspects of rider (delivery partner) operations including:
- Rider profiles and onboarding
- KYC and document verification
- Device management and security
- Duty status and location tracking
- Wallet, earnings, and withdrawals
- Performance analytics

**Total Tables**: 20+ tables

---

## 📋 **CORE RIDER TABLES**

### 1. **`riders`** - Core Rider Profile
**Purpose**: Main table storing rider profile information and status.

**Key Attributes**:
- `id` (INTEGER, PRIMARY KEY) - Auto-increment rider ID
- `mobile` (TEXT, UNIQUE) - Primary mobile number (used for login)
- `name` (TEXT) - Rider's full name
- `onboarding_stage` (ENUM) - Current onboarding step: `MOBILE_VERIFIED`, `KYC`, `PAYMENT`, `APPROVAL`, `ACTIVE`
- `kyc_status` (ENUM) - KYC verification status: `PENDING`, `REJECTED`, `APPROVED`, `REVIEW`
- `status` (ENUM) - Rider account status: `INACTIVE`, `ACTIVE`, `BLOCKED`, `BANNED`
- `city`, `state`, `pincode` (TEXT) - Location information
- `lat`, `lon` (DOUBLE PRECISION) - Current location coordinates
- `referral_code` (TEXT, UNIQUE) - Unique referral code for this rider
- `referred_by` (INTEGER) - ID of rider who referred this rider
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed timestamps

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `onboarding_stage`, `kyc_status`, `lat`, `lon`
- 🔒 Never update: `id`, `mobile`, `created_at`

**Relationships**:
- Referenced by: `rider_documents`, `rider_devices`, `duty_logs`, `location_logs`, `wallet_ledger`, `withdrawal_requests`, `order_rider_assignments`

---

### 2. **`rider_documents`** - KYC Documents
**Purpose**: Stores all KYC documents uploaded by riders (Aadhaar, PAN, DL, RC, etc.)

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id) - Which rider owns this document
- `doc_type` (ENUM) - Document type: `aadhaar`, `dl`, `rc`, `pan`, `selfie`, `rental_proof`, `ev_proof`
- `file_url` (TEXT) - URL to document file (stored in S3/cloud storage)
- `extracted_name` (TEXT) - Name extracted from document via OCR
- `extracted_dob` (DATE) - Date of birth extracted from document
- `verified` (BOOLEAN) - Whether document is verified by admin
- `verifier_user_id` (INTEGER) - Admin user who verified
- `rejected_reason` (TEXT) - Reason if document was rejected
- `metadata` (JSONB) - Additional document metadata
- `created_at` (TIMESTAMP) - When document was uploaded

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `verified`, `verifier_user_id`, `rejected_reason` (by admin)
- 🔒 Never update: `id`, `rider_id`, `file_url`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Admin verification process

---

### 3. **`rider_devices`** - Device Management
**Purpose**: Tracks all devices used by riders for security and push notifications.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `device_id` (TEXT) - Unique device identifier
- `ip_address` (TEXT) - Device IP address
- `sim_id` (TEXT) - SIM card identifier
- `model` (TEXT) - Device model (e.g., "Samsung Galaxy S21")
- `os_version` (TEXT) - Operating system version
- `fcm_token` (TEXT) - Firebase Cloud Messaging token for push notifications
- `allowed` (BOOLEAN) - Whether device is allowed (can be blocked for security)
- `last_seen` (TIMESTAMP) - Last time device was active
- `created_at` (TIMESTAMP) - When device was first registered

**When to Update**:
- ✅ Auto-updated: `last_seen` (on each app activity)
- ⚠️ Manual update: `allowed` (block/unblock device), `fcm_token` (when token refreshes)
- 🔒 Never update: `id`, `rider_id`, `device_id`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Push notification system, security monitoring

---

### 4. **`blacklist_history`** - Rider Blacklist Log
**Purpose**: Tracks when riders are blacklisted/banned and reasons.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `reason` (TEXT) - Reason for blacklisting
- `banned` (BOOLEAN) - Whether rider is banned (TRUE) or unbanned (FALSE)
- `admin_user_id` (INTEGER) - Admin who performed the action
- `created_at` (TIMESTAMP) - When action was taken

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: All fields (by admin)
- 🔒 Never update: `id`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Admin dashboard, compliance reports

---

## 📍 **DUTY & LOCATION TRACKING**

### 5. **`duty_logs`** - Duty Status History
**Purpose**: Tracks when riders turn duty ON/OFF.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `status` (ENUM) - Duty status: `ON`, `OFF`, `AUTO_OFF`
- `timestamp` (TIMESTAMP) - When status changed

**When to Update**:
- ✅ Auto-updated: `timestamp` (on status change)
- ⚠️ Manual update: `status` (by rider or system)
- 🔒 Never update: `id`, `rider_id`

**Relationships**:
- References: `riders.id`
- Used by: Rider availability system, analytics

---

### 6. **`location_logs`** - Real-Time Location Tracking
**Purpose**: Stores rider location updates (partitioned by month for performance).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `lat` (DOUBLE PRECISION) - Latitude
- `lon` (DOUBLE PRECISION) - Longitude
- `battery_percent` (INTEGER) - Device battery percentage
- `accuracy` (DOUBLE PRECISION) - GPS accuracy in meters
- `speed` (DOUBLE PRECISION) - Current speed in km/h
- `heading` (DOUBLE PRECISION) - Direction of movement (0-360 degrees)
- `created_at` (TIMESTAMP, PARTITION KEY) - When location was recorded

**When to Update**:
- ✅ Auto-updated: All fields (by app every few seconds when rider is ON duty)
- 🔒 Never update: `id`, `rider_id`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Order assignment algorithm, real-time tracking, analytics

**Note**: This table is **partitioned by month** for performance. Old partitions can be archived.

---

## 💰 **WALLET & EARNINGS**

### 7. **`wallet_ledger`** - Rider Wallet Transaction History
**Purpose**: Immutable ledger of all wallet transactions (partitioned by rider_id for performance).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id, PARTITION KEY)
- `entry_type` (ENUM) - Transaction type: `earning`, `penalty`, `onboarding_fee`, `adjustment`, `refund`, `bonus`, `referral_bonus`
- `amount` (NUMERIC) - Transaction amount (positive for credit, negative for debit)
- `balance` (NUMERIC) - Wallet balance after this transaction
- `ref` (TEXT) - Reference ID (e.g., order_id)
- `ref_type` (TEXT) - Reference type (e.g., "order", "withdrawal")
- `description` (TEXT) - Human-readable description
- `metadata` (JSONB) - Additional transaction details
- `created_at` (TIMESTAMP) - When transaction occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system when transaction occurs)
- 🔒 Never update: This is an **immutable ledger** - never update or delete

**Relationships**:
- References: `riders.id`
- Used by: Wallet balance calculation, earnings reports, financial audits

**Note**: This table is **partitioned by rider_id** (hash partition) for performance.

---

### 8. **`withdrawal_requests`** - Withdrawal Requests
**Purpose**: Tracks rider requests to withdraw money from wallet.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `amount` (NUMERIC) - Amount to withdraw
- `status` (ENUM) - Withdrawal status: `pending`, `processing`, `completed`, `failed`, `cancelled`
- `bank_account_id` (BIGINT, FK → rider_bank_accounts.id) - Which bank account to transfer to
- `transaction_id` (TEXT) - Bank transaction ID after transfer
- `settlement_batch_id` (BIGINT, FK → settlement_batches.id) - If part of batch settlement
- `processing_fee` (NUMERIC) - Fee charged for withdrawal
- `tds_amount` (NUMERIC) - TDS deducted
- `net_amount` (NUMERIC) - Final amount after fees and TDS
- `processed_at` (TIMESTAMP) - When processing started
- `completed_at` (TIMESTAMP) - When transfer completed
- `failure_reason` (TEXT) - Reason if withdrawal failed
- `created_at` (TIMESTAMP) - When request was created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `status`, `transaction_id`, `processed_at`, `completed_at` (by payment system)
- 🔒 Never update: `id`, `rider_id`, `amount`, `created_at`

**Relationships**:
- References: `riders.id`, `rider_bank_accounts.id`, `settlement_batches.id`
- Used by: Payment processing, settlement system

---

### 9. **`rider_bank_accounts`** - Bank Account Details
**Purpose**: Stores rider bank account information for payouts.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `account_holder_name` (TEXT) - Account holder name
- `account_number` (TEXT) - Bank account number (encrypted)
- `ifsc_code` (TEXT) - IFSC code
- `bank_name` (TEXT) - Bank name
- `branch_name` (TEXT) - Branch name
- `account_type` (TEXT) - `savings`, `current`
- `is_primary` (BOOLEAN) - Whether this is the primary account
- `is_verified` (BOOLEAN) - Whether account is verified
- `verified_at` (TIMESTAMP) - When account was verified
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_primary`, `is_verified`, `verified_at` (by admin or verification system)
- 🔒 Never update: `id`, `rider_id`, `account_number`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Withdrawal requests, payout processing

---

## 🚗 **VEHICLE MANAGEMENT**

### 10. **`rider_vehicles`** - Vehicle Information
**Purpose**: Stores vehicle details for each rider.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `vehicle_type` (TEXT) - `bike`, `car`, `bicycle`, `scooter`, `auto`
- `registration_number` (TEXT) - Vehicle registration number
- `make` (TEXT) - Vehicle manufacturer (e.g., "Honda")
- `model` (TEXT) - Vehicle model (e.g., "Activa")
- `year` (INTEGER) - Manufacturing year
- `color` (TEXT) - Vehicle color
- `insurance_expiry` (DATE) - Insurance expiry date
- `rc_document_url` (TEXT) - Registration certificate document URL
- `insurance_document_url` (TEXT) - Insurance document URL
- `verified` (BOOLEAN) - Whether vehicle is verified
- `verified_at` (TIMESTAMP) - When verified
- `verified_by` (INTEGER) - Admin user who verified
- `is_active` (BOOLEAN) - Whether this is the active vehicle (only one per rider)

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `is_active` (via trigger - ensures only one active)
- ⚠️ Manual update: `verified`, `verified_at`, `verified_by` (by admin)
- 🔒 Never update: `id`, `rider_id`, `registration_number`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Order assignment (matching vehicle type), compliance

**Note**: Trigger ensures only **one active vehicle per rider**.

---

### 11. **`insurance_policies`** - Insurance Information
**Purpose**: Tracks vehicle insurance policies.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `vehicle_id` (BIGINT, FK → rider_vehicles.id) - Optional vehicle reference
- `policy_number` (TEXT) - Insurance policy number
- `provider` (TEXT) - Insurance company name
- `coverage_amount` (NUMERIC) - Coverage amount
- `premium_amount` (NUMERIC) - Premium paid
- `start_date`, `end_date` (DATE) - Policy validity period
- `document_url` (TEXT) - Insurance document URL
- `status` (TEXT) - `active`, `expired`, `pending`, `cancelled`
- `renewal_reminder_sent` (BOOLEAN) - Whether renewal reminder was sent
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `renewal_reminder_sent` (by system or admin)
- 🔒 Never update: `id`, `rider_id`, `policy_number`, `created_at`

**Relationships**:
- References: `riders.id`, `rider_vehicles.id` (optional)
- Used by: Compliance checks, renewal reminders

---

## 📊 **ANALYTICS & PERFORMANCE**

### 12. **`rider_daily_analytics`** - Daily Performance Summary
**Purpose**: Pre-aggregated daily performance metrics for riders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `date` (DATE) - Analytics date
- `total_orders` (INTEGER) - Total orders completed
- `total_earnings` (NUMERIC) - Total earnings for the day
- `total_distance_km` (NUMERIC) - Total distance traveled
- `avg_rating` (NUMERIC) - Average customer rating received
- `on_time_delivery_rate` (NUMERIC) - Percentage of on-time deliveries
- `cancellation_rate` (NUMERIC) - Percentage of cancelled orders
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: All metrics (by scheduled job daily)
- 🔒 Never update: `id`, `rider_id`, `date`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Performance dashboards, leaderboards, reports

**Note**: One record per rider per day. Aggregated from `orders` and `order_rider_assignments`.

---

## 🔔 **NOTIFICATIONS**

### 13. **`notification_logs`** - Notification History
**Purpose**: Logs all notifications sent to riders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `notification_type` (TEXT) - `order`, `payment`, `offer`, `system`, `promotional`
- `channel` (TEXT) - `push`, `sms`, `email`
- `title` (TEXT) - Notification title
- `body` (TEXT) - Notification message
- `status` (TEXT) - `pending`, `sent`, `delivered`, `failed`, `bounced`
- `provider` (TEXT) - Notification provider (FCM, MSG91, etc.)
- `provider_message_id` (TEXT) - Provider's message ID
- `created_at` (TIMESTAMP) - When notification was sent

**When to Update**:
- ✅ Auto-updated: `status`, `provider_message_id` (by notification service)
- 🔒 Never update: `id`, `rider_id`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Notification tracking, delivery reports

---

### 14. **`notification_preferences`** - Notification Settings
**Purpose**: Rider preferences for notification types and channels.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `notification_type` (TEXT) - `order`, `payment`, `offer`, `system`, `promotional`
- `channel` (TEXT) - `push`, `sms`, `email`
- `enabled` (BOOLEAN) - Whether this notification type/channel is enabled
- `quiet_hours_start` (TIME) - Start of quiet hours (e.g., 22:00)
- `quiet_hours_end` (TIME) - End of quiet hours (e.g., 08:00)
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `enabled`, `quiet_hours_start`, `quiet_hours_end` (by rider in app)
- 🔒 Never update: `id`, `rider_id`, `created_at`

**Relationships**:
- References: `riders.id`
- Used by: Notification system to respect preferences

**Note**: Unique constraint on `(rider_id, notification_type, channel)`.

---

## 🎁 **OFFERS & REWARDS**

### 15. **`offers`** - Platform Offers
**Purpose**: System-wide offers for riders (bonuses, incentives).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `offer_name` (TEXT) - Offer name
- `offer_description` (TEXT) - Offer description
- `scope` (ENUM) - `global`, `city`, `rider` (who can use this offer)
- `reward_type` (ENUM) - `cash`, `voucher`, `bonus`
- `reward_value` (NUMERIC) - Reward amount/value
- `conditions` (JSONB) - Conditions to qualify (e.g., min orders, min rating)
- `start_date`, `end_date` (DATE) - Offer validity
- `active` (BOOLEAN) - Whether offer is active
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `active`, `end_date` (by admin)
- 🔒 Never update: `id`, `created_at`

**Relationships**:
- Used by: `offer_participation` table

---

### 16. **`offer_participation`** - Rider Offer Participation
**Purpose**: Tracks which riders participated in which offers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `offer_id` (BIGINT, FK → offers.id)
- `progress` (NUMERIC) - Progress towards offer completion (0-100)
- `completed` (BOOLEAN) - Whether offer is completed
- `reward_claimed` (BOOLEAN) - Whether reward was claimed
- `reward_claimed_at` (TIMESTAMP) - When reward was claimed
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `progress`, `completed` (by system when conditions met)
- ⚠️ Manual update: `reward_claimed`, `reward_claimed_at` (by rider or system)
- 🔒 Never update: `id`, `rider_id`, `offer_id`, `created_at`

**Relationships**:
- References: `riders.id`, `offers.id`
- Used by: Offer tracking, reward distribution

**Note**: Unique constraint on `(rider_id, offer_id)`.

---

## 💼 **SETTLEMENT & COMMISSIONS**

### 17. **`settlement_batches`** - Settlement Batches
**Purpose**: Groups withdrawal requests into batches for bulk processing.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `batch_number` (TEXT, UNIQUE) - Human-readable batch number (e.g., "BATCH-2025-01-001")
- `date_range_start`, `date_range_end` (DATE) - Settlement period
- `total_amount` (NUMERIC) - Total amount in batch
- `total_riders` (INTEGER) - Number of riders in batch
- `processing_fee_total` (NUMERIC) - Total processing fees
- `tds_total` (NUMERIC) - Total TDS deducted
- `status` (TEXT) - `pending`, `processing`, `completed`, `failed`, `cancelled`
- `settlement_file_url` (TEXT) - CSV/Excel file with settlement details
- `initiated_by` (INTEGER) - Admin user who initiated
- `processed_at`, `completed_at` (TIMESTAMP) - Processing timestamps
- `failure_reason` (TEXT) - Reason if batch failed
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `processed_at`, `completed_at` (by settlement system)
- 🔒 Never update: `id`, `batch_number`, `created_at`

**Relationships**:
- Referenced by: `withdrawal_requests.settlement_batch_id`
- Used by: Bulk payout processing, financial reports

---

### 18. **`commission_history`** - Commission Rules History
**Purpose**: Historical record of commission rates by order type and city.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_type` (ENUM) - `food`, `parcel`, `ride`, `3pl`
- `commission_percentage` (NUMERIC) - Commission percentage (e.g., 15.00 for 15%)
- `commission_fixed_amount` (NUMERIC) - Fixed commission amount (if applicable)
- `commission_type` (TEXT) - `percentage`, `fixed`, `hybrid`
- `city` (TEXT) - City name (NULL = global)
- `zone` (TEXT) - Zone within city (optional)
- `effective_from` (TIMESTAMP) - When this commission rate became effective
- `effective_to` (TIMESTAMP) - When this rate ended (NULL = currently active)
- `created_by` (INTEGER) - Admin user who created
- `created_at` (TIMESTAMP) - When record was created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `effective_to` (when new rate is set)
- 🔒 Never update: `id`, `effective_from`, `created_at`

**Relationships**:
- Used by: Commission calculation, financial reports

**Note**: Historical table - never update existing records, only add new ones.

---

## 📝 **ADDITIONAL RIDER TABLES**

### 19. **`rider_ratings`** - Rider Ratings Received
**Purpose**: Ratings given to riders by customers/merchants.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id)
- `order_id` (BIGINT, FK → orders.id) - Order for which rating was given
- `rated_by` (TEXT) - `customer`, `merchant`
- `rating` (INTEGER) - Rating value (1-5)
- `feedback` (TEXT) - Optional feedback text
- `created_at` (TIMESTAMP) - When rating was given

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: All fields (immutable)

**Relationships**:
- References: `riders.id`, `orders.id`
- Used by: Rider performance calculation, analytics

---

### 20. **`rider_leaderboard`** (Materialized View)
**Purpose**: Pre-calculated leaderboard of top-performing riders.

**Key Attributes**:
- `rider_id` (INTEGER)
- `rank` (INTEGER) - Leaderboard rank
- `total_orders` (INTEGER)
- `total_earnings` (NUMERIC)
- `avg_rating` (NUMERIC)
- `period` (TEXT) - `daily`, `weekly`, `monthly`

**When to Update**:
- ✅ Auto-updated: Refreshed periodically by scheduled job
- 🔒 Never manually update (it's a view)

**Note**: Materialized view - refresh with `REFRESH MATERIALIZED VIEW rider_leaderboard;`

---

## 🔗 **RIDER DOMAIN RELATIONSHIPS**

```
riders (1) ──→ (many) rider_documents
riders (1) ──→ (many) rider_devices
riders (1) ──→ (many) duty_logs
riders (1) ──→ (many) location_logs
riders (1) ──→ (many) wallet_ledger
riders (1) ──→ (many) withdrawal_requests
riders (1) ──→ (many) rider_vehicles
riders (1) ──→ (many) insurance_policies
riders (1) ──→ (many) notification_logs
riders (1) ──→ (many) notification_preferences
riders (1) ──→ (many) offer_participation
riders (1) ──→ (many) order_rider_assignments
riders (1) ──→ (many) rider_ratings
```

---

## 📊 **RIDER DOMAIN SUMMARY**

| Category | Tables | Purpose |
|----------|--------|---------|
| **Core Profile** | riders | Main rider information |
| **Verification** | rider_documents | KYC documents |
| **Security** | rider_devices, blacklist_history | Device management, security |
| **Operations** | duty_logs, location_logs | Duty status, location tracking |
| **Financial** | wallet_ledger, withdrawal_requests, rider_bank_accounts | Earnings, withdrawals |
| **Vehicles** | rider_vehicles, insurance_policies | Vehicle management |
| **Analytics** | rider_daily_analytics, rider_leaderboard | Performance metrics |
| **Communication** | notification_logs, notification_preferences | Notifications |
| **Rewards** | offers, offer_participation | Offers and rewards |
| **Settlement** | settlement_batches, commission_history | Payouts, commissions |

**Total**: 20+ tables in Rider Domain

---

## ⚠️ **IMPORTANT NOTES**

1. **Immutable Tables**: `wallet_ledger`, `duty_logs`, `location_logs` - Never update or delete
2. **Partitioned Tables**: `location_logs` (by month), `wallet_ledger` (by rider_id hash)
3. **Auto-Updated**: Most tables have `updated_at` via triggers
4. **Soft Deletes**: Some tables use `deleted_at` instead of hard deletes
5. **Unique Constraints**: One active vehicle per rider, one primary bank account per rider

---

**Next**: See `DATABASE_SCHEMA_CUSTOMER_DOMAIN.md` for Customer Domain documentation.
