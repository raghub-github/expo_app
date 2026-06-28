# Orders Domain - Part 4: Payments, Refunds, Disputes & Conflicts

## 💳 **PAYMENT TABLES**

### 1. **`order_payments`** - Order Payment Attempts
**Purpose**: Tracks ALL payment attempts for an order (multiple attempts supported).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `payment_attempt_no` (INTEGER) - Attempt number (1, 2, 3, etc.)
- `payment_source` (TEXT) - `customer_app`, `merchant_app`, `web`, `api`
- `payment_mode` (ENUM) - `cash`, `online`, `wallet`, `upi`, `card`, `netbanking`, `cod`, `other`
- `transaction_id` (TEXT, UNIQUE) - Unique transaction ID
- `mp_transaction_id` (TEXT) - Marketplace transaction ID
- `pg_transaction_id` (TEXT) - Payment gateway transaction ID
- `pg_name` (TEXT) - `razorpay`, `stripe`, `payu`, etc.
- `pg_order_id`, `pg_payment_id`, `pg_signature` (TEXT) - Gateway IDs
- `payment_status` (ENUM) - `pending`, `processing`, `completed`, `failed`, `refunded`, `partially_refunded`, `cancelled`
- `payment_amount` (NUMERIC) - Payment amount
- `payment_fee` (NUMERIC) - Payment gateway fee
- `net_amount` (NUMERIC) - Net amount after fees
- `coupon_code` (TEXT) - Coupon used
- `coupon_type` (TEXT) - `percentage`, `fixed`, `free_delivery`
- `coupon_value`, `coupon_max_discount` (NUMERIC) - Coupon details
- `coupon_discount_applied` (NUMERIC) - Discount applied
- `is_refunded` (BOOLEAN) - Whether payment was refunded
- `refunded_amount` (NUMERIC) - Amount refunded
- `refund_transaction_id` (TEXT) - Refund transaction ID
- `pg_response` (JSONB) - Gateway response
- `payment_metadata` (JSONB) - Additional payment data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `payment_status`, `pg_payment_id`, `pg_transaction_id` (by payment gateway webhook)
- ⚠️ Manual update: `is_refunded`, `refunded_amount` (by refund system)
- 🔒 Never update: `id`, `order_id`, `payment_attempt_no`, `payment_amount`, `created_at`

**Relationships**:
- References: `orders.id`
- Referenced by: `order_refunds.order_payment_id`

**Critical Notes**:
1. **Multiple Attempts**: One order can have multiple payment attempts
2. **Unique Constraint**: `(order_id, payment_attempt_no)` ensures sequential attempts
3. **Gateway Integration**: Stores all gateway-specific IDs and responses

---

### 2. **`order_refunds`** - Order Refunds
**Purpose**: Tracks partial and full refunds for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `order_payment_id` (BIGINT, FK → order_payments.id) - Which payment was refunded
- `refund_type` (ENUM) - `full`, `partial`, `item`, `delivery_fee`, `tip`, `penalty`
- `refund_reason`, `refund_description` (TEXT) - Refund details
- `redemption_id` (TEXT) - Redemption ID
- `refund_id` (TEXT, UNIQUE) - Unique refund ID
- `pg_transaction_id`, `pg_refund_id` (TEXT) - Payment gateway IDs
- `product_type` (TEXT) - `order`, `item`, `delivery_fee`, `tip`, `penalty`
- `refund_amount` (NUMERIC) - Refund amount
- `refund_fee` (NUMERIC) - Refund processing fee
- `net_refund_amount` (NUMERIC) - Net refund after fees
- `issued_coupon_code`, `issued_coupon_value`, `issued_coupon_expiry` (TEXT/NUMERIC/TIMESTAMP) - Coupon issued as refund
- `mx_debit_amount` (NUMERIC) - Amount debited from merchant
- `mx_debit_reason` (TEXT) - Reason for merchant debit
- `refund_status` (TEXT) - `pending`, `processing`, `completed`, `failed`
- `refund_initiated_by` (TEXT) - `customer`, `merchant`, `rider`, `agent`, `system`
- `refund_initiated_by_id` (BIGINT) - Who initiated
- `refund_processed_by`, `refund_processed_by_id` (TEXT/BIGINT) - Who processed
- `pg_refund_response` (JSONB) - Gateway refund response
- `refund_metadata` (JSONB) - Additional refund data
- `created_at`, `processed_at`, `completed_at` (TIMESTAMP) - Refund timestamps

**When to Update**:
- ✅ Auto-updated: `refund_status`, `processed_at`, `completed_at` (by refund system)
- ⚠️ Manual update: `refund_status`, `refund_processed_by` (by finance team)
- 🔒 Never update: `id`, `order_id`, `refund_amount`, `refund_type`, `created_at`

**Relationships**:
- References: `orders.id`, `order_payments.id`
- Used by: Refund processing, financial reconciliation

---

## 🎫 **TICKET & DISPUTE TABLES**

### 3. **`order_tickets`** - Order Support Tickets
**Purpose**: Support tickets related to orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `ticket_source` (ENUM) - `customer`, `rider`, `merchant`, `system`, `agent`
- `raised_by_id` (BIGINT) - Who raised ticket
- `raised_by_name`, `raised_by_type` (TEXT) - Raised by details
- `issue_category` (TEXT) - `delivery_delay`, `wrong_item`, `payment_issue`, etc.
- `issue_subcategory` (TEXT) - More specific category
- `description` (TEXT) - Issue description
- `attachments` (TEXT[]) - Attachment URLs
- `priority` (ENUM) - `low`, `medium`, `high`, `urgent`, `critical`
- `status` (ENUM) - `open`, `in_progress`, `resolved`, `closed`
- `assigned_to_agent_id`, `assigned_to_agent_name` (INTEGER/TEXT) - Assigned agent
- `assigned_at` (TIMESTAMP) - When assigned
- `resolution` (TEXT) - Resolution details
- `resolved_at` (TIMESTAMP) - When resolved
- `resolved_by`, `resolved_by_name` (INTEGER/TEXT) - Who resolved
- `follow_up_required` (BOOLEAN) - Whether follow-up needed
- `follow_up_date` (TIMESTAMP) - Follow-up date
- `ticket_metadata` (JSONB) - Additional ticket data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `status`, `assigned_to_agent_id`, `resolution` (by support agents)
- 🔒 Never update: `id`, `order_id`, `ticket_source`, `created_at`

**Relationships**:
- References: `orders.id`
- Referenced by: `order_disputes.order_ticket_id`

**Note**: This is order-specific tickets. See `unified_tickets` for platform-wide ticket system.

---

### 4. **`order_disputes`** - Order Disputes
**Purpose**: Legal disputes raised for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `order_ticket_id` (BIGINT, FK → order_tickets.id) - Related ticket
- `dispute_type` (TEXT) - `refund`, `damage`, `non_delivery`, `fraud`, etc.
- `dispute_reason`, `dispute_description` (TEXT) - Dispute details
- `raised_by` (TEXT) - `customer`, `merchant`, `rider`
- `raised_by_id` (BIGINT) - Who raised
- `disputed_against` (TEXT) - `customer`, `merchant`, `rider`, `platform`
- `disputed_against_id` (BIGINT) - Who is disputed against
- `evidence_urls` (TEXT[]) - Evidence file URLs
- `evidence_description` (TEXT) - Evidence description
- `dispute_status` (TEXT) - `open`, `investigating`, `resolved`, `closed`, `escalated`
- `resolution`, `resolution_amount` (TEXT/NUMERIC) - Resolution details
- `resolved_at` (TIMESTAMP) - When resolved
- `resolved_by`, `resolved_by_name` (INTEGER/TEXT) - Who resolved
- `legal_case_id`, `legal_notes` (TEXT) - Legal information
- `dispute_metadata` (JSONB) - Additional dispute data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `dispute_status`, `resolution`, `resolved_at` (by legal/admin team)
- 🔒 Never update: `id`, `order_id`, `raised_by`, `dispute_type`, `created_at`

**Relationships**:
- References: `orders.id`, `order_tickets.id` (optional)
- Used by: Legal team, dispute resolution

---

## ⚔️ **CONFLICT & SYNC TABLES**

### 5. **`order_conflicts`** - Order Conflicts
**Purpose**: Tracks conflicts between our system and external providers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `provider_type` (ENUM) - `swiggy`, `zomato`, `rapido`, etc.
- `conflict_type` (TEXT) - `status_mismatch`, `fare_mismatch`, `rider_mismatch`, `payment_mismatch`, `item_mismatch`
- `our_value`, `provider_value` (JSONB) - Our value vs provider's value
- `resolution_strategy` (ENUM) - `manual_review`, `ours_wins`, `theirs_wins`, `merge`
- `resolved` (BOOLEAN) - Whether conflict resolved
- `resolved_by` (INTEGER) - Admin who resolved
- `resolved_at` (TIMESTAMP) - When resolved
- `resolution_notes` (TEXT) - Resolution notes
- `created_at` (TIMESTAMP) - When conflict detected

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `resolved`, `resolved_by`, `resolved_at` (by admin)
- 🔒 Never update: `id`, `order_id`, `our_value`, `provider_value`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Provider sync system, conflict resolution

---

### 6. **`order_sync_logs`** - Order Sync Logs
**Purpose**: Logs all sync attempts with external providers.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `provider_type` (ENUM) - `swiggy`, `zomato`, `rapido`, etc.
- `sync_direction` (TEXT) - `outbound` (us → provider), `inbound` (provider → us)
- `sync_type` (TEXT) - `status`, `payment`, `rider`, `item`, `full`
- `success` (BOOLEAN) - Whether sync succeeded
- `error_message` (TEXT) - Error if failed
- `provider_response` (JSONB) - Provider's response
- `sync_metadata` (JSONB) - Additional sync data
- `created_at` (TIMESTAMP) - When sync attempted

**When to Update**:
- ✅ Auto-updated: All fields (by sync system)
- 🔒 Never update: This is an **immutable sync log** - never update or delete

**Relationships**:
- References: `orders.id`
- Used by: Sync monitoring, error tracking

---

## 🔗 **RELATIONSHIPS**

```
orders (1) ──→ (many) order_payments
order_payments (1) ──→ (many) order_refunds
orders (1) ──→ (many) order_tickets
order_tickets (1) ──→ (many) order_disputes
orders (1) ──→ (many) order_conflicts
orders (1) ──→ (many) order_sync_logs
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `order_payments` | Payment attempts | Multiple attempts, gateway integration |
| `order_refunds` | Refunds | Partial/full refunds, merchant debits |
| `order_tickets` | Support tickets | Order-specific support tickets |
| `order_disputes` | Legal disputes | Dispute tracking, evidence, resolution |
| `order_conflicts` | Provider conflicts | Conflict detection and resolution |
| `order_sync_logs` | Sync logs | Provider sync tracking |

**Total**: 6 tables in Part 4

---

## 📊 **ORDERS DOMAIN COMPLETE SUMMARY**

- **Part 1**: 1 table (Core orders table)
- **Part 2**: 10 tables (Items & service-specific)
- **Part 3**: 11 tables (Assignments & timeline)
- **Part 4**: 6 tables (Payments, disputes, conflicts)

**Total Orders Domain**: 28 tables documented

---

**Next**: See Merchant Domain, Tickets Domain, Access Management, Payments Domain, Providers Domain, and System Domain documentation.
