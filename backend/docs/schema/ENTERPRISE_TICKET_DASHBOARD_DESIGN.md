# Enterprise Ticketing Dashboard System - Complete Architecture Design

## 🎯 Executive Summary

This document provides a **production-grade, enterprise ticketing dashboard system** comparable to **Zendesk/Freshdesk**, designed for a **high-scale mobility + delivery super platform** handling **millions of tickets**.

**Key Differentiators:**
- ✅ **Fully Dynamic Admin System** - Zero hardcoding, all configurable via UI
- ✅ **Multi-Level Supervisor Hierarchy** - Enterprise RBAC with granular permissions
- ✅ **Intelligent Auto-Assignment Engine** - AI-ready routing system
- ✅ **Realtime Chat System** - WebSocket-powered instant messaging
- ✅ **Advanced Filtering & Search** - ElasticSearch-ready architecture
- ✅ **CSAT/DSAT Analytics** - Comprehensive feedback system
- ✅ **Automation-Ready** - Event-driven architecture for AI integration

---

## 1. Architecture Overview

### 1.1 System Architecture Pattern

**Recommendation: Modular Monolith with Event-Driven Components**

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Dashboard                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Ticket List  │  │ Ticket View  │  │ Admin Config │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕ WebSocket + REST API
┌─────────────────────────────────────────────────────────────┐
│                    Backend API Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Ticket API   │  │ Chat API     │  │ Assignment   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ RBAC Engine  │  │ Filter API   │  │ Analytics    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              Event Bus (Redis Pub/Sub)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auto-Assign  │  │ Notifications│  │ Automation   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ PostgreSQL   │  │ ElasticSearch │  │ Redis Cache   │     │
│  │ (Primary DB) │  │ (Search)      │  │ (Sessions)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │ Cloudflare R2│  │ Read Replicas│                        │
│  │ (Attachments) │  │ (Analytics)  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**Why Modular Monolith?**
- ✅ Single deployment unit (easier operations)
- ✅ Shared database transactions (ACID guarantees)
- ✅ Easier to evolve into microservices later
- ✅ Better performance (no network overhead)
- ✅ Simpler debugging and monitoring

**When to Split:**
- When individual modules need independent scaling
- When different teams own different modules
- When modules have conflicting requirements

---

## 2. Database Inspection Strategy

### 2.1 Current State Analysis

**Existing Tables (from schema.ts):**
- ✅ `tickets` - Main ticket table
- ✅ `ticket_groups` - Grouping system
- ✅ `ticket_titles` - Dynamic title catalog
- ✅ `ticket_participants` - Polymorphic actors
- ✅ `ticket_assignments` - Assignment history
- ✅ `ticket_messages` - Conversation thread
- ✅ `ticket_status_history` - Status transitions
- ✅ `ticket_actions_audit` - Audit log
- ✅ `ticket_ratings` - Post-resolution feedback
- ✅ `ticket_tags` & `ticket_tag_map` - Tag system

**Gaps Identified:**
- ❌ Custom fields system
- ❌ SLA policies (dynamic)
- ❌ Automation rules engine
- ❌ Agent capacity/availability
- ❌ Routing rules
- ❌ Saved filters/views
- ❌ Message read receipts
- ❌ Typing indicators
- ❌ Chat conversations abstraction
- ❌ Supervisor hierarchy
- ❌ Permission matrix (RBAC)
- ❌ CSAT/DSAT detailed analytics

### 2.2 Migration Strategy

**Phase 1: Schema Extensions (Non-Breaking)**
- Add new tables (no ALTERs to existing)
- Add columns with defaults
- Create indexes in parallel

**Phase 2: Data Migration**
- Migrate existing data to new structures
- Backfill missing relationships

**Phase 3: Application Updates**
- Update API layer
- Update UI components
- Gradual rollout with feature flags

**Phase 4: Cleanup**
- Remove deprecated columns (after migration period)
- Archive old data

---

## 3. Database Schema (VERY DEEP)

### 3.1 Core Ticket Tables (Enhanced)

#### `tickets` Table (Already Exists - Enhancements Needed)

**New Columns to Add:**
```sql
-- Custom field values (JSONB for flexibility)
custom_field_values JSONB DEFAULT '{}'::jsonb,

-- High-value order flag
is_high_value_order BOOLEAN DEFAULT FALSE,

-- FRT (First Response Time) tracking
first_response_at TIMESTAMP WITH TIME ZONE,
first_response_time_minutes INTEGER,

-- CSAT/DSAT tracking
csat_score SMALLINT CHECK (csat_score >= 1 AND csat_score <= 5),
dsat_score SMALLINT CHECK (dsat_score >= 1 AND dsat_score <= 5),
csat_feedback TEXT,
dsat_feedback TEXT,

-- Reopen tracking
reopen_count INTEGER DEFAULT 0,
last_reopened_at TIMESTAMP WITH TIME ZONE,

-- Collision detection (prevent simultaneous edits)
locked_by_user_id BIGINT REFERENCES system_users(id),
locked_at TIMESTAMP WITH TIME ZONE,
lock_expires_at TIMESTAMP WITH TIME ZONE,

-- Search optimization
search_vector tsvector, -- Full-text search vector

-- Metadata for automation
automation_metadata JSONB DEFAULT '{}'::jsonb,
```

#### `ticket_custom_fields` - Dynamic Custom Fields Master

```sql
CREATE TABLE ticket_custom_fields (
  id BIGSERIAL PRIMARY KEY,
  
  -- Field Identification
  field_code TEXT NOT NULL UNIQUE, -- e.g., "ORDER_VALUE", "CUSTOMER_TIER"
  field_name TEXT NOT NULL,
  field_description TEXT,
  
  -- Field Type
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'number', 'date', 'datetime', 'boolean', 
    'select', 'multiselect', 'textarea', 'url', 'email'
  )),
  
  -- Field Configuration (JSONB for flexibility)
  field_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"options": ["Option1", "Option2"], "required": true, "default": "Option1"}
  
  -- Applicability
  service_type ticket_service_type[], -- NULL = all services
  ticket_section ticket_section[], -- NULL = all sections
  ticket_category ticket_category[], -- NULL = all categories
  
  -- Display Settings
  display_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Validation Rules
  validation_rules JSONB DEFAULT '{}'::jsonb,
  -- Example: {"min": 0, "max": 100, "pattern": "^[A-Z]+$"}
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX ticket_custom_fields_field_code_idx ON ticket_custom_fields(field_code);
CREATE INDEX ticket_custom_fields_service_section_idx ON ticket_custom_fields(service_type, ticket_section, is_active);
```

#### `ticket_custom_field_values` - Custom Field Values

```sql
CREATE TABLE ticket_custom_field_values (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field_id BIGINT NOT NULL REFERENCES ticket_custom_fields(id) ON DELETE CASCADE,
  
  -- Value Storage (polymorphic)
  text_value TEXT,
  number_value NUMERIC,
  boolean_value BOOLEAN,
  date_value DATE,
  datetime_value TIMESTAMP WITH TIME ZONE,
  json_value JSONB, -- For select/multiselect
  
  -- Metadata
  updated_by_user_id BIGINT REFERENCES system_users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one value per field per ticket
  UNIQUE(ticket_id, field_id)
);

CREATE INDEX ticket_custom_field_values_ticket_id_idx ON ticket_custom_field_values(ticket_id);
CREATE INDEX ticket_custom_field_values_field_id_idx ON ticket_custom_field_values(field_id);
CREATE INDEX ticket_custom_field_values_text_value_idx ON ticket_custom_field_values(text_value) WHERE text_value IS NOT NULL;
CREATE INDEX ticket_custom_field_values_number_value_idx ON ticket_custom_field_values(number_value) WHERE number_value IS NOT NULL;
```

### 3.2 SLA & Priority Management

#### `ticket_sla_policies` - Dynamic SLA Policies

```sql
CREATE TABLE ticket_sla_policies (
  id BIGSERIAL PRIMARY KEY,
  
  -- Policy Identification
  policy_code TEXT NOT NULL UNIQUE,
  policy_name TEXT NOT NULL,
  policy_description TEXT,
  
  -- Applicability Rules (JSONB for complex conditions)
  applicability_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"service_type": ["food"], "priority": ["high", "urgent"], "ticket_section": ["customer"]}
  
  -- SLA Targets (in minutes)
  first_response_target_minutes INTEGER,
  resolution_target_minutes INTEGER NOT NULL,
  update_target_minutes INTEGER, -- Time between updates
  
  -- Business Hours (optional)
  business_hours_config JSONB DEFAULT '{}'::jsonb,
  -- Example: {"timezone": "Asia/Kolkata", "hours": {"monday": {"start": "09:00", "end": "18:00"}}}
  
  -- Escalation Rules
  escalation_rules JSONB DEFAULT '{}'::jsonb,
  -- Example: {"at_50_percent": {"action": "notify_supervisor"}, "at_80_percent": {"action": "escalate"}}
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0, -- Higher priority = evaluated first
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX ticket_sla_policies_policy_code_idx ON ticket_sla_policies(policy_code);
CREATE INDEX ticket_sla_policies_is_active_idx ON ticket_sla_policies(is_active, priority);
```

#### `ticket_priorities` - Dynamic Priority Management

```sql
CREATE TABLE ticket_priorities (
  id BIGSERIAL PRIMARY KEY,
  
  -- Priority Identification
  priority_code TEXT NOT NULL UNIQUE, -- e.g., "low", "medium", "high", "urgent", "critical"
  priority_name TEXT NOT NULL,
  priority_description TEXT,
  
  -- Priority Level (for sorting)
  priority_level INTEGER NOT NULL UNIQUE, -- 1 = lowest, 5 = highest
  
  -- Display Settings
  display_color TEXT, -- Hex color code
  display_icon TEXT, -- Icon name
  display_order INTEGER DEFAULT 0,
  
  -- Default SLA (can be overridden by SLA policies)
  default_sla_minutes INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX ticket_priorities_priority_code_idx ON ticket_priorities(priority_code);
CREATE INDEX ticket_priorities_priority_level_idx ON ticket_priorities(priority_level);
```

### 3.3 Status Management

#### `ticket_statuses` - Dynamic Status Types

```sql
CREATE TABLE ticket_statuses (
  id BIGSERIAL PRIMARY KEY,
  
  -- Status Identification
  status_code TEXT NOT NULL UNIQUE, -- e.g., "open", "assigned", "in_progress", "resolved", "closed"
  status_name TEXT NOT NULL,
  status_description TEXT,
  
  -- Status Category
  status_category TEXT NOT NULL CHECK (status_category IN (
    'open', 'in_progress', 'resolved', 'closed', 'rejected'
  )),
  
  -- Display Settings
  display_color TEXT,
  display_icon TEXT,
  display_order INTEGER DEFAULT 0,
  
  -- State Machine Rules
  allowed_transitions TEXT[], -- Array of status codes that can be transitioned to
  requires_reason BOOLEAN DEFAULT FALSE, -- Require reason for transition
  requires_resolution BOOLEAN DEFAULT FALSE, -- Require resolution text
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX ticket_statuses_status_code_idx ON ticket_statuses(status_code);
CREATE INDEX ticket_statuses_status_category_idx ON ticket_statuses(status_category);
```

### 3.4 RBAC & Permission System

#### `roles` - Role Master

```sql
CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  
  -- Role Identification
  role_code TEXT NOT NULL UNIQUE, -- e.g., "super_admin", "supervisor", "agent", "viewer"
  role_name TEXT NOT NULL,
  role_description TEXT,
  
  -- Role Hierarchy
  parent_role_id BIGINT REFERENCES roles(id),
  role_level INTEGER DEFAULT 1, -- 1 = top level
  
  -- Role Type
  role_type TEXT NOT NULL CHECK (role_type IN (
    'system', -- System-defined (cannot be deleted)
    'custom'  -- Custom role (can be deleted)
  )),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX roles_role_code_idx ON roles(role_code);
CREATE INDEX roles_parent_role_id_idx ON roles(parent_role_id);
```

#### `permissions` - Permission Master

```sql
CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  
  -- Permission Identification
  permission_code TEXT NOT NULL UNIQUE,
  -- Format: "ticket.{action}.{service}" or "ticket.{action}.{service}.{section}"
  -- Examples: "ticket.view.food", "ticket.action.assign.parcel", "ticket.action.reply.person_ride.customer"
  
  permission_name TEXT NOT NULL,
  permission_description TEXT,
  
  -- Permission Category
  permission_category TEXT NOT NULL, -- "view", "action", "admin"
  
  -- Resource & Action
  resource_type TEXT NOT NULL, -- "ticket", "user", "admin"
  action_type TEXT NOT NULL, -- "view", "create", "update", "delete", "assign", "resolve"
  
  -- Scope (optional)
  service_type ticket_service_type[], -- NULL = all services
  ticket_section ticket_section[], -- NULL = all sections
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX permissions_permission_code_idx ON permissions(permission_code);
CREATE INDEX permissions_resource_action_idx ON permissions(resource_type, action_type);
```

#### `role_permissions` - Role-Permission Mapping

```sql
CREATE TABLE role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  -- Grant Type
  grant_type TEXT NOT NULL DEFAULT 'allow' CHECK (grant_type IN ('allow', 'deny')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(role_id, permission_id)
);

CREATE INDEX role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX role_permissions_permission_id_idx ON role_permissions(permission_id);
```

#### `user_roles` - User-Role Assignment

```sql
CREATE TABLE user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  -- Scope (optional - for service-specific roles)
  service_type ticket_service_type[], -- NULL = all services
  ticket_section ticket_section[], -- NULL = all sections
  
  -- Assignment Details
  assigned_by_user_id BIGINT REFERENCES system_users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  UNIQUE(user_id, role_id, service_type, ticket_section)
);

CREATE INDEX user_roles_user_id_idx ON user_roles(user_id, is_active);
CREATE INDEX user_roles_role_id_idx ON user_roles(role_id);
```

#### `supervisor_mappings` - Supervisor Hierarchy

```sql
CREATE TABLE supervisor_mappings (
  id BIGSERIAL PRIMARY KEY,
  
  -- Hierarchy
  supervisor_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  agent_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Scope
  service_type ticket_service_type[], -- NULL = all services
  ticket_section ticket_section[], -- NULL = all sections
  
  -- Assignment Details
  assigned_by_user_id BIGINT REFERENCES system_users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Prevent self-assignment
  CHECK (supervisor_user_id != agent_user_id),
  
  UNIQUE(supervisor_user_id, agent_user_id, service_type, ticket_section)
);

CREATE INDEX supervisor_mappings_supervisor_id_idx ON supervisor_mappings(supervisor_user_id, is_active);
CREATE INDEX supervisor_mappings_agent_id_idx ON supervisor_mappings(agent_user_id, is_active);
```

### 3.5 Agent Capacity & Availability

#### `agent_profiles` - Agent Profile & Capacity

```sql
CREATE TABLE agent_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Capacity Settings
  max_concurrent_tickets INTEGER DEFAULT 10,
  max_daily_tickets INTEGER DEFAULT 50,
  
  -- Skill Tags (for routing)
  skill_tags TEXT[], -- e.g., ["food_expert", "parcel_specialist", "hindi_speaker"]
  
  -- Language Support
  supported_languages TEXT[] DEFAULT ARRAY['en'], -- ISO 639-1 codes
  
  -- Availability Schedule (JSONB for flexibility)
  availability_schedule JSONB DEFAULT '{}'::jsonb,
  -- Example: {"monday": {"start": "09:00", "end": "18:00"}, "timezone": "Asia/Kolkata"}
  
  -- Performance Metrics (cached)
  avg_resolution_time_minutes INTEGER,
  avg_first_response_time_minutes INTEGER,
  total_tickets_resolved INTEGER DEFAULT 0,
  csat_avg_score NUMERIC(3, 2),
  
  -- Status
  is_online BOOLEAN DEFAULT FALSE,
  last_online_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX agent_profiles_user_id_idx ON agent_profiles(user_id);
CREATE INDEX agent_profiles_is_online_idx ON agent_profiles(is_online);
CREATE INDEX agent_profiles_skill_tags_idx ON agent_profiles USING GIN(skill_tags);
```

#### `agent_availability_logs` - Availability History

```sql
CREATE TABLE agent_availability_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Status Change
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'away', 'busy')),
  previous_status TEXT,
  
  -- Context
  reason TEXT, -- Optional reason for status change
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamps
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Duration (calculated)
  duration_minutes INTEGER -- Calculated when status changes back
);

CREATE INDEX agent_availability_logs_agent_id_idx ON agent_availability_logs(agent_user_id, changed_at);
CREATE INDEX agent_availability_logs_status_idx ON agent_availability_logs(status, changed_at);
```

### 3.6 Auto-Assignment Engine

#### `ticket_routing_rules` - Routing Rules

```sql
CREATE TABLE ticket_routing_rules (
  id BIGSERIAL PRIMARY KEY,
  
  -- Rule Identification
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  
  -- Rule Priority (higher = evaluated first)
  rule_priority INTEGER NOT NULL DEFAULT 0,
  
  -- Conditions (JSONB for complex logic)
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {
  --   "service_type": ["food"],
  --   "priority": ["high", "urgent"],
  --   "ticket_section": ["customer"],
  --   "tags": ["vip"],
  --   "custom_fields": {"customer_tier": "premium"}
  -- }
  
  -- Routing Strategy
  routing_strategy TEXT NOT NULL CHECK (routing_strategy IN (
    'round_robin',      -- Distribute evenly
    'least_assigned',   -- Assign to agent with fewest tickets
    'skill_based',      -- Match agent skills
    'language_based',   -- Match agent language
    'load_based',       -- Based on agent capacity
    'priority_based',   -- High priority to experienced agents
    'custom'            -- Custom logic (future: AI)
  )),
  
  -- Routing Parameters
  routing_params JSONB DEFAULT '{}'::jsonb,
  -- Example: {"skill_tags": ["food_expert"], "min_csat": 4.0, "max_concurrent": 5}
  
  -- Target Assignment
  target_group_id BIGINT REFERENCES ticket_groups(id), -- Assign to group
  target_role_id BIGINT REFERENCES roles(id), -- Assign to role
  
  -- Fallback
  fallback_strategy TEXT, -- What to do if no agent matches
  fallback_group_id BIGINT REFERENCES ticket_groups(id),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX ticket_routing_rules_rule_code_idx ON ticket_routing_rules(rule_code);
CREATE INDEX ticket_routing_rules_priority_active_idx ON ticket_routing_rules(rule_priority DESC, is_active);
```

#### `ticket_assignment_queue` - Assignment Queue

```sql
CREATE TABLE ticket_assignment_queue (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Queue Status
  queue_status TEXT NOT NULL DEFAULT 'pending' CHECK (queue_status IN (
    'pending',      -- Waiting for assignment
    'processing',   -- Currently being processed
    'assigned',     -- Successfully assigned
    'failed',       -- Assignment failed
    'skipped'       -- Skipped (manual assignment)
  )),
  
  -- Assignment Attempts
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Routing Rule Used
  routing_rule_id BIGINT REFERENCES ticket_routing_rules(id),
  
  -- Assignment Result
  assigned_to_user_id BIGINT REFERENCES system_users(id),
  assignment_method TEXT, -- 'auto', 'manual', 'supervisor'
  
  -- Error Tracking
  error_message TEXT,
  
  -- Timestamps
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  assigned_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ticket_assignment_queue_status_idx ON ticket_assignment_queue(queue_status, queued_at);
CREATE INDEX ticket_assignment_queue_ticket_id_idx ON ticket_assignment_queue(ticket_id);
```

### 3.7 Realtime Chat System

#### `ticket_conversations` - Conversation Abstraction

```sql
CREATE TABLE ticket_conversations (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Conversation Metadata
  conversation_type TEXT NOT NULL DEFAULT 'ticket' CHECK (conversation_type IN (
    'ticket',      -- Regular ticket conversation
    'internal',    -- Internal team chat
    'external'     -- External chat (WhatsApp, etc.)
  )),
  
  -- Participants (cached for quick access)
  participant_user_ids BIGINT[], -- Array of system_user IDs
  participant_external_ids TEXT[], -- Array of external participant IDs
  
  -- Conversation Status
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Last Activity
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_by_user_id BIGINT REFERENCES system_users(id),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX ticket_conversations_ticket_id_idx ON ticket_conversations(ticket_id);
CREATE INDEX ticket_conversations_last_message_idx ON ticket_conversations(last_message_at DESC);
CREATE INDEX ticket_conversations_participants_idx ON ticket_conversations USING GIN(participant_user_ids);
```

#### `ticket_messages` (Enhanced - Already Exists)

**New Columns to Add:**
```sql
-- Conversation Reference
conversation_id BIGINT REFERENCES ticket_conversations(id),

-- Message Threading
parent_message_id BIGINT REFERENCES ticket_messages(id), -- For replies
thread_id BIGINT, -- For grouping related messages

-- Read Receipts
read_count INTEGER DEFAULT 0,
read_by_user_ids BIGINT[], -- Array of user IDs who read

-- Typing Indicators (stored in Redis, but tracked here)
last_typing_at TIMESTAMP WITH TIME ZONE,

-- Message Metadata
is_edited BOOLEAN DEFAULT FALSE,
is_deleted BOOLEAN DEFAULT FALSE,
deleted_at TIMESTAMP WITH TIME ZONE,

-- Rich Content
content_type TEXT DEFAULT 'text' CHECK (content_type IN (
  'text', 'html', 'markdown', 'image', 'file', 'system'
)),
rich_content JSONB DEFAULT '{}'::jsonb, -- For formatted content

-- Search Vector
search_vector tsvector,
```

#### `ticket_message_reads` - Read Receipts

```sql
CREATE TABLE ticket_message_reads (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Read Status
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(message_id, user_id)
);

CREATE INDEX ticket_message_reads_message_id_idx ON ticket_message_reads(message_id);
CREATE INDEX ticket_message_reads_user_id_idx ON ticket_message_reads(user_id, read_at DESC);
```

#### `ticket_message_typing` - Typing Indicators (Redis-backed, but schema for persistence)

```sql
CREATE TABLE ticket_message_typing (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ticket_conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Typing Status
  is_typing BOOLEAN DEFAULT TRUE,
  started_typing_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stopped_typing_at TIMESTAMP WITH TIME ZONE,
  
  -- Expiry (for cleanup)
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds')
);

CREATE INDEX ticket_message_typing_conversation_idx ON ticket_message_typing(conversation_id, expires_at);
CREATE INDEX ticket_message_typing_user_idx ON ticket_message_typing(user_id);
```

### 3.8 Attachments & Cloudflare R2

#### `ticket_attachments` - Attachment Metadata

```sql
CREATE TABLE ticket_attachments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES ticket_messages(id) ON DELETE CASCADE,
  
  -- File Information
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  file_extension TEXT,
  
  -- Cloudflare R2 Storage
  r2_key TEXT NOT NULL UNIQUE, -- Full path in R2
  r2_bucket TEXT NOT NULL DEFAULT 'ticket-attachments',
  r2_url TEXT, -- Public URL (if public)
  r2_signed_url TEXT, -- Temporary signed URL
  r2_signed_url_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- File Type
  file_type TEXT NOT NULL CHECK (file_type IN (
    'image', 'document', 'video', 'audio', 'other'
  )),
  
  -- Image Metadata (if image)
  image_width INTEGER,
  image_height INTEGER,
  image_format TEXT, -- 'jpeg', 'png', 'gif', etc.
  
  -- Upload Information
  uploaded_by_user_id BIGINT REFERENCES system_users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Status
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ticket_attachments_ticket_id_idx ON ticket_attachments(ticket_id, is_deleted);
CREATE INDEX ticket_attachments_message_id_idx ON ticket_attachments(message_id);
CREATE INDEX ticket_attachments_r2_key_idx ON ticket_attachments(r2_key);
CREATE INDEX ticket_attachments_file_type_idx ON ticket_attachments(file_type);
```

**R2 Folder Structure:**
```
ticket-attachments/
├── {ticket_id}/
│   ├── images/
│   │   ├── {timestamp}_{random}_{filename}.{ext}
│   │   └── thumbnails/
│   │       └── {timestamp}_{random}_{filename}_thumb.{ext}
│   ├── files/
│   │   └── {timestamp}_{random}_{filename}.{ext}
│   └── system/
│       └── {timestamp}_{random}_{filename}.{ext}
```

### 3.9 CSAT/DSAT System

#### `ticket_ratings` (Enhanced - Already Exists)

**New Columns to Add:**
```sql
-- Sentiment Analysis (future: AI)
sentiment_score NUMERIC(3, 2), -- -1.0 to 1.0
sentiment_label TEXT, -- 'positive', 'neutral', 'negative'
sentiment_confidence NUMERIC(3, 2),

-- Detailed Feedback
feedback_category TEXT, -- 'speed', 'quality', 'communication', 'resolution'
feedback_tags TEXT[], -- Array of tags

-- Follow-up
requires_followup BOOLEAN DEFAULT FALSE,
followup_scheduled_at TIMESTAMP WITH TIME ZONE,
```

#### `ticket_csat_analytics` - CSAT Analytics (Materialized View)

```sql
CREATE MATERIALIZED VIEW ticket_csat_analytics AS
SELECT
  DATE_TRUNC('day', tr.created_at) AS date,
  t.service_type,
  t.ticket_section,
  t.priority,
  COUNT(*) AS total_ratings,
  AVG(tr.rating_value) AS avg_rating,
  COUNT(*) FILTER (WHERE tr.rating_value >= 4) AS csat_count,
  COUNT(*) FILTER (WHERE tr.rating_value <= 2) AS dsat_count,
  COUNT(*) FILTER (WHERE tr.rating_value = 5) AS five_star_count,
  COUNT(*) FILTER (WHERE tr.rating_value = 1) AS one_star_count,
  (COUNT(*) FILTER (WHERE tr.rating_value >= 4)::NUMERIC / COUNT(*)::NUMERIC * 100) AS csat_percentage,
  (COUNT(*) FILTER (WHERE tr.rating_value <= 2)::NUMERIC / COUNT(*)::NUMERIC * 100) AS dsat_percentage
FROM ticket_ratings tr
JOIN tickets t ON tr.ticket_id = t.id
WHERE tr.created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', tr.created_at), t.service_type, t.ticket_section, t.priority;

CREATE UNIQUE INDEX ticket_csat_analytics_unique_idx ON ticket_csat_analytics(date, service_type, ticket_section, priority);
```

### 3.10 Advanced Filtering & Saved Views

#### `ticket_saved_filters` - Saved Filters/Views

```sql
CREATE TABLE ticket_saved_filters (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Filter Identification
  filter_name TEXT NOT NULL,
  filter_description TEXT,
  
  -- Filter Configuration (JSONB)
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {
  --   "service_type": ["food"],
  --   "status": ["open", "assigned"],
  --   "priority": ["high", "urgent"],
  --   "tags": ["vip"],
  --   "date_range": {"from": "2026-01-01", "to": "2026-01-31"},
  --   "assignee": [123, 456],
  --   "custom_fields": {"customer_tier": "premium"}
  -- }
  
  -- Display Settings
  is_shared BOOLEAN DEFAULT FALSE, -- Share with team
  is_default BOOLEAN DEFAULT FALSE, -- Default view for user
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, filter_name)
);

CREATE INDEX ticket_saved_filters_user_id_idx ON ticket_saved_filters(user_id, is_default);
CREATE INDEX ticket_saved_filters_shared_idx ON ticket_saved_filters(is_shared);
```

### 3.11 Automation Rules Engine

#### `ticket_automation_rules` - Automation Rules

```sql
CREATE TABLE ticket_automation_rules (
  id BIGSERIAL PRIMARY KEY,
  
  -- Rule Identification
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  
  -- Rule Priority
  rule_priority INTEGER NOT NULL DEFAULT 0,
  
  -- Trigger Conditions (JSONB)
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {
  --   "event": "ticket.created", // or "ticket.updated", "ticket.message.added"
  --   "conditions": {
  --     "service_type": ["food"],
  --     "priority": ["urgent"],
  --     "tags": ["vip"]
  --   }
  -- }
  
  -- Actions (JSONB array)
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"type": "assign", "target": "group", "group_id": 1},
  --   {"type": "add_tag", "tag_code": "auto_assigned"},
  --   {"type": "send_email", "template": "ticket_created"},
  --   {"type": "set_priority", "priority": "high"},
  --   {"type": "ai_suggest", "model": "gpt-4"}
  -- ]
  
  -- Execution Settings
  execution_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (execution_mode IN (
    'immediate',  -- Execute immediately
    'scheduled',  -- Execute on schedule
    'delayed'     -- Execute after delay
  )),
  execution_delay_seconds INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX ticket_automation_rules_rule_code_idx ON ticket_automation_rules(rule_code);
CREATE INDEX ticket_automation_rules_priority_active_idx ON ticket_automation_rules(rule_priority DESC, is_active);
```

#### `ticket_automation_executions` - Automation Execution Log

```sql
CREATE TABLE ticket_automation_executions (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES ticket_automation_rules(id) ON DELETE CASCADE,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Execution Status
  execution_status TEXT NOT NULL CHECK (execution_status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),
  
  -- Execution Result
  actions_executed JSONB DEFAULT '[]'::jsonb,
  actions_failed JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  
  -- Timestamps
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  execution_duration_ms INTEGER
);

CREATE INDEX ticket_automation_executions_rule_id_idx ON ticket_automation_executions(rule_id, triggered_at);
CREATE INDEX ticket_automation_executions_ticket_id_idx ON ticket_automation_executions(ticket_id);
CREATE INDEX ticket_automation_executions_status_idx ON ticket_automation_executions(execution_status, triggered_at);
```

### 3.12 Notification System

#### `ticket_notifications` - Notification Queue

```sql
CREATE TABLE ticket_notifications (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Notification Type
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'ticket_assigned', 'ticket_updated', 'ticket_message', 
    'ticket_resolved', 'ticket_closed', 'sla_breach', 'sla_warning'
  )),
  
  -- Notification Channels
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'], -- 'in_app', 'email', 'push', 'slack'
  
  -- Notification Content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE -- Auto-cleanup
);

CREATE INDEX ticket_notifications_user_id_idx ON ticket_notifications(user_id, is_read, created_at DESC);
CREATE INDEX ticket_notifications_ticket_id_idx ON ticket_notifications(ticket_id);
CREATE INDEX ticket_notifications_unread_idx ON ticket_notifications(user_id, is_read) WHERE is_read = FALSE;
```

---

## 4. Indexing Strategy for Performance

### 4.1 Composite Indexes

```sql
-- Ticket List Queries (most common)
CREATE INDEX tickets_service_status_created_idx 
  ON tickets(service_type, status, created_at DESC);

CREATE INDEX tickets_assignee_status_priority_idx 
  ON tickets(current_assignee_user_id, status, priority DESC, created_at DESC)
  WHERE current_assignee_user_id IS NOT NULL;

CREATE INDEX tickets_sla_breach_idx 
  ON tickets(sla_due_at, status)
  WHERE sla_due_at IS NOT NULL AND status NOT IN ('closed', 'resolved');

-- Search Optimization
CREATE INDEX tickets_search_vector_idx 
  ON tickets USING GIN(search_vector);

-- Custom Field Queries
CREATE INDEX ticket_custom_field_values_ticket_field_idx 
  ON ticket_custom_field_values(ticket_id, field_id);

-- Message Queries
CREATE INDEX ticket_messages_ticket_created_idx 
  ON ticket_messages(ticket_id, created_at DESC);

-- Assignment Queue
CREATE INDEX ticket_assignment_queue_status_queued_idx 
  ON ticket_assignment_queue(queue_status, queued_at)
  WHERE queue_status = 'pending';
```

### 4.2 Partial Indexes

```sql
-- Active Tickets Only
CREATE INDEX tickets_active_idx 
  ON tickets(status, priority, created_at DESC)
  WHERE status NOT IN ('closed', 'resolved');

-- Unassigned Tickets
CREATE INDEX tickets_unassigned_idx 
  ON tickets(service_type, priority, created_at DESC)
  WHERE current_assignee_user_id IS NULL AND status = 'open';

-- High Priority Active
CREATE INDEX tickets_high_priority_active_idx 
  ON tickets(priority, created_at DESC)
  WHERE priority IN ('urgent', 'critical') AND status NOT IN ('closed', 'resolved');
```

### 4.3 Full-Text Search

```sql
-- Update search_vector trigger
CREATE OR REPLACE FUNCTION tickets_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.ticket_number, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_search_vector_trigger
  BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_search_vector_update();
```

---

## 5. Realtime Architecture

### 5.1 WebSocket Server Design

**Technology Stack:**
- **Backend:** Node.js + Socket.io (or ws library)
- **Message Queue:** Redis Pub/Sub for horizontal scaling
- **Connection Management:** Redis for session storage

**Architecture:**
```
Client (Browser)
    ↕ WebSocket
WebSocket Server (Node.js)
    ↕ Redis Pub/Sub
Multiple Backend Instances
    ↕ PostgreSQL LISTEN/NOTIFY
Database
```

### 5.2 Message Flow

**1. Ticket Update Flow:**
```
1. Agent updates ticket → API call
2. API updates database → PostgreSQL trigger fires
3. Trigger sends NOTIFY → Backend receives
4. Backend publishes to Redis → WebSocket servers receive
5. WebSocket servers broadcast → Connected clients receive
```

**2. Chat Message Flow:**
```
1. User sends message → WebSocket message
2. WebSocket server validates → Stores in database
3. Database trigger fires → NOTIFY
4. Redis Pub/Sub → All WebSocket servers
5. Broadcast to conversation participants
```

**3. Typing Indicator Flow:**
```
1. User types → WebSocket message (throttled)
2. WebSocket server → Redis (TTL 30s)
3. Other participants → Real-time update
4. User stops typing → Clear from Redis
```

### 5.3 WebSocket Events

**Client → Server:**
- `ticket:subscribe` - Subscribe to ticket updates
- `ticket:unsubscribe` - Unsubscribe
- `conversation:join` - Join conversation
- `conversation:leave` - Leave conversation
- `message:send` - Send message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `read:mark` - Mark message as read

**Server → Client:**
- `ticket:updated` - Ticket updated
- `ticket:assigned` - Ticket assigned
- `ticket:status_changed` - Status changed
- `message:new` - New message
- `message:edited` - Message edited
- `typing:user_typing` - User typing
- `notification:new` - New notification
- `sla:warning` - SLA warning
- `sla:breach` - SLA breach

---

## 6. Auto-Assignment Engine Design

### 6.1 Algorithm Selection

**Phase 1: Round-Robin (Simple)**
- Distribute tickets evenly
- Track last assigned agent per group
- Simple and predictable

**Phase 2: Load-Based (Recommended)**
- Consider agent capacity
- Consider current workload
- Balance distribution

**Phase 3: Skill-Based (Advanced)**
- Match agent skills to ticket requirements
- Consider language preferences
- Consider expertise areas

**Phase 4: AI-Based (Future)**
- ML model for optimal assignment
- Consider historical performance
- Predict resolution time

### 6.2 Assignment Flow

```
1. Ticket Created → Insert into assignment_queue
2. Assignment Worker picks up → Evaluates routing_rules
3. Rule matches → Applies routing_strategy
4. Finds eligible agents → Filters by:
   - Online status
   - Capacity (current tickets < max_concurrent)
   - Skills match
   - Language match
   - Service access
5. Selects best agent → Updates ticket_assignment
6. Updates ticket → Sets current_assignee_user_id
7. Sends notification → Agent receives assignment
```

### 6.3 Assignment Worker (Background Job)

**Implementation:**
- **Queue System:** BullMQ (Redis-backed)
- **Concurrency:** 5 workers per instance
- **Retry Logic:** Exponential backoff
- **Failure Handling:** Dead letter queue

**Worker Logic:**
```typescript
async function processAssignmentQueue() {
  const pending = await getPendingAssignments();
  
  for (const assignment of pending) {
    try {
      const ticket = await getTicket(assignment.ticket_id);
      const rules = await getActiveRoutingRules();
      
      for (const rule of rules) {
        if (matchesConditions(ticket, rule.conditions)) {
          const agent = await findBestAgent(ticket, rule);
          if (agent) {
            await assignTicket(ticket.id, agent.id, 'auto');
            break;
          }
        }
      }
    } catch (error) {
      await logAssignmentError(assignment.id, error);
    }
  }
}
```

---

## 7. UI Architecture

### 7.1 Frontend Stack Recommendation

**Core Framework:**
- **React 18+** with **Next.js 14+** (App Router)
- **TypeScript** for type safety
- **Tailwind CSS** for styling

**State Management:**
- **Zustand** for client state (lightweight, simple)
- **React Query (TanStack Query)** for server state
- **WebSocket Context** for realtime updates

**UI Components:**
- **shadcn/ui** or **Radix UI** for accessible components
- **React Virtual** for virtualized lists (performance)

**Why This Stack?**
- ✅ **React Query:** Automatic caching, refetching, optimistic updates
- ✅ **Zustand:** Simple, no boilerplate, performant
- ✅ **WebSocket Context:** Centralized realtime state
- ✅ **Next.js App Router:** Server components, streaming, RSC

### 7.2 Layout Design (Filter Sidebar Conversion)

**Current Layout:**
```
┌─────────┬─────────────────────────────┬─────────┐
│ Sidebar │      Main Content           │ Right   │
│         │                             │ Sidebar │
└─────────┴─────────────────────────────┴─────────┘
```

**New Layout:**
```
┌─────────┬─────────────────────────────────────────┐
│ Sidebar │      Main Content (Full Width)          │
│         │  ┌─────────────────────────────────────┐ │
│         │  │  Filter Panel (Collapsible)         │ │
│         │  │  ┌──────────┐  ┌─────────────────┐│ │
│         │  │  │ Quick    │  │ Advanced Filters ││ │
│         │  │  │ Filters  │  │                 ││ │
│         │  │  └──────────┘  └─────────────────┘│ │
│         │  └─────────────────────────────────────┘ │
│         │  ┌─────────────────────────────────────┐ │
│         │  │  Ticket List / Detail View          │ │
│         │  └─────────────────────────────────────┘ │
└─────────┴─────────────────────────────────────────┘
```

**Alternative: Top Filter Bar**
```
┌─────────┬─────────────────────────────────────────┐
│ Sidebar │  ┌─────────────────────────────────────┐ │
│         │  │  Filter Bar (Horizontal)           │ │
│         │  │  [Service] [Status] [Priority] ... │ │
│         │  └─────────────────────────────────────┘ │
│         │  ┌─────────────────────────────────────┐ │
│         │  │  Ticket List / Detail View          │ │
│         │  └─────────────────────────────────────┘ │
└─────────┴─────────────────────────────────────────┘
```

**Recommendation:** **Collapsible Filter Panel** (like Freshdesk)
- More space for filters
- Can be collapsed when not needed
- Better for complex filtering

### 7.3 Component Structure

```
src/
├── app/
│   └── dashboard/
│       └── tickets/
│           ├── page.tsx                    # Main ticket dashboard
│           ├── [id]/
│           │   └── page.tsx               # Ticket detail view
│           └── layout.tsx                 # Ticket dashboard layout
├── components/
│   └── tickets/
│       ├── TicketList.tsx                  # Ticket list component
│       ├── TicketCard.tsx                   # Individual ticket card
│       ├── TicketDetail.tsx                # Ticket detail view
│       ├── TicketFilters.tsx               # Filter panel
│       ├── TicketChat.tsx                  # Chat interface
│       ├── TicketTimeline.tsx              # Activity timeline
│       ├── TicketAssignModal.tsx            # Assignment modal
│       ├── TicketStatusBadge.tsx            # Status badge
│       ├── TicketPriorityBadge.tsx         # Priority badge
│       ├── MessageBubble.tsx                # Chat message bubble
│       ├── TypingIndicator.tsx              # Typing indicator
│       ├── AttachmentViewer.tsx             # Attachment viewer
│       └── SavedFilters.tsx                 # Saved filters dropdown
├── hooks/
│   └── tickets/
│       ├── useTickets.ts                    # Ticket queries
│       ├── useTicketDetail.ts               # Ticket detail query
│       ├── useTicketMessages.ts             # Message queries
│       ├── useTicketFilters.ts              # Filter state
│       ├── useTicketAssignment.ts           # Assignment mutations
│       ├── useTicketWebSocket.ts            # WebSocket hook
│       └── useTicketPermissions.ts          # Permission checks
├── lib/
│   └── tickets/
│       ├── api.ts                           # API client
│       ├── websocket.ts                     # WebSocket client
│       ├── filters.ts                       # Filter utilities
│       ├── permissions.ts                   # Permission utilities
│       └── utils.ts                         # Utility functions
└── store/
    └── tickets/
        ├── ticketStore.ts                   # Zustand store
        └── filterStore.ts                   # Filter state store
```

---

## 8. Performance Optimization

### 8.1 Database Optimization

**Partitioning Strategy:**
```sql
-- Partition ticket_messages by month (for high volume)
CREATE TABLE ticket_messages_2026_01 PARTITION OF ticket_messages
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Partition ticket_actions_audit by month
CREATE TABLE ticket_actions_audit_2026_01 PARTITION OF ticket_actions_audit
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

**Read Replicas:**
- Primary: Write operations
- Replica 1: Read-heavy queries (list views)
- Replica 2: Analytics queries

**Connection Pooling:**
- **PgBouncer** for connection pooling
- **Pool Size:** 20-50 connections per instance

### 8.2 Caching Strategy

**Redis Cache Layers:**
1. **Ticket Metadata:** 5-minute TTL
2. **Agent Availability:** 30-second TTL
3. **Permission Checks:** 10-minute TTL
4. **Filter Results:** 1-minute TTL (invalidate on update)

**Cache Keys:**
```
ticket:{id}:metadata
ticket:{id}:messages:page:{page}
agent:{id}:availability
user:{id}:permissions
filter:{user_id}:{filter_hash}
```

### 8.3 Frontend Optimization

**Virtualization:**
- Use **React Virtual** for ticket lists (1000+ tickets)
- Render only visible items

**Code Splitting:**
- Lazy load ticket detail view
- Lazy load filter panel
- Lazy load chat component

**Optimistic Updates:**
- Update UI immediately on actions
- Rollback on error

---

## 9. Security Layer

### 9.1 PII Protection

**Data Masking:**
- Mask sensitive data in logs
- Encrypt PII in database
- Tokenize customer/rider IDs

**Access Control:**
- Row-level security (RLS) in PostgreSQL
- API-level permission checks
- UI-level permission checks

### 9.2 Audit Logging

**Comprehensive Audit:**
- All ticket actions logged
- All permission changes logged
- All data access logged

**Audit Retention:**
- 7 years for compliance
- Archive old audit logs

### 9.3 Rate Limiting

**API Rate Limits:**
- 100 requests/minute per user
- 1000 requests/minute per IP
- Burst: 20 requests/second

**WebSocket Rate Limits:**
- 10 messages/second per connection
- 100 subscriptions per connection

---

## 10. Migration Plan

### 10.1 Phase 1: Schema Extensions (Week 1-2)

1. Create new tables (non-breaking)
2. Add new columns with defaults
3. Create indexes
4. Deploy migrations

### 10.2 Phase 2: Backend API (Week 3-4)

1. Implement new API endpoints
2. Add WebSocket server
3. Implement assignment engine
4. Add permission checks

### 10.3 Phase 3: Frontend (Week 5-6)

1. Build ticket list component
2. Build ticket detail view
3. Build filter panel
4. Build chat interface
5. Integrate WebSocket

### 10.4 Phase 4: Testing & Rollout (Week 7-8)

1. Load testing
2. Security testing
3. Gradual rollout (10% → 50% → 100%)
4. Monitor performance

### 10.5 Phase 5: Cleanup (Week 9+)

1. Remove deprecated columns
2. Archive old data
3. Optimize queries

---

## 11. Common Architecture Mistakes to Avoid

### ❌ Mistake 1: Over-Normalization
**Problem:** Too many JOINs slow down queries
**Solution:** Denormalize frequently accessed data

### ❌ Mistake 2: No Caching Strategy
**Problem:** Database overload
**Solution:** Multi-layer caching (Redis + application cache)

### ❌ Mistake 3: Synchronous Assignment
**Problem:** Slow ticket creation
**Solution:** Async assignment queue

### ❌ Mistake 4: No Connection Pooling
**Problem:** Database connection exhaustion
**Solution:** Use PgBouncer

### ❌ Mistake 5: Hardcoded Business Logic
**Problem:** Cannot change without deployment
**Solution:** Metadata-driven architecture

### ❌ Mistake 6: No Read Replicas
**Problem:** Primary database overload
**Solution:** Use read replicas for analytics

### ❌ Mistake 7: No Partitioning
**Problem:** Slow queries on large tables
**Solution:** Partition by date

### ❌ Mistake 8: No Full-Text Search
**Problem:** Slow text searches
**Solution:** Use PostgreSQL tsvector or ElasticSearch

### ❌ Mistake 9: No Rate Limiting
**Problem:** API abuse
**Solution:** Implement rate limiting

### ❌ Mistake 10: No Monitoring
**Problem:** Cannot detect issues
**Solution:** Comprehensive monitoring (Prometheus + Grafana)

---

## 12. Next Steps

1. **Review & Approve** this architecture
2. **Create SQL migrations** for new tables
3. **Implement backend APIs** for new features
4. **Build frontend components** for dashboard
5. **Set up WebSocket server** for realtime
6. **Implement assignment engine** worker
7. **Set up monitoring** and alerting
8. **Load test** the system
9. **Gradual rollout** with feature flags
10. **Monitor & optimize** based on metrics

---

**End of Architecture Document**
