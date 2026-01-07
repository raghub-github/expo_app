# Customer Domain - Part 5: Support & Analytics

## 🎫 **SUPPORT & TICKETS TABLES**

### 1. **`customer_tickets`** - Support Tickets
**Purpose**: Customer support tickets for issues, complaints, and queries.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_id` (TEXT, UNIQUE) - Human-readable ticket ID
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id) - Related order (if applicable)
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`
- `issue_category` (TEXT) - `ORDER`, `PAYMENT`, `DELIVERY`, `REFUND`, `ACCOUNT`, `TECHNICAL`
- `issue_subcategory` (TEXT) - More specific category
- `subject`, `description` (TEXT) - Issue details
- `attachments` (TEXT[]) - Array of attachment URLs
- `priority` (TEXT) - `LOW`, `MEDIUM`, `HIGH`, `URGENT`, `CRITICAL`
- `status` (ENUM) - `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`
- `assigned_to_agent_id`, `assigned_to_agent_name` (INTEGER/TEXT) - Assigned agent
- `assigned_at` (TIMESTAMP) - When assigned
- `resolution` (TEXT) - Resolution details
- `resolution_time_minutes` (INTEGER) - Time to resolve
- `resolved_at` (TIMESTAMP) - When resolved
- `resolved_by` (INTEGER) - Agent who resolved
- `customer_satisfaction_rating` (SMALLINT) - Rating 1-5
- `follow_up_required` (BOOLEAN) - Whether follow-up needed
- `follow_up_date` (TIMESTAMP) - Follow-up date
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `resolution_time_minutes` (on resolution)
- ⚠️ Manual update: `status`, `assigned_to_agent_id`, `resolution` (by support agent)
- 🔒 Never update: `id`, `ticket_id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`
- Used by: Support system, customer service dashboard

---

### 2. **`customer_ticket_messages`** - Ticket Messages
**Purpose**: Messages within support tickets (conversation thread).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_id` (BIGINT, FK → customer_tickets.id)
- `message_text` (TEXT) - Message content
- `message_type` (TEXT) - `TEXT`, `IMAGE`, `FILE`, `SYSTEM`
- `sender_type` (TEXT) - `CUSTOMER`, `AGENT`, `SYSTEM`
- `sender_id` (BIGINT) - Sender ID
- `sender_name` (TEXT) - Sender name
- `attachments` (TEXT[]) - Array of attachment URLs
- `is_read` (BOOLEAN) - Whether message is read
- `read_at` (TIMESTAMP) - When read
- `created_at` (TIMESTAMP) - When message was sent

**When to Update**:
- ✅ Auto-updated: `is_read`, `read_at` (when message is read)
- 🔒 Never update: `id`, `ticket_id`, `message_text`, `created_at`

**Relationships**:
- References: `customer_tickets.id`
- Used by: Support chat interface

---

### 3. **`customer_disputes`** - Disputes
**Purpose**: Legal disputes raised by customers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `dispute_id` (TEXT, UNIQUE) - Unique dispute ID
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id)
- `ticket_id` (BIGINT, FK → customer_tickets.id) - Related ticket
- `dispute_type` (TEXT) - `REFUND`, `QUALITY`, `NON_DELIVERY`, `OVERCHARGE`, `FRAUD`
- `dispute_reason`, `dispute_description` (TEXT) - Dispute details
- `disputed_against` (TEXT) - `MERCHANT`, `RIDER`, `PLATFORM`
- `disputed_against_id` (BIGINT) - ID of disputed entity
- `evidence_urls` (TEXT[]) - Evidence files
- `evidence_description` (TEXT) - Evidence description
- `disputed_amount`, `refund_amount` (NUMERIC) - Amounts
- `dispute_status` (TEXT) - `OPEN`, `INVESTIGATING`, `RESOLVED`, `REJECTED`, `ESCALATED`
- `resolution`, `resolution_amount` (TEXT/NUMERIC) - Resolution details
- `resolved_at` (TIMESTAMP) - When resolved
- `resolved_by` (INTEGER) - Who resolved
- `legal_case_number`, `legal_notes` (TEXT) - Legal information
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `dispute_status`, `resolution`, `resolved_at` (by admin/legal team)
- 🔒 Never update: `id`, `dispute_id`, `customer_id`, `order_id`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`, `customer_tickets.id`
- Used by: Legal team, dispute resolution

---

### 4. **`customer_refund_requests`** - Refund Requests
**Purpose**: Customer-initiated refund requests.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `refund_request_id` (TEXT, UNIQUE) - Unique request ID
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id)
- `refund_type` (TEXT) - `FULL`, `PARTIAL`, `ITEM`, `DELIVERY_FEE`
- `refund_reason`, `refund_reason_code`, `refund_description` (TEXT) - Refund details
- `requested_amount` (NUMERIC) - Amount requested
- `approved_amount` (NUMERIC) - Amount approved
- `refund_items` (JSONB) - Items for partial refund
- `refund_status` (TEXT) - `PENDING`, `APPROVED`, `REJECTED`, `PROCESSING`, `COMPLETED`
- `processed_by` (INTEGER) - Who processed
- `processed_at` (TIMESTAMP) - When processed
- `rejection_reason` (TEXT) - If rejected
- `completed_at` (TIMESTAMP) - When completed
- `refund_mode` (TEXT) - `ORIGINAL_PAYMENT`, `WALLET`, `COUPON`
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `refund_status`, `approved_amount`, `processed_by` (by admin)
- 🔒 Never update: `id`, `refund_request_id`, `customer_id`, `order_id`, `requested_amount`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`
- Used by: Refund processing system

---

## 🛡️ **FRAUD & TRUST TABLES**

### 5. **`customer_trust_score`** - Trust Score Tracking
**Purpose**: Calculated trust and fraud scores for customers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One record per customer
- `trust_score` (NUMERIC) - Overall trust score (0-100, default: 100.0)
- `fraud_score` (NUMERIC) - Fraud risk score (0-100, default: 0.0)
- `risk_level` (ENUM) - `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `payment_reliability_score` (NUMERIC) - Payment reliability (0-100)
- `order_completion_score` (NUMERIC) - Order completion rate (0-100)
- `false_complaint_score` (NUMERIC) - False complaint rate (0-100)
- `verification_score` (NUMERIC) - Verification completeness (0-100)
- `is_fraudulent`, `is_suspicious`, `requires_review` (BOOLEAN) - Flags
- `last_calculated_at` (TIMESTAMP) - When scores were last calculated
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: All scores (by ML model/system), `last_calculated_at`, `updated_at`
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)
- Used by: Fraud detection, risk assessment, order approval

---

### 6. **`customer_fraud_alerts`** - Fraud Alerts
**Purpose**: Alerts generated for suspicious/fraudulent activities.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id) - Related order (if applicable)
- `alert_type` (TEXT) - `PAYMENT_FRAUD`, `FALSE_COMPLAINT`, `LOCATION_MISMATCH`, `DEVICE_MISMATCH`, `MULTIPLE_ACCOUNTS`
- `alert_severity` (ENUM) - `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `alert_description` (TEXT) - Alert description
- `evidence` (JSONB) - Evidence data
- `action_taken` (TEXT) - Action taken
- `action_taken_at` (TIMESTAMP) - When action was taken
- `action_taken_by` (INTEGER) - Who took action
- `is_resolved` (BOOLEAN) - Whether alert is resolved
- `resolved_at` (TIMESTAMP) - When resolved
- `resolution_notes` (TEXT) - Resolution notes
- `created_at` (TIMESTAMP) - When alert was created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `action_taken`, `is_resolved`, `resolved_at` (by fraud team)
- 🔒 Never update: `id`, `customer_id`, `alert_type`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`
- Used by: Fraud detection system, security monitoring

---

### 7. **`customer_blocks`** - Account Blocks
**Purpose**: Tracks when customers are blocked from services.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `block_type` (TEXT) - `SERVICE_BLOCK`, `ACCOUNT_BLOCK`, `PAYMENT_BLOCK`
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE` (NULL = all services)
- `block_reason`, `block_reason_code`, `block_notes` (TEXT) - Block details
- `blocked_by` (TEXT) - `SYSTEM`, `ADMIN`, `FRAUD_DETECTION`
- `blocked_by_id` (INTEGER) - Who blocked
- `blocked_by_name` (TEXT) - Name of blocker
- `blocked_at` (TIMESTAMP) - When blocked
- `blocked_until` (TIMESTAMP) - Block expiry (NULL = permanent)
- `auto_unblock` (BOOLEAN) - Whether to auto-unblock
- `is_unblocked` (BOOLEAN) - Whether currently unblocked
- `unblocked_at` (TIMESTAMP) - When unblocked
- `unblocked_by` (INTEGER) - Who unblocked
- `unblock_reason` (TEXT) - Unblock reason
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `is_unblocked`, `unblocked_at` (if auto_unblock = TRUE), `updated_at`
- ⚠️ Manual update: `is_unblocked`, `unblocked_by`, `unblock_reason` (by admin)
- 🔒 Never update: `id`, `customer_id`, `blocked_at`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Service access control, fraud prevention

---

### 8. **`customer_suspicious_activity`** - Suspicious Activity Log
**Purpose**: Logs suspicious activities detected by system/ML models.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `activity_type` (TEXT) - `UNUSUAL_ORDER_PATTERN`, `LOCATION_JUMP`, `PAYMENT_FAILURE_SPIKE`, `MULTIPLE_CANCELLATIONS`
- `activity_description` (TEXT) - Description
- `detected_by` (TEXT) - `SYSTEM`, `ML_MODEL`, `MANUAL_REVIEW`
- `detection_confidence` (NUMERIC) - Confidence score (0-100)
- `risk_score` (NUMERIC) - Risk score
- `evidence` (JSONB) - Evidence data
- `requires_review` (BOOLEAN) - Whether review is required
- `reviewed` (BOOLEAN) - Whether reviewed
- `reviewed_at` (TIMESTAMP) - When reviewed
- `reviewed_by` (INTEGER) - Who reviewed
- `review_notes` (TEXT) - Review notes
- `action_recommended`, `action_taken` (TEXT) - Actions
- `created_at` (TIMESTAMP) - When detected

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `reviewed`, `reviewed_at`, `reviewed_by`, `action_taken` (by fraud team)
- 🔒 Never update: `id`, `customer_id`, `activity_type`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Fraud detection, risk monitoring

---

### 9. **`customer_verification_history`** - Verification History
**Purpose**: Complete history of all verification attempts.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `verification_type` (ENUM) - `MOBILE`, `EMAIL`, `IDENTITY`, `ADDRESS`, `PAYMENT_METHOD`
- `verification_method` (TEXT) - `OTP`, `EMAIL_LINK`, `DOCUMENT`, `BIOMETRIC`
- `verification_status` (TEXT) - `INITIATED`, `SUCCESS`, `FAILED`, `EXPIRED`
- `attempt_number` (INTEGER) - Attempt number
- `failure_reason` (TEXT) - Reason if failed
- `ip_address`, `device_id` (TEXT) - Context
- `created_at` (TIMESTAMP) - When verification was attempted

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- References: `customers.id`
- Used by: Security audit, verification tracking

---

## 📊 **ANALYTICS TABLES**

### 10. **`customer_activity_log`** - Activity Log
**Purpose**: Comprehensive log of all customer activities.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `activity_type` (TEXT) - `LOGIN`, `LOGOUT`, `ORDER_PLACED`, `ORDER_CANCELLED`, `PAYMENT_FAILED`, `ADDRESS_ADDED`, etc.
- `activity_description` (TEXT) - Description
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`
- `order_id` (BIGINT, FK → orders.id) - Related order
- `device_id`, `ip_address` (TEXT) - Device/network info
- `location_lat`, `location_lon` (NUMERIC) - Location
- `activity_metadata` (JSONB) - Additional data
- `created_at` (TIMESTAMP) - When activity occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system on each activity)
- 🔒 Never update: This is an **immutable activity log** - never update or delete

**Relationships**:
- References: `customers.id`, `orders.id` (optional)
- Used by: Analytics, behavior tracking, audit

---

### 11. **`customer_login_history`** - Login History
**Purpose**: Detailed login attempt history.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `login_method` (TEXT) - `OTP`, `PASSWORD`, `GOOGLE`, `FACEBOOK`, `BIOMETRIC`
- `login_success` (BOOLEAN) - Whether login succeeded
- `device_id`, `device_type`, `device_model` (TEXT) - Device info
- `ip_address`, `ip_location`, `user_agent` (TEXT) - Network info
- `failure_reason` (TEXT) - Reason if failed
- `session_id` (BIGINT, FK → customer_sessions.id) - Session created
- `created_at` (TIMESTAMP) - When login was attempted

**When to Update**:
- ✅ Auto-updated: All fields (by auth system)
- 🔒 Never update: This is an **immutable login log** - never update or delete

**Relationships**:
- References: `customers.id`, `customer_sessions.id` (optional)
- Used by: Security monitoring, fraud detection

---

### 12. **`customer_daily_analytics`** - Daily Analytics Summary
**Purpose**: Pre-aggregated daily metrics per customer.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `analytics_date` (DATE) - Analytics date
- `total_orders`, `completed_orders`, `cancelled_orders` (INTEGER) - Order counts
- `food_orders`, `parcel_orders`, `ride_orders` (INTEGER) - Service breakdown
- `total_spent`, `total_saved`, `tips_given` (NUMERIC) - Financial metrics
- `avg_rating_given` (NUMERIC) - Average rating given
- `ratings_count` (INTEGER) - Number of ratings given
- `app_opens` (INTEGER) - App open count
- `time_spent_minutes` (INTEGER) - Time spent in app
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: All metrics (by scheduled job daily)
- 🔒 Never update: `id`, `customer_id`, `analytics_date`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Analytics dashboards, reports

**Note**: Unique constraint on `(customer_id, analytics_date)` - one record per customer per day.

---

### 13. **`customer_service_analytics`** - Service-Specific Analytics
**Purpose**: Analytics broken down by service type.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`
- `total_orders`, `completed_orders`, `cancelled_orders` (INTEGER) - Order metrics
- `cancellation_rate` (NUMERIC) - Cancellation percentage
- `total_spent`, `average_order_value` (NUMERIC) - Financial metrics
- `first_order_at`, `last_order_at` (TIMESTAMP) - Order timestamps
- `avg_days_between_orders` (NUMERIC) - Order frequency
- `avg_rating_given` (NUMERIC) - Average rating
- `ratings_given_count` (INTEGER) - Rating count
- `favorite_merchant_ids` (BIGINT[]) - Top 3 favorite merchants
- `last_updated_at`, `created_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: All metrics (by scheduled job)
- 🔒 Never update: `id`, `customer_id`, `service_type`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Service-specific analytics, recommendations

**Note**: Unique constraint on `(customer_id, service_type)` - one record per customer per service.

---

### 14. **`customer_referrals`** - Referral Tracking
**Purpose**: Tracks customer referrals and rewards.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `referrer_customer_id` (BIGINT, FK → customers.id) - Who referred
- `referred_customer_id` (BIGINT, FK → customers.id, UNIQUE) - Who was referred
- `referral_code` (TEXT) - Referral code used
- `referral_status` (TEXT) - `PENDING`, `COMPLETED`, `EXPIRED`
- `referrer_reward_amount` (NUMERIC) - Reward for referrer
- `referrer_reward_type` (TEXT) - `CASH`, `COUPON`, `POINTS`
- `referrer_reward_given` (BOOLEAN) - Whether reward given
- `referrer_reward_given_at` (TIMESTAMP) - When reward given
- `referred_reward_amount`, `referred_reward_type` (NUMERIC/TEXT) - Reward for referred
- `referred_reward_given`, `referred_reward_given_at` (BOOLEAN/TIMESTAMP) - Referred reward status
- `required_orders` (INTEGER) - Orders required to complete referral
- `completed_orders` (INTEGER) - Orders completed by referred customer
- `completion_deadline` (TIMESTAMP) - Deadline to complete
- `completed_at` (TIMESTAMP) - When referral completed
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `completed_orders`, `referral_status`, `completed_at` (on order completion), `updated_at`
- ⚠️ Manual update: `referrer_reward_given`, `referred_reward_given` (when rewards distributed)
- 🔒 Never update: `id`, `referrer_customer_id`, `referred_customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (both referrer and referred)
- Used by: Referral program, reward distribution

**Note**: Unique constraint on `referred_customer_id` - one referral per customer.

---

### 15. **`customer_referral_rewards`** - Referral Rewards History
**Purpose**: History of referral rewards given.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `referral_id` (BIGINT, FK → customer_referrals.id)
- `customer_id` (BIGINT, FK → customers.id) - Who received reward
- `reward_type` (TEXT) - `CASH`, `COUPON`, `POINTS`
- `reward_amount` (NUMERIC) - Reward amount
- `reward_status` (TEXT) - `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
- `coupon_code` (TEXT) - If reward is coupon
- `wallet_transaction_id` (BIGINT) - If reward is cash
- `points_transaction_id` (BIGINT) - If reward is points
- `processed_at` (TIMESTAMP) - When processed
- `created_at` (TIMESTAMP) - When reward was created

**When to Update**:
- ✅ Auto-updated: `reward_status`, `processed_at` (by reward system)
- 🔒 Never update: `id`, `referral_id`, `customer_id`, `reward_amount`, `created_at`

**Relationships**:
- References: `customer_referrals.id`, `customers.id`
- Used by: Reward tracking, financial reports

---

### 16. **`customer_consent_log`** - Consent History
**Purpose**: GDPR-compliant consent tracking.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `consent_type` (TEXT) - `MARKETING`, `DATA_PROCESSING`, `DATA_SHARING`, `COOKIES`
- `consent_status` (TEXT) - `GRANTED`, `REVOKED`
- `consent_method` (TEXT) - `APP`, `WEB`, `EMAIL`, `SMS`
- `ip_address`, `user_agent` (TEXT) - Context
- `consent_text` (TEXT) - Consent text shown
- `created_at` (TIMESTAMP) - When consent was given/revoked

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable consent log** - never update or delete

**Relationships**:
- References: `customers.id`
- Used by: GDPR compliance, audit

---

### 17. **`customer_data_deletion_requests`** - Data Deletion Requests
**Purpose**: GDPR data deletion requests.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `request_id` (TEXT, UNIQUE) - Unique request ID
- `request_reason` (TEXT) - Reason for deletion
- `request_status` (TEXT) - `PENDING`, `PROCESSING`, `COMPLETED`, `REJECTED`
- `requested_at` (TIMESTAMP) - When requested
- `processed_at` (TIMESTAMP) - When processing started
- `completed_at` (TIMESTAMP) - When completed
- `processed_by` (INTEGER) - Who processed
- `rejection_reason` (TEXT) - If rejected
- `deletion_scope` (TEXT[]) - What data to delete
- `created_at` (TIMESTAMP) - When request was created

**When to Update**:
- ✅ Auto-updated: `request_status`, `processed_at`, `completed_at` (by system/admin)
- 🔒 Never update: `id`, `customer_id`, `request_id`, `requested_at`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: GDPR compliance, data deletion process

---

### 18. **`customer_audit_log`** - Complete Audit Log
**Purpose**: Comprehensive audit trail of all customer-related changes.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `action_type` (TEXT) - `CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `VERIFICATION`
- `action_field` (TEXT) - Field that changed
- `old_value`, `new_value` (TEXT) - Values
- `action_reason` (TEXT) - Reason for action
- `actor_type` (TEXT) - `CUSTOMER`, `ADMIN`, `SYSTEM`, `AGENT`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `ip_address`, `user_agent` (TEXT) - Context
- `created_at` (TIMESTAMP) - When action occurred

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system)
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- References: `customers.id`
- Used by: Compliance, security audits, support

---

### 19. **`customer_orders_summary`** - Order Summary View
**Purpose**: Pre-aggregated order summary per customer.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`
- `total_orders` (INTEGER) - Total orders
- `total_spent` (NUMERIC) - Total amount spent
- `average_order_value` (NUMERIC) - Average order value
- `last_order_at` (TIMESTAMP) - Last order date
- `favorite_merchant_id` (BIGINT) - Most ordered merchant
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: All metrics (by scheduled job)
- 🔒 Never update: `id`, `customer_id`, `service_type`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Quick customer insights, dashboards

**Note**: Unique constraint on `(customer_id, service_type)`.

---

## 🔗 **RELATIONSHIPS**

```
customers (1) ──→ (many) customer_tickets
customer_tickets (1) ──→ (many) customer_ticket_messages
customers (1) ──→ (many) customer_disputes
customers (1) ──→ (many) customer_refund_requests
customers (1) ──→ (1) customer_trust_score
customers (1) ──→ (many) customer_fraud_alerts
customers (1) ──→ (many) customer_blocks
customers (1) ──→ (many) customer_suspicious_activity
customers (1) ──→ (many) customer_verification_history
customers (1) ──→ (many) customer_activity_log
customers (1) ──→ (many) customer_login_history
customers (1) ──→ (many) customer_daily_analytics
customers (1) ──→ (many) customer_service_analytics
customers (1) ──→ (many) customer_referrals
customer_referrals (1) ──→ (many) customer_referral_rewards
customers (1) ──→ (many) customer_consent_log
customers (1) ──→ (many) customer_data_deletion_requests
customers (1) ──→ (many) customer_audit_log
customers (1) ──→ (many) customer_orders_summary
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `customer_tickets` | Support tickets | Issue tracking, agent assignment, resolution |
| `customer_ticket_messages` | Ticket messages | Conversation thread |
| `customer_disputes` | Legal disputes | Dispute tracking, evidence, resolution |
| `customer_refund_requests` | Refund requests | Refund processing, approval workflow |
| `customer_trust_score` | Trust scoring | Fraud detection, risk assessment |
| `customer_fraud_alerts` | Fraud alerts | Suspicious activity alerts |
| `customer_blocks` | Account blocks | Service blocking, unblocking |
| `customer_suspicious_activity` | Suspicious activity | Activity monitoring, ML detection |
| `customer_verification_history` | Verification log | Complete verification history |
| `customer_activity_log` | Activity log | Comprehensive activity tracking |
| `customer_login_history` | Login history | Login attempts, security |
| `customer_daily_analytics` | Daily analytics | Pre-aggregated daily metrics |
| `customer_service_analytics` | Service analytics | Service-specific metrics |
| `customer_referrals` | Referral tracking | Referral program, rewards |
| `customer_referral_rewards` | Referral rewards | Reward history |
| `customer_consent_log` | Consent log | GDPR consent tracking |
| `customer_data_deletion_requests` | Deletion requests | GDPR data deletion |
| `customer_audit_log` | Audit log | Complete audit trail |
| `customer_orders_summary` | Order summary | Quick order insights |

**Total**: 19 tables in Part 5

---

## 📊 **CUSTOMER DOMAIN COMPLETE SUMMARY**

- **Part 1**: 5 tables (Core & Auth)
- **Part 2**: 7 tables (Addresses & Preferences)
- **Part 3**: 5 tables (Wallet & Payments)
- **Part 4**: 8 tables (Loyalty & Rewards)
- **Part 5**: 19 tables (Support & Analytics)

**Total Customer Domain**: 44 tables

---

**Next**: See other domain documentation files for Merchant, Orders, Payments, Tickets, Access Management, Providers, and System domains.
