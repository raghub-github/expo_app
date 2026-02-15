# Orders Domain - Part 3: Rider Assignments & Timeline

## 🚴 **RIDER ASSIGNMENT TABLES**

### 1. **`order_rider_assignments`** - Rider Assignments (Multi-Rider Support)
**Purpose**: Tracks ALL rider assignments for an order. History is preserved - never deleted.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id) - Which order
- `rider_id` (INTEGER, FK → riders.id) - Assigned rider
- `rider_name`, `rider_mobile` (TEXT) - Rider snapshot (at time of assignment)
- `rider_vehicle_type`, `rider_vehicle_number` (TEXT) - Vehicle snapshot
- `delivery_provider` (TEXT) - `internal`, `swiggy`, `zomato`, `rapido`, etc.
- `provider_rider_id` (TEXT) - Provider's rider ID (if external provider)
- `assignment_status` (ENUM) - `pending`, `assigned`, `accepted`, `rejected`, `cancelled`, `completed`, `failed`
- `assignment_method` (TEXT) - `auto`, `manual`, `broadcast`, `rider_request`
- `assignment_score` (NUMERIC) - Algorithm score (for auto-assignment)
- `distance_to_pickup_km` (NUMERIC) - Distance from rider to pickup
- `estimated_arrival_minutes` (INTEGER) - Estimated arrival time
- `assigned_at`, `accepted_at`, `rejected_at` (TIMESTAMP) - Status timestamps
- `reached_merchant_at`, `picked_up_at`, `delivered_at` (TIMESTAMP) - Delivery timestamps
- `cancelled_at` (TIMESTAMP) - Cancellation time
- `cancellation_reason`, `cancellation_reason_code` (TEXT) - Cancellation details
- `cancelled_by` (TEXT) - `rider`, `system`, `merchant`, `customer`, `agent`
- `cancelled_by_id` (BIGINT) - Who cancelled
- `distance_to_merchant_km`, `distance_to_customer_km`, `total_distance_km` (NUMERIC) - Distance tracking
- `rider_earning`, `commission_amount`, `tip_amount` (NUMERIC) - Earnings
- `assignment_metadata` (JSONB) - Additional assignment data
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), status timestamps (when status changes)
- ⚠️ Manual update: `assignment_status`, `accepted_at`, `rejected_at`, etc. (by system/rider)
- 🔒 Never update: `id`, `order_id`, `rider_id`, `assigned_at`, `created_at`

**Relationships**:
- References: `orders.id`, `riders.id`
- Referenced by: `order_rider_distances`, `order_rider_actions`

**Critical Notes**:
1. **History Preserved**: Never delete assignments, only add new ones
2. **One Active**: Only one assignment with status `pending`, `assigned`, or `accepted` per order (enforced by unique index)
3. **Snapshot Data**: Rider details are snapshotted at assignment time (for historical accuracy)

---

### 2. **`order_rider_distances`** - Distance Tracking
**Purpose**: Tracks distances for each rider assignment.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_assignment_id` (BIGINT, FK → order_rider_assignments.id) - Which assignment
- `merchant_to_rider_km` (NUMERIC) - Distance from merchant to rider location
- `merchant_to_customer_km` (NUMERIC) - Direct distance merchant to customer
- `rider_to_merchant_km` (NUMERIC) - Distance rider traveled to merchant
- `rider_to_customer_km` (NUMERIC) - Distance rider traveled to customer
- `total_distance_km` (NUMERIC) - Total distance traveled
- `route_polyline` (TEXT) - Route polyline
- `route_duration_seconds` (INTEGER) - Route duration
- `route_metadata` (JSONB) - Additional route data
- `recorded_at` (TIMESTAMP) - When distance was recorded

**When to Update**:
- ✅ Auto-updated: All fields (by system when distances calculated)
- 🔒 Never update: This is an **immutable distance record** - never update or delete

**Relationships**:
- References: `order_rider_assignments.id`
- Used by: Fare calculation, distance-based analytics

---

### 3. **`order_rider_actions`** - Rider Accept/Reject Actions
**Purpose**: Logs all accept/reject actions by riders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `rider_assignment_id` (BIGINT, FK → order_rider_assignments.id) - Related assignment
- `rider_id` (INTEGER, FK → riders.id)
- `action` (ENUM) - `accept`, `reject`, `auto_reject`, `timeout`
- `reason`, `reason_code` (TEXT) - Reason for action
- `response_time_seconds` (INTEGER) - Time taken to respond
- `distance_from_pickup_km` (NUMERIC) - Distance when action taken
- `action_metadata` (JSONB) - Additional action data
- `timestamp` (TIMESTAMP) - When action occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system when action occurs)
- 🔒 Never update: This is an **immutable action log** - never update or delete

**Relationships**:
- References: `orders.id`, `order_rider_assignments.id`, `riders.id`
- Used by: Rider performance analytics, assignment algorithm tuning

---

### 4. **`order_assignments`** - Assignment Attempts (Legacy)
**Purpose**: Legacy table for assignment attempts (may be replaced by `order_rider_assignments`).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `rider_id` (INTEGER, FK → riders.id)
- `assignment_method` (TEXT) - `auto`, `manual`, `broadcast`, `rider_request`
- `distance_km` (NUMERIC) - Distance from rider to pickup
- `estimated_arrival_minutes` (INTEGER) - Estimated arrival
- `assignment_score` (NUMERIC) - Algorithm score
- `status` (TEXT) - `pending`, `accepted`, `rejected`, `timeout`, `cancelled`
- `responded_at` (TIMESTAMP) - When rider responded
- `response_time_seconds` (INTEGER) - Response time
- `rejection_reason` (TEXT) - Rejection reason
- `created_at` (TIMESTAMP) - When assignment attempted

**When to Update**:
- ✅ Auto-updated: `status`, `responded_at` (by system/rider)
- 🔒 Never update: `id`, `order_id`, `rider_id`, `created_at`

**Note**: Check if this is still used or if `order_rider_assignments` replaced it.

---

## 📅 **TIMELINE & HISTORY TABLES**

### 5. **`order_timeline`** - Immutable Order Timeline
**Purpose**: **IMMUTABLE** chronological history of all order status changes. Never updated, only inserted.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `status` (ENUM) - Current status at this point in time
- `previous_status` (ENUM) - Previous status (before change)
- `actor_type` (TEXT) - `customer`, `rider`, `merchant`, `system`, `agent`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `location_lat`, `location_lon` (DOUBLE PRECISION) - Location where status changed
- `location_address` (TEXT) - Address where status changed
- `status_message` (TEXT) - Status message/description
- `status_metadata` (JSONB) - Additional status data
- `occurred_at` (TIMESTAMP) - When status change occurred
- `synced_to_provider` (BOOLEAN) - Whether synced to external provider
- `provider_status` (TEXT) - Provider's status
- `provider_event_id` (TEXT) - Provider's event ID
- `provider_sync_error` (TEXT) - Sync error if failed

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system when status changes)
- 🔒 Never update: This is an **IMMUTABLE timeline** - NEVER update or delete records

**Relationships**:
- References: `orders.id`
- Used by: Order history, audit trail, status tracking

**Critical Notes**:
1. **Immutable**: Never update or delete records
2. **Chronological**: Records are in chronological order by `occurred_at`
3. **Trigger**: Automatically creates records when `orders.status` changes
4. **Status Sync**: `orders.current_status` is synced from this table via trigger

---

### 6. **`order_status_history`** - Status History (Alternative)
**Purpose**: Alternative status history table (may be legacy, check usage).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `from_status`, `to_status` (ENUM) - Status transition
- `changed_by` (TEXT) - `rider`, `customer`, `merchant`, `system`, `admin`
- `changed_by_id` (INTEGER) - Who changed
- `reason` (TEXT) - Reason for change
- `location_lat`, `location_lon` (DOUBLE PRECISION) - Location
- `metadata` (JSONB) - Additional data
- `created_at` (TIMESTAMP) - When change occurred

**When to Update**:
- ✅ Auto-updated: All fields (by trigger when status changes)
- 🔒 Never update: This is an **immutable history** - never update or delete

**Note**: Check if this is still used or if `order_timeline` replaced it.

---

### 7. **`order_audit_log`** - Complete Order Audit Trail
**Purpose**: Comprehensive audit trail of ALL order changes (not just status).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `action_type` (TEXT) - `create`, `update`, `delete`, `status_change`, `payment`, `refund`, etc.
- `action_field` (TEXT) - Field name if specific field changed
- `old_value`, `new_value` (JSONB) - Old and new values
- `action_reason` (TEXT) - Reason for action
- `actor_type` (TEXT) - `customer`, `rider`, `merchant`, `agent`, `system`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `actor_ip`, `actor_user_agent` (TEXT) - Actor context
- `created_at` (TIMESTAMP) - When action occurred

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system)
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- References: `orders.id`
- Used by: Complete audit trail, compliance, support

**Note**: This captures ALL changes, not just status changes.

---

## 🔔 **NOTIFICATION & COMMUNICATION TABLES**

### 8. **`order_notifications`** - Order Notifications
**Purpose**: Tracks all notifications sent for orders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `notification_type` (TEXT) - `order_placed`, `order_accepted`, `order_delivered`, etc.
- `notification_channel` (ENUM) - `push`, `sms`, `email`, `in_app`, `whatsapp`, `call`
- `message` (TEXT) - Notification message
- `message_template_id` (TEXT) - Template used
- `sent_to` (TEXT) - Phone, email, or user ID
- `recipient_type` (TEXT) - `customer`, `rider`, `merchant`
- `recipient_id` (BIGINT) - Recipient ID
- `sent_at` (TIMESTAMP) - When sent
- `delivered_at` (TIMESTAMP) - When delivered
- `read_at` (TIMESTAMP) - When read
- `failed_at` (TIMESTAMP) - When failed
- `provider_message_id` (TEXT) - Provider's message ID
- `provider_response` (JSONB) - Provider response
- `notification_metadata` (JSONB) - Additional metadata

**When to Update**:
- ✅ Auto-updated: `delivered_at`, `read_at`, `failed_at` (by notification service)
- 🔒 Never update: `id`, `order_id`, `sent_at`, `message`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Notification tracking, delivery reports

---

### 9. **`order_remarks`** - Order Remarks
**Purpose**: Remarks/notes added to orders by customers, riders, merchants, or agents.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `actor_type` (TEXT) - `customer`, `rider`, `merchant`, `agent`, `system`
- `actor_id` (BIGINT) - Actor ID
- `actor_name` (TEXT) - Actor name
- `action_taken` (TEXT) - `status_changed`, `refund_issued`, `rider_reassigned`, etc.
- `remark` (TEXT) - Remark text
- `remark_category` (TEXT) - `complaint`, `feedback`, `instruction`, `note`
- `remark_priority` (TEXT) - `low`, `normal`, `high`, `urgent`
- `visible_to` (TEXT[]) - Array of actor types who can see this remark
- `is_internal` (BOOLEAN) - Whether internal agent note
- `remark_metadata` (JSONB) - Additional metadata
- `created_at` (TIMESTAMP) - When remark added

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `remark`, `remark_category` (by actors)
- 🔒 Never update: `id`, `order_id`, `actor_type`, `actor_id`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Customer support, order notes, communication

---

### 10. **`order_instructions`** - Order Instructions
**Purpose**: Special instructions for merchant, rider, or customer.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `instruction_for` (TEXT) - `merchant`, `rider`, `customer`
- `instruction_text` (TEXT) - Instruction content
- `instruction_priority` (TEXT) - `low`, `normal`, `high`, `urgent`
- `created_at` (TIMESTAMP) - When instruction added
- `created_by` (TEXT) - `customer`, `merchant`, `rider`, `agent`, `system`
- `created_by_id` (BIGINT) - Who created

**When to Update**:
- ✅ Auto-updated: `created_at`
- ⚠️ Manual update: `instruction_text` (by actors)
- 🔒 Never update: `id`, `order_id`, `created_at`

**Relationships**:
- References: `orders.id`
- Used by: Order fulfillment, delivery instructions

---

## ⭐ **RATINGS TABLES**

### 11. **`order_ratings`** - Order Ratings
**Purpose**: Ratings given for orders (separate from general ratings).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id)
- `rider_id` (INTEGER, FK → riders.id)
- `rated_by` (TEXT) - `customer`, `merchant`, `rider`
- `rated_by_id` (INTEGER) - Who rated
- `rating` (SMALLINT) - Rating 1-5
- `comment` (TEXT) - Rating comment
- `rating_categories` (JSONB) - Category ratings (e.g., `{"punctuality": 5, "communication": 4}`)
- `created_at` (TIMESTAMP) - When rating given

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable rating** - never update or delete

**Relationships**:
- References: `orders.id`, `riders.id`
- Used by: Rider performance, order quality metrics

---

## 🔗 **RELATIONSHIPS**

```
orders (1) ──→ (many) order_rider_assignments
order_rider_assignments (1) ──→ (many) order_rider_distances
orders (1) ──→ (many) order_rider_actions
orders (1) ──→ (many) order_assignments (legacy)
orders (1) ──→ (many) order_timeline
orders (1) ──→ (many) order_status_history (legacy)
orders (1) ──→ (many) order_audit_log
orders (1) ──→ (many) order_notifications
orders (1) ──→ (many) order_remarks
orders (1) ──→ (many) order_instructions
orders (1) ──→ (many) order_ratings
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `order_rider_assignments` | Rider assignments | Multi-rider support, history preserved |
| `order_rider_distances` | Distance tracking | Route distances, fare calculation |
| `order_rider_actions` | Rider actions | Accept/reject logging |
| `order_assignments` | Assignment attempts (legacy) | May be replaced by order_rider_assignments |
| `order_timeline` | Immutable timeline | Complete status history |
| `order_status_history` | Status history (legacy) | May be replaced by order_timeline |
| `order_audit_log` | Complete audit trail | All order changes |
| `order_notifications` | Notifications | All order notifications |
| `order_remarks` | Order remarks | Notes and comments |
| `order_instructions` | Instructions | Special instructions |
| `order_ratings` | Order ratings | Order-specific ratings |

**Total**: 11 tables in Part 3

---

**Next**: See `DATABASE_SCHEMA_ORDERS_DOMAIN_PART4_PAYMENTS_DISPUTES.md` for payments, refunds, disputes, and conflicts.
