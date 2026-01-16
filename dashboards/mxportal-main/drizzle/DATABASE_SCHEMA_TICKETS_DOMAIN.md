# Tickets Domain - Unified Ticket System

## 🎫 **TICKETS DOMAIN OVERVIEW**

The Tickets Domain provides a unified ticket system for handling all support requests across the platform, including:
- Order-related tickets
- Customer, rider, merchant support
- System-generated tickets
- Email integration
- Auto-generation rules

**Total Tables**: 5 tables

---

## 📋 **TICKET TABLES**

### 1. **`unified_tickets`** - Unified Tickets (Main Table)
**Purpose**: Main table for all support tickets across the platform.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_id` (TEXT, UNIQUE) - Human-readable ticket ID (e.g., TKT-2024-001234)
- `ticket_type` (ENUM) - `ORDER_RELATED`, `NON_ORDER_RELATED`
- `ticket_source` (ENUM) - `CUSTOMER`, `RIDER`, `MERCHANT`, `SYSTEM`, `EMAIL`, `AGENT`, `WHATSAPP`, `CALL`
- `service_type` (ENUM) - `FOOD`, `PARCEL`, `RIDE`, `ALL`
- `ticket_title` (ENUM) - Predefined ticket titles
- `ticket_category` (ENUM) - Ticket category
- `order_id` (BIGINT, FK → orders.id) - Related order (if order-related)
- `customer_id`, `rider_id`, `merchant_store_id`, `merchant_parent_id` (BIGINT) - Related entities
- `raised_by_type`, `raised_by_id`, `raised_by_name`, `raised_by_mobile`, `raised_by_email` (ENUM/BIGINT/TEXT) - Who raised
- `subject`, `description` (TEXT) - Ticket details
- `attachments` (TEXT[]) - Attachment URLs
- `priority` (ENUM) - `LOW`, `MEDIUM`, `HIGH`, `URGENT`, `CRITICAL`
- `status` (ENUM) - `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `REOPENED`
- `assigned_to_agent_id`, `assigned_to_agent_name` (INTEGER/TEXT) - Assigned agent
- `assigned_at`, `auto_assigned` (TIMESTAMP/BOOLEAN) - Assignment details
- `resolution`, `resolution_time_minutes` (TEXT/INTEGER) - Resolution
- `resolved_at`, `resolved_by`, `resolved_by_name` (TIMESTAMP/INTEGER/TEXT) - Resolution details
- `escalated`, `escalated_at`, `escalated_to`, `escalated_reason`, `escalation_level` (BOOLEAN/TIMESTAMP/INTEGER/TEXT/INTEGER) - Escalation
- `first_response_at`, `first_response_time_minutes` (TIMESTAMP/INTEGER) - First response
- `last_response_at`, `last_response_by_type`, `last_response_by_id` (TIMESTAMP/ENUM/BIGINT) - Last response
- `follow_up_required`, `follow_up_date`, `follow_up_notes` (BOOLEAN/TIMESTAMP/TEXT) - Follow-up
- `satisfaction_rating`, `satisfaction_feedback`, `satisfaction_collected_at` (SMALLINT/TEXT/TIMESTAMP) - Satisfaction
- `parent_ticket_id` (BIGINT, FK → unified_tickets.id) - Parent ticket
- `related_ticket_ids` (BIGINT[]) - Related tickets
- `tags` (TEXT[]) - Tags for filtering
- `email_message_id`, `email_thread_id`, `email_from_address`, `email_subject` (TEXT) - Email integration
- `auto_generated`, `auto_generation_rule`, `auto_generation_metadata` (BOOLEAN/TEXT/JSONB) - Auto-generation
- `metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at`, `closed_at` (TIMESTAMP) - Timestamps

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `status`, `assigned_to_agent_id`, `resolved_at` (by system/agents)
- ⚠️ Manual update: `status`, `priority`, `resolution` (by support agents)
- 🔒 Never update: `id`, `ticket_id`, `created_at`

**Relationships**:
- References: `orders.id`, `customers.id`, `riders.id`, `merchant_stores.id`, `merchant_parents.id`, `system_users.id`, `unified_tickets.id` (parent)
- Referenced by: `unified_ticket_messages`, `unified_ticket_activities`, `unified_tickets.parent_ticket_id`

**Constraints**:
- Order-related tickets must have `order_id`
- Raised by must match related entity (customer/rider/merchant)

---

### 2. **`unified_ticket_messages`** - Ticket Messages
**Purpose**: Conversation thread for tickets.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_id` (BIGINT, FK → unified_tickets.id)
- `message_text` (TEXT) - Message content
- `message_type` (TEXT) - `TEXT`, `IMAGE`, `FILE`, `SYSTEM`, `EMAIL`
- `sender_type`, `sender_id`, `sender_name`, `sender_email`, `sender_mobile` (ENUM/BIGINT/TEXT) - Sender
- `attachments` (TEXT[]) - Attachment URLs
- `is_internal_note` (BOOLEAN) - Whether internal note (only visible to agents)
- `internal_note_for_agent_id` (INTEGER, FK → system_users.id) - Target agent for internal note
- `is_read`, `read_at`, `read_by` (BOOLEAN/TIMESTAMP/INTEGER) - Read status
- `email_message_id`, `email_in_reply_to` (TEXT) - Email integration
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `is_read`, `read_at` (when read)
- ⚠️ Manual update: `message_text` (by senders)
- 🔒 Never update: `id`, `ticket_id`, `created_at`

**Relationships**:
- References: `unified_tickets.id`, `system_users.id` (optional)
- Used by: Ticket conversation, email integration

---

### 3. **`unified_ticket_activities`** - Ticket Activity Log
**Purpose**: Immutable audit trail of all ticket activities.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_id` (BIGINT, FK → unified_tickets.id)
- `activity_type` (TEXT) - `CREATED`, `ASSIGNED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `ESCALATED`, `RESOLVED`, `CLOSED`, `REOPENED`, `MESSAGE_ADDED`, etc.
- `activity_description` (TEXT) - Description
- `actor_type`, `actor_id`, `actor_name` (ENUM/BIGINT/TEXT) - Who performed
- `old_value`, `new_value` (JSONB) - Change values
- `created_at` (TIMESTAMP) - When occurred

**When to Update**:
- ✅ Auto-updated: All fields (by triggers/system)
- 🔒 Never update: This is an **immutable activity log** - never update or delete

**Relationships**:
- References: `unified_tickets.id`
- Used by: Audit trail, activity tracking

---

### 4. **`ticket_title_config`** - Ticket Title Configuration
**Purpose**: Reference table for predefined ticket titles.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_title` (ENUM, UNIQUE) - Ticket title enum value
- `display_name`, `description` (TEXT) - Title details
- `applicable_to_ticket_type` (ENUM[]) - Applicable ticket types
- `applicable_to_service_type` (ENUM[]) - Applicable services
- `applicable_to_source` (ENUM[]) - Applicable sources
- `default_priority` (ENUM) - Default priority
- `default_category` (ENUM) - Default category
- `default_auto_assign` (BOOLEAN) - Whether auto-assign
- `default_auto_assign_to_agent_id` (INTEGER, FK → system_users.id) - Default agent
- `is_active` (BOOLEAN) - Whether active
- `display_order` (INTEGER) - UI display order
- `metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `display_name`, `default_priority`, `is_active` (by admin)
- 🔒 Never update: `id`, `ticket_title`, `created_at`

**Relationships**:
- References: `system_users.id` (optional)
- Used by: Ticket creation, title selection

---

### 5. **`ticket_auto_generation_rules`** - Auto-Generation Rules
**Purpose**: Rules for automatically generating tickets based on events.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rule_name` (TEXT, UNIQUE) - Rule name
- `rule_description` (TEXT) - Description
- `trigger_event` (TEXT) - `ORDER_DELAYED`, `PAYMENT_FAILED`, `RIDER_NOT_ASSIGNED`, etc.
- `trigger_conditions` (JSONB) - Conditions that must be met
- `ticket_title`, `ticket_type`, `ticket_category`, `service_type`, `priority` (ENUM) - Ticket settings
- `auto_assign` (BOOLEAN) - Whether auto-assign
- `auto_assign_to_agent_id` (INTEGER, FK → system_users.id) - Target agent
- `auto_assign_to_department` (TEXT) - Target department
- `is_active`, `is_enabled` (BOOLEAN) - Status flags
- `metadata` (JSONB) - Additional metadata
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger)
- ⚠️ Manual update: `is_active`, `is_enabled`, `trigger_conditions` (by admin)
- 🔒 Never update: `id`, `rule_name`, `created_at`

**Relationships**:
- References: `system_users.id` (optional)
- Used by: Auto-ticket generation system

---

## 🔗 **RELATIONSHIPS**

```
unified_tickets (1) ──→ (many) unified_ticket_messages
unified_tickets (1) ──→ (many) unified_ticket_activities
unified_tickets (1) ──→ (many) unified_tickets (parent_ticket_id)
ticket_title_config (1) ──→ (many) unified_tickets (ticket_title)
ticket_auto_generation_rules (1) ──→ (many) unified_tickets (auto_generation_rule)
orders (1) ──→ (many) unified_tickets
customers (1) ──→ (many) unified_tickets
riders (1) ──→ (many) unified_tickets
merchant_stores (1) ──→ (many) unified_tickets
system_users (1) ──→ (many) unified_tickets (assigned_to_agent_id)
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `unified_tickets` | Main tickets table | Unified for all ticket types, email integration |
| `unified_ticket_messages` | Ticket messages | Conversation thread, internal notes |
| `unified_ticket_activities` | Activity log | Immutable audit trail |
| `ticket_title_config` | Title configuration | Predefined titles, defaults |
| `ticket_auto_generation_rules` | Auto-generation rules | System-generated tickets |

**Total**: 5 tables in Tickets Domain

---

**Next**: See Access Management, Providers Domain, Payments Domain, and System Domain documentation.
