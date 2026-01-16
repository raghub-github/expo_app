# Rider Domain - Workflow Documentation
## Part 2: Operations, Earnings & Financial Management

This document continues from Part 1 and explains the operational workflow after rider is active.

---

## 📋 **WORKFLOW CONTINUATION**

After rider is active and approved:
10. **Duty Management** → `duty_logs`
11. **Location Tracking** → `location_logs`
12. **Order Assignment** → `orders` (via `order_rider_assignments`)
13. **Order Actions** → `order_actions`
14. **Order Events** → `order_events`
15. **Wallet Earnings** → `wallet_ledger`
16. **Withdrawal Requests** → `withdrawal_requests`
17. **Settlement Batches** → `settlement_batches`
18. **Commission History** → `commission_history`

---

## 🟢 **STEP 10: DUTY MANAGEMENT**

### **Table: `duty_logs`**

**When to Use**: When rider turns duty ON/OFF - Rider toggles duty status in app.

**Purpose**: Tracks when riders turn duty ON/OFF (immutable log).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
status                      ENUM                 -- 'ON', 'OFF', 'AUTO_OFF'
timestamp                   TIMESTAMP            -- When status changed

-- Note: No updated_at - this is an IMMUTABLE log
```

**What Happens**:
1. Rider opens app and taps "Go Online" button
2. System creates record in `duty_logs`:
   - `status = 'ON'`
   - `timestamp = NOW()`
3. System updates `riders.status = 'ACTIVE'` (if not already)
4. Rider can now receive order assignments
5. When rider taps "Go Offline":
   - New record: `status = 'OFF'`
   - System updates `riders.status = 'INACTIVE'`
6. System can auto-set `status = 'AUTO_OFF'` if:
   - Rider inactive for too long
   - Low battery
   - Location not updating

**Duty Status Flow**:
```
OFF → ON → OFF
     ↓
  AUTO_OFF (system triggered)
```

**This is an IMMUTABLE log** - never update or delete records.

**Next Step**: After duty ON, proceed to **Location Tracking (Step 11)**

---

## 📍 **STEP 11: LOCATION TRACKING**

### **Table: `location_logs`**

**When to Use**: Continuously when rider is ON duty - App sends location updates every few seconds.

**Purpose**: Real-time location tracking for order assignment and live tracking (partitioned by month).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
lat                         DOUBLE PRECISION     -- Latitude
lon                         DOUBLE PRECISION     -- Longitude
battery_percent             INTEGER              -- Device battery percentage
accuracy                    DOUBLE PRECISION     -- GPS accuracy in meters
speed                       DOUBLE PRECISION     -- Current speed in km/h
heading                     DOUBLE PRECISION     -- Direction of movement (0-360 degrees)
created_at                  TIMESTAMP            -- When location recorded (PARTITION KEY)
```

**What Happens**:
1. Rider is ON duty
2. App sends location update every 5-10 seconds
3. System creates record in `location_logs`:
   - `lat = current_latitude`
   - `lon = current_longitude`
   - `battery_percent = device_battery`
   - `speed = current_speed`
   - `heading = direction`
4. System updates `riders.lat` and `riders.lon` (current location)
5. Order assignment algorithm uses this data to find nearest riders

**Important**:
- **Partitioned by month** for performance (e.g., `location_logs_y2025m01`)
- Old partitions can be archived
- High volume table (millions of records per month)

**Next Step**: After location tracking active, proceed to **Order Assignment (Step 12)**

---

## 📦 **STEP 12: ORDER ASSIGNMENT**

### **Table: `orders` (via `order_rider_assignments`)**

**When to Use**: When order is created - System assigns order to rider.

**Purpose**: Orders assigned to riders (see Orders Domain documentation for full details).

**Key Fields Related to Riders**:

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
order_type                  ENUM                 -- 'food', 'parcel', 'ride', '3pl'
pickup_address              TEXT                 -- Pickup address
drop_address                TEXT                 -- Drop address
pickup_lat, pickup_lon      DOUBLE PRECISION     -- Pickup coordinates
drop_lat, drop_lon          DOUBLE PRECISION     -- Drop coordinates
distance_km                 NUMERIC              -- Distance in km
fare_amount                 NUMERIC              -- Total fare
commission_amount           NUMERIC              -- Platform commission
rider_earning               NUMERIC              -- Rider earning (after commission)
status                      ENUM                 -- 'assigned', 'accepted', 'picked_up', 'delivered', etc.
```

**What Happens**:
1. Order is created (by customer)
2. System finds nearest available riders using `location_logs`
3. System creates assignment in `order_rider_assignments`:
   - `rider_id = selected_rider_id`
   - `order_id = order_id`
   - `assignment_status = 'pending'`
4. Rider receives notification
5. Rider accepts/rejects order (Step 13)

**Next Step**: After order assigned, proceed to **Order Actions (Step 13)**

---

## ✅ **STEP 13: ORDER ACTIONS**

### **Table: `order_actions`**

**When to Use**: When rider accepts/rejects order - Rider responds to order assignment.

**Purpose**: Logs all rider actions on orders (accept, reject, timeout).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
order_id                    BIGINT FK            -- References orders.id
rider_id                    INTEGER FK            -- References riders.id
action                      ENUM                 -- 'accept', 'reject', 'auto_reject', 'timeout'
reason                      TEXT                 -- Reason for action
timestamp                   TIMESTAMP            -- When action occurred
```

**What Happens**:
1. Rider receives order notification
2. Rider accepts order:
   - System creates record: `action = 'accept'`
   - Updates `orders.status = 'accepted'`
   - Updates `order_rider_assignments.assignment_status = 'accepted'`
3. If rider rejects:
   - System creates record: `action = 'reject'`, `reason = 'Too far'`
   - System assigns to next nearest rider
4. If rider doesn't respond in time:
   - System creates record: `action = 'timeout'`
   - System auto-assigns to next rider

**This is an IMMUTABLE log** - never update or delete.

**Next Step**: After order accepted, proceed to **Order Events (Step 14)**

---

## 📊 **STEP 14: ORDER EVENTS**

### **Table: `order_events`**

**When to Use**: Throughout order lifecycle - System logs all order events.

**Purpose**: Immutable log of all order events (picked up, in transit, delivered, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
order_id                    BIGINT FK            -- References orders.id
event                       TEXT NOT NULL        -- 'picked_up', 'in_transit', 'delivered', 'cancelled', etc.
actor_type                  TEXT                 -- 'rider', 'customer', 'system', 'merchant'
actor_id                    INTEGER              -- ID of actor
metadata                    JSONB                -- Additional event data

-- Audit
created_at                  TIMESTAMP            -- Auto: When event occurred
```

**What Happens**:
1. Rider picks up order:
   - System creates record: `event = 'picked_up'`, `actor_type = 'rider'`, `actor_id = rider_id`
   - Updates `orders.status = 'picked_up'`
2. Rider starts delivery:
   - System creates record: `event = 'in_transit'`
3. Rider delivers order:
   - System creates record: `event = 'delivered'`
   - Updates `orders.status = 'delivered'`
4. Earnings are calculated and added to wallet (Step 15)

**This is an IMMUTABLE log** - never update or delete.

**Next Step**: After order delivered, proceed to **Wallet Earnings (Step 15)**

---

## 💰 **STEP 15: WALLET EARNINGS**

### **Table: `wallet_ledger`**

**When to Use**: After order delivered - System credits earnings to rider wallet.

**Purpose**: Immutable ledger of all wallet transactions (partitioned by rider_id).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id (PARTITION KEY)
entry_type                  ENUM                 -- 'earning', 'penalty', 'onboarding_fee', 'adjustment', 'refund', 'bonus', 'referral_bonus'
amount                      NUMERIC(10,2)         -- Transaction amount (positive = credit, negative = debit)
balance                     NUMERIC(10,2)         -- Wallet balance after this transaction
ref                         TEXT                 -- Reference ID (e.g., order_id)
ref_type                    TEXT                 -- Reference type (e.g., "order", "withdrawal")
description                 TEXT                 -- Human-readable description
metadata                    JSONB                -- Additional transaction details

-- Audit
created_at                  TIMESTAMP            -- Auto: When transaction occurred
```

**What Happens**:
1. Order is delivered successfully
2. System calculates rider earning:
   - `rider_earning = fare_amount - commission_amount`
3. System creates record in `wallet_ledger`:
   - `entry_type = 'earning'`
   - `amount = rider_earning` (positive = credit)
   - `ref = order_id`
   - `ref_type = 'order'`
   - `description = 'Earning from order #12345'`
   - `balance = previous_balance + rider_earning`
4. Rider can view wallet balance and transaction history

**Entry Types**:
- **earning**: Order delivery earnings
- **penalty**: Penalties for cancellations, delays
- **onboarding_fee**: Onboarding fee payment
- **adjustment**: Manual adjustments by admin
- **refund**: Refunds for cancelled orders
- **bonus**: Performance bonuses
- **referral_bonus**: Referral rewards

**Important**:
- **Partitioned by rider_id** (hash partition) for performance
- **IMMUTABLE ledger** - never update or delete
- `balance` is calculated sequentially (each transaction adds/subtracts)

**Next Step**: After earnings credited, proceed to **Withdrawal Requests (Step 16)**

---

## 💸 **STEP 16: WITHDRAWAL REQUESTS**

### **Table: `withdrawal_requests`**

**When to Use**: When rider requests to withdraw money - Rider initiates withdrawal from wallet.

**Purpose**: Tracks rider requests to withdraw money from wallet to bank account.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
amount                      NUMERIC(10,2)         -- Amount to withdraw
status                      ENUM                 -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
bank_acc                    TEXT                 -- Bank account number
ifsc                        TEXT                 -- IFSC code
account_holder_name         TEXT                 -- Account holder name
upi_id                      TEXT                 -- UPI ID (if UPI transfer)
transaction_id              TEXT                 -- Bank transaction ID after transfer
settlement_batch_id         BIGINT FK            -- References settlement_batches.id (if part of batch)
processing_fee              NUMERIC              -- Fee charged for withdrawal
tds_amount                  NUMERIC              -- TDS deducted
net_amount                  NUMERIC              -- Final amount after fees and TDS
processed_at                TIMESTAMP            -- When processing started
completed_at                TIMESTAMP            -- When transfer completed
failure_reason              TEXT                 -- Reason if withdrawal failed
metadata                    JSONB                -- Additional metadata

-- Audit
created_at                  TIMESTAMP            -- Auto: When request created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider requests withdrawal (e.g., ₹1000)
2. System validates:
   - Wallet balance >= withdrawal amount
   - Minimum withdrawal amount check
   - Bank account verified
3. System creates record in `withdrawal_requests`:
   - `amount = 1000.00`
   - `status = 'pending'`
   - `bank_acc = rider_bank_account.account_number`
   - `ifsc = rider_bank_account.ifsc_code`
4. System creates debit entry in `wallet_ledger`:
   - `entry_type = 'withdrawal'` (or similar)
   - `amount = -1000.00` (negative = debit)
   - `ref = withdrawal_request_id`
5. Finance team processes withdrawal:
   - `status = 'processing'`
   - Initiates bank transfer
6. On success:
   - `status = 'completed'`
   - `transaction_id = bank_utr`
   - `completed_at = NOW()`
7. On failure:
   - `status = 'failed'`
   - `failure_reason = 'Insufficient funds'`
   - System creates credit entry in `wallet_ledger` (refund)

**Next Step**: If part of batch, proceed to **Settlement Batches (Step 17)**

---

## 📦 **STEP 17: SETTLEMENT BATCHES**

### **Table: `settlement_batches`**

**When to Use**: Periodically (daily/weekly) - Finance team groups withdrawals into batches.

**Purpose**: Groups withdrawal requests into batches for bulk processing.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
batch_number                TEXT UNIQUE          -- Human-readable batch number (e.g., "BATCH-2025-01-001")
date_range_start            DATE                 -- Settlement period start
date_range_end              DATE                 -- Settlement period end
total_amount                NUMERIC              -- Total amount in batch
total_riders                INTEGER              -- Number of riders in batch
processing_fee_total        NUMERIC              -- Total processing fees
tds_total                   NUMERIC              -- Total TDS deducted
status                      TEXT                 -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
settlement_file_url         TEXT                 -- CSV/Excel file with settlement details
initiated_by                INTEGER              -- Admin user who initiated
processed_at                TIMESTAMP            -- When processing started
completed_at                TIMESTAMP            -- When completed
failure_reason              TEXT                 -- Reason if batch failed

-- Audit
created_at                  TIMESTAMP            -- Auto: When batch created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Finance team creates settlement batch (e.g., daily batch)
2. System groups pending withdrawal requests:
   - Finds all `withdrawal_requests` with `status = 'pending'`
   - Groups by date range
3. System creates record in `settlement_batches`:
   - `batch_number = 'BATCH-2025-01-15-001'`
   - `total_amount = sum_of_all_withdrawals`
   - `total_riders = count_of_riders`
   - `status = 'pending'`
4. System updates `withdrawal_requests.settlement_batch_id = batch_id`
5. Finance team processes batch:
   - `status = 'processing'`
   - Generates settlement file
   - Initiates bulk bank transfer
6. On success:
   - `status = 'completed'`
   - Updates all `withdrawal_requests.status = 'completed'`

**Next Step**: After settlement, proceed to **Commission History (Step 18)**

---

## 💼 **STEP 18: COMMISSION HISTORY**

### **Table: `commission_history`**

**When to Use**: Admin setup - Historical record of commission rates.

**Purpose**: Historical record of commission rates by order type and city (for audit and reporting).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
order_type                  ENUM                 -- 'food', 'parcel', 'ride', '3pl'
commission_percentage       NUMERIC              -- Commission percentage (e.g., 15.00 for 15%)
commission_fixed_amount     NUMERIC              -- Fixed commission amount (if applicable)
commission_type             TEXT                 -- 'percentage', 'fixed', 'hybrid'
city                        TEXT                 -- City name (NULL = global)
zone                        TEXT                 -- Zone within city (optional)
effective_from              TIMESTAMP            -- When this commission rate became effective
effective_to                TIMESTAMP            -- When this rate ended (NULL = currently active)
created_by                  INTEGER              -- Admin user who created

-- Audit
created_at                  TIMESTAMP            -- Auto: When record created
```

**What Happens**:
1. Admin sets commission rate (e.g., "15% for Food orders in Delhi")
2. System creates record in `commission_history`:
   - `order_type = 'food'`
   - `commission_percentage = 15.00`
   - `city = 'Delhi'`
   - `effective_from = NOW()`
   - `effective_to = NULL` (currently active)
3. When admin changes commission rate:
   - Updates old record: `effective_to = NOW()`
   - Creates new record: `effective_from = NOW()`, `effective_to = NULL`
4. System uses active rate (where `effective_to IS NULL`) for commission calculation

**This is a HISTORICAL table** - never update existing records, only add new ones.

---

## 🔗 **RELATIONSHIPS IN OPERATIONS FLOW**

```
riders (1)
    ↓
    ├─→ duty_logs (many)
    ├─→ location_logs (many)
    ├─→ orders (many, via order_rider_assignments)
    │       ├─→ order_actions (many)
    │       └─→ order_events (many)
    ├─→ wallet_ledger (many)
    ├─→ withdrawal_requests (many)
    │       └─→ settlement_batches (many)
    └─→ commission_history (reference table)
```

---

## 📝 **SUMMARY: OPERATIONS & EARNINGS TABLES**

| Step | Table | Purpose | Key Fields |
|------|-------|---------|------------|
| 10 | `duty_logs` | Duty management | `status`, `timestamp` |
| 11 | `location_logs` | Location tracking | `lat`, `lon`, `speed`, `heading` |
| 12 | `orders` | Order assignment | `rider_id`, `status`, `rider_earning` |
| 13 | `order_actions` | Order actions | `action`, `reason` |
| 14 | `order_events` | Order events | `event`, `actor_type` |
| 15 | `wallet_ledger` | Wallet earnings | `entry_type`, `amount`, `balance` |
| 16 | `withdrawal_requests` | Withdrawal requests | `amount`, `status`, `transaction_id` |
| 17 | `settlement_batches` | Settlement batches | `batch_number`, `total_amount`, `status` |
| 18 | `commission_history` | Commission history | `commission_percentage`, `effective_from` |

**Total Tables in Part 2**: 9 tables

---

**Next**: See `DATABASE_SCHEMA_RIDER_DOMAIN_WORKFLOW_PART3_ANALYTICS_REWARDS.md` for analytics, ratings, offers, rewards, and notifications.
