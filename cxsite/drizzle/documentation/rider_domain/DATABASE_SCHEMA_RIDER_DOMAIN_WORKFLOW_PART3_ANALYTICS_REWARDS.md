# Rider Domain - Workflow Documentation
## Part 3: Analytics, Ratings, Offers & Rewards

This document continues from Part 2 and explains analytics, ratings, offers, rewards, and notifications.

---

## 📋 **WORKFLOW CONTINUATION**

After operations and earnings:
19. **Daily Analytics** → `rider_daily_analytics`
20. **Rider Ratings** → `rider_ratings`
21. **Offers** → `offers`
22. **Offer Participation** → `offer_participation`
23. **Notification Logs** → `notification_logs`
24. **Notification Preferences** → `notification_preferences`

---

## 📊 **STEP 19: DAILY ANALYTICS**

### **Table: `rider_daily_analytics`**

**When to Use**: Daily (automated) - System calculates daily performance metrics.

**Purpose**: Pre-aggregated daily performance metrics for riders (for fast reporting and dashboards).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
date                        DATE                 -- Analytics date
total_orders                INTEGER              -- Total orders completed
total_earnings              NUMERIC              -- Total earnings for the day
total_distance_km           NUMERIC              -- Total distance traveled
avg_rating                  NUMERIC              -- Average customer rating received
on_time_delivery_rate       NUMERIC              -- Percentage of on-time deliveries
cancellation_rate           NUMERIC              -- Percentage of cancelled orders

-- Audit
created_at                  TIMESTAMP            -- Auto: When analytics calculated
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. **Scheduled Job** runs daily (e.g., at midnight)
2. System aggregates data from `orders`, `order_rider_assignments`, `rider_ratings`:
   - Counts completed orders
   - Sums earnings from `wallet_ledger`
   - Calculates total distance from `location_logs`
   - Calculates average rating from `rider_ratings`
   - Calculates on-time delivery rate
   - Calculates cancellation rate
3. System creates/updates record in `rider_daily_analytics`:
   - `date = '2025-01-15'`
   - `total_orders = 25`
   - `total_earnings = 2500.00`
   - `avg_rating = 4.5`
4. Used for:
   - Rider dashboard (shows daily performance)
   - Leaderboards
   - Performance reports
   - Analytics queries (fast aggregation)

**Note**: One record per rider per day. Unique constraint on `(rider_id, date)`.

**Next Step**: After analytics calculated, proceed to **Rider Ratings (Step 20)**

---

## ⭐ **STEP 20: RIDER RATINGS**

### **Table: `rider_ratings`**

**When to Use**: After order delivered - Customer/merchant rates the rider.

**Purpose**: Ratings given to riders by customers/merchants after order completion.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
order_id                    BIGINT FK            -- References orders.id
rated_by                    TEXT                 -- 'customer', 'merchant'
rating                      INTEGER              -- Rating value (1-5)
feedback                    TEXT                 -- Optional feedback text

-- Audit
created_at                  TIMESTAMP            -- Auto: When rating given
```

**What Happens**:
1. Order is delivered successfully
2. Customer receives rating prompt in app
3. Customer rates rider (e.g., 5 stars)
4. System creates record in `rider_ratings`:
   - `rider_id = rider_id`
   - `order_id = order_id`
   - `rated_by = 'customer'`
   - `rating = 5`
   - `feedback = 'Great service!'`
5. System updates `rider_daily_analytics.avg_rating` (recalculated)
6. System can calculate overall rider rating from all ratings

**This is an IMMUTABLE rating** - never update or delete.

**Next Step**: After ratings, proceed to **Offers (Step 21)**

---

## 🎁 **STEP 21: OFFERS**

### **Table: `offers`**

**When to Use**: Admin setup - Platform creates offers for riders (bonuses, incentives).

**Purpose**: System-wide offers for riders (e.g., "Complete 10 orders, get ₹500 bonus").

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
title                       TEXT NOT NULL        -- Offer title
description                 TEXT                 -- Offer description
scope                       ENUM                 -- 'global', 'city', 'rider' (who can use)
condition                   JSONB                -- Conditions to qualify (e.g., {"min_orders": 10, "min_rating": 4.0})
reward_type                 ENUM                 -- 'cash', 'voucher', 'bonus'
reward_amount               NUMERIC(10,2)        -- Reward amount/value
reward_metadata             JSONB                -- Additional reward data
start_date                  TIMESTAMP            -- Offer start date
end_date                    TIMESTAMP            -- Offer end date
active                      BOOLEAN               -- Whether offer is active
metadata                    JSONB                -- Additional metadata

-- Audit
created_at                  TIMESTAMP            -- Auto: When offer created
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Admin creates offer (e.g., "Weekend Bonus: Complete 5 orders, get ₹200")
2. System creates record in `offers`:
   - `title = 'Weekend Bonus'`
   - `scope = 'global'` (or 'city' for specific city)
   - `condition = {'min_orders': 5, 'date_range': 'weekend'}`
   - `reward_type = 'cash'`
   - `reward_amount = 200.00`
   - `start_date = '2025-01-18'`
   - `end_date = '2025-01-19'`
   - `active = TRUE`
3. System notifies eligible riders
4. Riders participate in offer (Step 22)

**Offer Scopes**:
- **global**: All riders can participate
- **city**: Only riders in specific city
- **rider**: Specific riders (targeted offers)

**Next Step**: After offer created, proceed to **Offer Participation (Step 22)**

---

## 🎯 **STEP 22: OFFER PARTICIPATION**

### **Table: `offer_participation`**

**When to Use**: When rider participates in offer - System tracks rider progress.

**Purpose**: Tracks which riders participated in which offers and their progress.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
offer_id                    BIGINT FK            -- References offers.id
completed                   BOOLEAN               -- Whether offer is completed
progress                    JSONB                -- Progress tracking (e.g., {"orders_completed": 3, "target": 5})
reward_claimed              BOOLEAN               -- Whether reward was claimed
reward_claimed_at            TIMESTAMP            -- When reward was claimed

-- Audit
created_at                  TIMESTAMP            -- Auto: When participation started
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider becomes eligible for offer (meets scope criteria)
2. System creates record in `offer_participation`:
   - `rider_id = rider_id`
   - `offer_id = offer_id`
   - `completed = FALSE`
   - `progress = {'orders_completed': 0, 'target': 5}`
   - `reward_claimed = FALSE`
3. As rider completes orders, system updates:
   - `progress = {'orders_completed': 3, 'target': 5}`
4. When conditions met (e.g., 5 orders completed):
   - `completed = TRUE`
   - System credits reward to `wallet_ledger`:
     - `entry_type = 'bonus'`
     - `amount = 200.00`
     - `ref = offer_id`
5. Rider claims reward:
   - `reward_claimed = TRUE`
   - `reward_claimed_at = NOW()`

**Unique Constraint**: One participation record per `(rider_id, offer_id)`.

**Next Step**: After offer participation, proceed to **Notification Logs (Step 23)**

---

## 🔔 **STEP 23: NOTIFICATION LOGS**

### **Table: `notification_logs`**

**When to Use**: When notification is sent - System logs all notifications sent to riders.

**Purpose**: Logs all notifications sent to riders (push, SMS, email).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
notification_type           TEXT                 -- 'order', 'payment', 'offer', 'system', 'promotional'
channel                     TEXT                 -- 'push', 'sms', 'email'
title                       TEXT                 -- Notification title
body                        TEXT                 -- Notification message
status                      TEXT                 -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
provider                    TEXT                 -- Notification provider (FCM, MSG91, etc.)
provider_message_id         TEXT                 -- Provider's message ID

-- Audit
created_at                  TIMESTAMP            -- Auto: When notification sent
```

**What Happens**:
1. System needs to send notification (e.g., new order assigned)
2. System checks `notification_preferences` (Step 24) for rider preferences
3. System creates record in `notification_logs`:
   - `notification_type = 'order'`
   - `channel = 'push'`
   - `title = 'New Order Assigned'`
   - `body = 'You have a new order #12345'`
   - `status = 'pending'`
4. System sends notification via provider (FCM, MSG91, etc.)
5. Provider responds:
   - `status = 'sent'` or `'delivered'` or `'failed'`
   - `provider_message_id = provider_id`

**Notification Types**:
- **order**: Order assignments, updates
- **payment**: Payment confirmations, withdrawal updates
- **offer**: New offers, offer completion
- **system**: System updates, maintenance
- **promotional**: Promotional messages

**Next Step**: After notification sent, proceed to **Notification Preferences (Step 24)**

---

## ⚙️ **STEP 24: NOTIFICATION PREFERENCES**

### **Table: `notification_preferences`**

**When to Use**: When rider sets preferences - Rider configures notification settings in app.

**Purpose**: Rider preferences for notification types and channels (respects quiet hours).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
notification_type           TEXT NOT NULL        -- 'order', 'payment', 'offer', 'system', 'promotional'
channel                     TEXT NOT NULL        -- 'push', 'sms', 'email'
enabled                     BOOLEAN               -- Whether this notification type/channel is enabled
quiet_hours_start           TIME                 -- Start of quiet hours (e.g., '22:00:00')
quiet_hours_end             TIME                 -- End of quiet hours (e.g., '08:00:00')

-- Audit
created_at                  TIMESTAMP            -- Auto: When preference set
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider opens notification settings in app
2. Rider toggles preferences:
   - Order notifications: Push = ON, SMS = OFF
   - Payment notifications: Push = ON, Email = ON
   - Promotional notifications: All = OFF
3. Rider sets quiet hours: 10 PM - 8 AM
4. System creates/updates records in `notification_preferences`:
   - Record 1: `notification_type = 'order'`, `channel = 'push'`, `enabled = TRUE`
   - Record 2: `notification_type = 'order'`, `channel = 'sms'`, `enabled = FALSE`
   - Record 3: `notification_type = 'payment'`, `channel = 'push'`, `enabled = TRUE`
   - etc.
5. When sending notification (Step 23), system checks:
   - Is this type/channel enabled?
   - Is it within quiet hours?
   - If both OK, send notification

**Unique Constraint**: One preference per `(rider_id, notification_type, channel)`.

---

## 🔗 **COMPLETE WORKFLOW RELATIONSHIPS**

```
riders (1)
    ↓
    ├─→ rider_documents (many)
    ├─→ rider_devices (many)
    ├─→ rider_vehicles (many)
    │       └─→ insurance_policies (many)
    ├─→ rider_bank_accounts (many)
    ├─→ onboarding_payments (many)
    ├─→ blacklist_history (many)
    ├─→ duty_logs (many)
    ├─→ location_logs (many)
    ├─→ orders (many, via order_rider_assignments)
    │       ├─→ order_actions (many)
    │       └─→ order_events (many)
    ├─→ wallet_ledger (many)
    ├─→ withdrawal_requests (many)
    │       └─→ settlement_batches (many)
    ├─→ rider_daily_analytics (many, one per day)
    ├─→ rider_ratings (many)
    ├─→ offer_participation (many)
    │       └─→ offers (many)
    ├─→ notification_logs (many)
    └─→ notification_preferences (many)

offers (1)
    └─→ offer_participation (many)
            └─→ riders (many)

settlement_batches (1)
    └─→ withdrawal_requests (many)
            └─→ riders (many)
```

---

## 📝 **COMPLETE SUMMARY: ALL 20+ TABLES IN WORKFLOW ORDER**

| Step | Table | Purpose | When Used |
|------|-------|---------|-----------|
| 1 | `riders` | Rider registration | First step - Mobile registration |
| 2 | `rider_documents` | Document upload | After registration - KYC documents |
| 3 | `rider_devices` | Device registration | After documents - App installation |
| 4 | `rider_vehicles` | Vehicle registration | After device - Vehicle details |
| 5 | `insurance_policies` | Insurance | After vehicle - Insurance details |
| 6 | `rider_bank_accounts` | Bank account | After insurance - Payout account |
| 7 | `onboarding_payments` | Onboarding payment | After bank - Fee payment |
| 8 | `riders` (update) | KYC verification | After payment - Admin verification |
| 9 | `blacklist_history` | Block/unblock | When needed - Admin action |
| 10 | `duty_logs` | Duty management | When active - Duty ON/OFF |
| 11 | `location_logs` | Location tracking | When ON duty - Continuous updates |
| 12 | `orders` | Order assignment | When order created - System assignment |
| 13 | `order_actions` | Order actions | When rider responds - Accept/reject |
| 14 | `order_events` | Order events | Throughout order - Event logging |
| 15 | `wallet_ledger` | Wallet earnings | After delivery - Earnings credit |
| 16 | `withdrawal_requests` | Withdrawal requests | When rider requests - Withdrawal |
| 17 | `settlement_batches` | Settlement batches | Periodic - Batch processing |
| 18 | `commission_history` | Commission history | Admin setup - Commission rates |
| 19 | `rider_daily_analytics` | Daily analytics | Daily (automated) - Performance metrics |
| 20 | `rider_ratings` | Rider ratings | After delivery - Customer ratings |
| 21 | `offers` | Offers | Admin setup - Platform offers |
| 22 | `offer_participation` | Offer participation | When rider participates - Progress tracking |
| 23 | `notification_logs` | Notification logs | When notification sent - Logging |
| 24 | `notification_preferences` | Notification preferences | When rider sets - Preference configuration |

**Total Tables**: 20+ tables documented in workflow order

---

## 🎯 **QUICK REFERENCE: TABLE USAGE BY PHASE**

### **Phase 1: Registration & Onboarding** (Steps 1-9)
- Registration → Documents → Device → Vehicle → Insurance → Bank → Payment → Verification → Block (if needed)

### **Phase 2: Operations & Earnings** (Steps 10-18)
- Duty → Location → Orders → Actions → Events → Wallet → Withdrawal → Settlement → Commission

### **Phase 3: Analytics & Rewards** (Steps 19-24)
- Analytics → Ratings → Offers → Participation → Notifications → Preferences

---

**Documentation Complete!** All 20+ rider domain tables documented in workflow order with detailed attributes and usage instructions.
