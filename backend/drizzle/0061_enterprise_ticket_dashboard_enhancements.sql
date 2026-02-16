-- ============================================================================
-- ENTERPRISE TICKET DASHBOARD ENHANCEMENTS
-- ============================================================================
-- This migration adds comprehensive enhancements to the enterprise ticket system
-- to support a production-grade ticketing dashboard comparable to Zendesk/Freshdesk
--
-- Features Added:
-- - Dynamic custom fields system
-- - SLA policies management
-- - Dynamic priorities and statuses
-- - Enterprise RBAC system
-- - Agent capacity and availability
-- - Auto-assignment engine
-- - Realtime chat enhancements
-- - CSAT/DSAT analytics
-- - Advanced filtering and saved views
-- - Automation rules engine
-- - Notification system
--
-- Migration: 0061_enterprise_ticket_dashboard_enhancements
-- Date: 2026-02-09
-- ============================================================================

-- Helper functions to convert enum arrays to text for unique index expressions
-- Create specific functions for each enum array type to ensure proper type resolution

CREATE OR REPLACE FUNCTION enum_array_to_text_service_type(arr ticket_service_type[])
RETURNS TEXT AS $$
BEGIN
  IF arr IS NULL OR array_length(arr, 1) IS NULL THEN
    RETURN '';
  END IF;
  RETURN array_to_string(ARRAY(SELECT unnest(arr)::text), ',');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION enum_array_to_text_ticket_section(arr ticket_section[])
RETURNS TEXT AS $$
BEGIN
  IF arr IS NULL OR array_length(arr, 1) IS NULL THEN
    RETURN '';
  END IF;
  RETURN array_to_string(ARRAY(SELECT unnest(arr)::text), ',');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 1. ENHANCE EXISTING TABLES
-- ============================================================================

-- Add new columns to tickets table
DO $$ 
BEGIN
  -- Custom field values
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'custom_field_values') THEN
    ALTER TABLE tickets ADD COLUMN custom_field_values JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- High-value order flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'is_high_value_order') THEN
    ALTER TABLE tickets ADD COLUMN is_high_value_order BOOLEAN DEFAULT FALSE;
  END IF;

  -- FRT tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'first_response_at') THEN
    ALTER TABLE tickets ADD COLUMN first_response_at TIMESTAMP WITH TIME ZONE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'first_response_time_minutes') THEN
    ALTER TABLE tickets ADD COLUMN first_response_time_minutes INTEGER;
  END IF;

  -- CSAT/DSAT tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'csat_score') THEN
    ALTER TABLE tickets ADD COLUMN csat_score SMALLINT CHECK (csat_score >= 1 AND csat_score <= 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'dsat_score') THEN
    ALTER TABLE tickets ADD COLUMN dsat_score SMALLINT CHECK (dsat_score >= 1 AND dsat_score <= 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'csat_feedback') THEN
    ALTER TABLE tickets ADD COLUMN csat_feedback TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'dsat_feedback') THEN
    ALTER TABLE tickets ADD COLUMN dsat_feedback TEXT;
  END IF;

  -- Reopen tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'reopen_count') THEN
    ALTER TABLE tickets ADD COLUMN reopen_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'last_reopened_at') THEN
    ALTER TABLE tickets ADD COLUMN last_reopened_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Collision detection
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'locked_by_user_id') THEN
    ALTER TABLE tickets ADD COLUMN locked_by_user_id BIGINT REFERENCES system_users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'locked_at') THEN
    ALTER TABLE tickets ADD COLUMN locked_at TIMESTAMP WITH TIME ZONE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'lock_expires_at') THEN
    ALTER TABLE tickets ADD COLUMN lock_expires_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Search optimization
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'search_vector') THEN
    ALTER TABLE tickets ADD COLUMN search_vector tsvector;
  END IF;

  -- Automation metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tickets' AND column_name = 'automation_metadata') THEN
    ALTER TABLE tickets ADD COLUMN automation_metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS tickets_is_high_value_idx ON tickets(is_high_value_order) WHERE is_high_value_order = TRUE;
CREATE INDEX IF NOT EXISTS tickets_first_response_idx ON tickets(first_response_at) WHERE first_response_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_reopen_count_idx ON tickets(reopen_count) WHERE reopen_count > 0;
CREATE INDEX IF NOT EXISTS tickets_locked_idx ON tickets(locked_by_user_id, lock_expires_at) WHERE locked_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_search_vector_idx ON tickets USING GIN(search_vector);

-- Enhance ticket_messages table
DO $$ 
BEGIN
  -- Conversation reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'conversation_id') THEN
    ALTER TABLE ticket_messages ADD COLUMN conversation_id BIGINT;
  END IF;

  -- Message threading
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'parent_message_id') THEN
    ALTER TABLE ticket_messages ADD COLUMN parent_message_id BIGINT REFERENCES ticket_messages(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'thread_id') THEN
    ALTER TABLE ticket_messages ADD COLUMN thread_id BIGINT;
  END IF;

  -- Read tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'read_count') THEN
    ALTER TABLE ticket_messages ADD COLUMN read_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'read_by_user_ids') THEN
    ALTER TABLE ticket_messages ADD COLUMN read_by_user_ids BIGINT[];
  END IF;

  -- Typing indicators
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'last_typing_at') THEN
    ALTER TABLE ticket_messages ADD COLUMN last_typing_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Message metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'is_edited') THEN
    ALTER TABLE ticket_messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'is_deleted') THEN
    ALTER TABLE ticket_messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'deleted_at') THEN
    ALTER TABLE ticket_messages ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Rich content
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'content_type') THEN
    ALTER TABLE ticket_messages ADD COLUMN content_type TEXT DEFAULT 'text' 
      CHECK (content_type IN ('text', 'html', 'markdown', 'image', 'file', 'system'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'rich_content') THEN
    ALTER TABLE ticket_messages ADD COLUMN rich_content JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Search vector
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_messages' AND column_name = 'search_vector') THEN
    ALTER TABLE ticket_messages ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Enhance ticket_ratings table
DO $$ 
BEGIN
  -- Sentiment analysis
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'sentiment_score') THEN
    ALTER TABLE ticket_ratings ADD COLUMN sentiment_score NUMERIC(3, 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'sentiment_label') THEN
    ALTER TABLE ticket_ratings ADD COLUMN sentiment_label TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'sentiment_confidence') THEN
    ALTER TABLE ticket_ratings ADD COLUMN sentiment_confidence NUMERIC(3, 2);
  END IF;

  -- Detailed feedback
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'feedback_category') THEN
    ALTER TABLE ticket_ratings ADD COLUMN feedback_category TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'feedback_tags') THEN
    ALTER TABLE ticket_ratings ADD COLUMN feedback_tags TEXT[];
  END IF;

  -- Follow-up
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'requires_followup') THEN
    ALTER TABLE ticket_ratings ADD COLUMN requires_followup BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ticket_ratings' AND column_name = 'followup_scheduled_at') THEN
    ALTER TABLE ticket_ratings ADD COLUMN followup_scheduled_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- ============================================================================
-- 2. CUSTOM FIELDS SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_custom_fields (
  id BIGSERIAL PRIMARY KEY,
  
  -- Field Identification
  field_code TEXT NOT NULL UNIQUE,
  field_name TEXT NOT NULL,
  field_description TEXT,
  
  -- Field Type
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'number', 'date', 'datetime', 'boolean', 
    'select', 'multiselect', 'textarea', 'url', 'email'
  )),
  
  -- Field Configuration
  field_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Applicability
  service_type ticket_service_type[],
  ticket_section ticket_section[],
  ticket_category ticket_category[],
  
  -- Display Settings
  display_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Validation Rules
  validation_rules JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX IF NOT EXISTS ticket_custom_fields_field_code_idx ON ticket_custom_fields(field_code);
-- Note: GIN indexes on enum arrays are not supported in PostgreSQL
-- Enum arrays will use sequential scans for array operations (@>, <@, &&)
-- If array performance is critical, consider converting enum arrays to text arrays in the schema
-- Regular index for boolean column
CREATE INDEX IF NOT EXISTS ticket_custom_fields_is_active_idx ON ticket_custom_fields(is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS ticket_custom_field_values (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field_id BIGINT NOT NULL REFERENCES ticket_custom_fields(id) ON DELETE CASCADE,
  
  -- Value Storage
  text_value TEXT,
  number_value NUMERIC,
  boolean_value BOOLEAN,
  date_value DATE,
  datetime_value TIMESTAMP WITH TIME ZONE,
  json_value JSONB,
  
  -- Metadata
  updated_by_user_id BIGINT REFERENCES system_users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(ticket_id, field_id)
);

CREATE INDEX IF NOT EXISTS ticket_custom_field_values_ticket_id_idx ON ticket_custom_field_values(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_custom_field_values_field_id_idx ON ticket_custom_field_values(field_id);
CREATE INDEX IF NOT EXISTS ticket_custom_field_values_text_value_idx ON ticket_custom_field_values(text_value) WHERE text_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_custom_field_values_number_value_idx ON ticket_custom_field_values(number_value) WHERE number_value IS NOT NULL;

-- ============================================================================
-- 3. SLA & PRIORITY MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_sla_policies (
  id BIGSERIAL PRIMARY KEY,
  
  -- Policy Identification
  policy_code TEXT NOT NULL UNIQUE,
  policy_name TEXT NOT NULL,
  policy_description TEXT,
  
  -- Applicability Rules
  applicability_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- SLA Targets (in minutes)
  first_response_target_minutes INTEGER,
  resolution_target_minutes INTEGER NOT NULL,
  update_target_minutes INTEGER,
  
  -- Business Hours
  business_hours_config JSONB DEFAULT '{}'::jsonb,
  
  -- Escalation Rules
  escalation_rules JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX IF NOT EXISTS ticket_sla_policies_policy_code_idx ON ticket_sla_policies(policy_code);
CREATE INDEX IF NOT EXISTS ticket_sla_policies_is_active_idx ON ticket_sla_policies(is_active, priority);

CREATE TABLE IF NOT EXISTS ticket_priorities (
  id BIGSERIAL PRIMARY KEY,
  
  -- Priority Identification
  priority_code TEXT NOT NULL UNIQUE,
  priority_name TEXT NOT NULL,
  priority_description TEXT,
  
  -- Priority Level
  priority_level INTEGER NOT NULL UNIQUE,
  
  -- Display Settings
  display_color TEXT,
  display_icon TEXT,
  display_order INTEGER DEFAULT 0,
  
  -- Default SLA
  default_sla_minutes INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_priorities_priority_code_idx ON ticket_priorities(priority_code);
CREATE INDEX IF NOT EXISTS ticket_priorities_priority_level_idx ON ticket_priorities(priority_level);

CREATE TABLE IF NOT EXISTS ticket_statuses (
  id BIGSERIAL PRIMARY KEY,
  
  -- Status Identification
  status_code TEXT NOT NULL UNIQUE,
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
  allowed_transitions TEXT[],
  requires_reason BOOLEAN DEFAULT FALSE,
  requires_resolution BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_statuses_status_code_idx ON ticket_statuses(status_code);
CREATE INDEX IF NOT EXISTS ticket_statuses_status_category_idx ON ticket_statuses(status_category);

-- ============================================================================
-- 4. RBAC & PERMISSION SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  
  -- Role Identification
  role_code TEXT NOT NULL UNIQUE,
  role_name TEXT NOT NULL,
  role_description TEXT,
  
  -- Role Hierarchy
  parent_role_id BIGINT REFERENCES roles(id),
  role_level INTEGER DEFAULT 1,
  
  -- Role Type
  role_type TEXT NOT NULL CHECK (role_type IN ('system', 'custom')),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roles_role_code_idx ON roles(role_code);
CREATE INDEX IF NOT EXISTS roles_parent_role_id_idx ON roles(parent_role_id);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  
  -- Permission Identification
  permission_code TEXT NOT NULL UNIQUE,
  permission_name TEXT NOT NULL,
  permission_description TEXT,
  
  -- Permission Category
  permission_category TEXT NOT NULL,
  
  -- Resource & Action
  resource_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  
  -- Scope
  service_type ticket_service_type[],
  ticket_section ticket_section[],
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permissions_permission_code_idx ON permissions(permission_code);
CREATE INDEX IF NOT EXISTS permissions_resource_action_idx ON permissions(resource_type, action_type);

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  -- Grant Type
  grant_type TEXT NOT NULL DEFAULT 'allow' CHECK (grant_type IN ('allow', 'deny')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);

-- Create or alter user_roles table to add ticket-specific columns
DO $$
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
    CREATE TABLE user_roles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      
      -- Scope
      service_type ticket_service_type[],
      ticket_section ticket_section[],
      
      -- Assignment Details
      assigned_by_user_id BIGINT REFERENCES system_users(id),
      assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE,
      
      -- Status
      is_active BOOLEAN DEFAULT TRUE
    );
  ELSE
    -- Table exists, add missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'service_type') THEN
      ALTER TABLE user_roles ADD COLUMN service_type ticket_service_type[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'ticket_section') THEN
      ALTER TABLE user_roles ADD COLUMN ticket_section ticket_section[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'assigned_by_user_id') THEN
      ALTER TABLE user_roles ADD COLUMN assigned_by_user_id BIGINT REFERENCES system_users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'assigned_at') THEN
      ALTER TABLE user_roles ADD COLUMN assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'expires_at') THEN
      ALTER TABLE user_roles ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_roles' AND column_name = 'is_active') THEN
      ALTER TABLE user_roles ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
  END IF;
END $$;

-- Unique constraint using index (handles NULL arrays properly)
-- Note: Using type-specific helper functions to convert enum arrays to text
-- Only create index if the required columns exist
DO $$
BEGIN
  -- Check if service_type and ticket_section columns exist before creating index
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'user_roles' AND column_name = 'service_type')
     AND EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'user_roles' AND column_name = 'ticket_section') THEN
    
    -- Determine which user_id column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_roles' AND column_name = 'user_id') THEN
      -- Use user_id column
      CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_idx 
        ON user_roles(
          user_id, 
          role_id, 
          COALESCE(enum_array_to_text_service_type(service_type), ''), 
          COALESCE(enum_array_to_text_ticket_section(ticket_section), '')
        );
      
      CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id, is_active);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'user_roles' AND column_name = 'system_user_id') THEN
      -- Use system_user_id column (existing table structure)
      CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_idx 
        ON user_roles(
          system_user_id, 
          role_id, 
          COALESCE(enum_array_to_text_service_type(service_type), ''), 
          COALESCE(enum_array_to_text_ticket_section(ticket_section), '')
        );
      
      CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(system_user_id, is_active);
    END IF;
    
    CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);
  END IF;
END $$;

-- Create or alter supervisor_mappings table
DO $$
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'supervisor_mappings') THEN
    CREATE TABLE supervisor_mappings (
      id BIGSERIAL PRIMARY KEY,
      
      -- Hierarchy
      supervisor_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
      agent_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
      
      -- Scope
      service_type ticket_service_type[],
      ticket_section ticket_section[],
      
      -- Assignment Details
      assigned_by_user_id BIGINT REFERENCES system_users(id),
      assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE,
      
      -- Status
      is_active BOOLEAN DEFAULT TRUE,
      
      CHECK (supervisor_user_id != agent_user_id)
    );
  ELSE
    -- Table exists, add missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supervisor_mappings' AND column_name = 'service_type') THEN
      ALTER TABLE supervisor_mappings ADD COLUMN service_type ticket_service_type[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supervisor_mappings' AND column_name = 'ticket_section') THEN
      ALTER TABLE supervisor_mappings ADD COLUMN ticket_section ticket_section[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supervisor_mappings' AND column_name = 'assigned_by_user_id') THEN
      ALTER TABLE supervisor_mappings ADD COLUMN assigned_by_user_id BIGINT REFERENCES system_users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supervisor_mappings' AND column_name = 'assigned_at') THEN
      ALTER TABLE supervisor_mappings ADD COLUMN assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supervisor_mappings' AND column_name = 'expires_at') THEN
      ALTER TABLE supervisor_mappings ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supervisor_mappings' AND column_name = 'is_active') THEN
      ALTER TABLE supervisor_mappings ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
  END IF;
END $$;

-- Unique constraint using index (handles NULL arrays properly)
-- Note: Using type-specific helper functions to convert enum arrays to text
-- Only create index if the required columns exist
DO $$
BEGIN
  -- Check if service_type and ticket_section columns exist before creating index
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'supervisor_mappings' AND column_name = 'service_type')
     AND EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'supervisor_mappings' AND column_name = 'ticket_section') THEN
    
    CREATE UNIQUE INDEX IF NOT EXISTS supervisor_mappings_unique_idx 
      ON supervisor_mappings(
        supervisor_user_id, 
        agent_user_id, 
        COALESCE(enum_array_to_text_service_type(service_type), ''), 
        COALESCE(enum_array_to_text_ticket_section(ticket_section), '')
      );
    
    CREATE INDEX IF NOT EXISTS supervisor_mappings_supervisor_id_idx ON supervisor_mappings(supervisor_user_id, is_active);
    CREATE INDEX IF NOT EXISTS supervisor_mappings_agent_id_idx ON supervisor_mappings(agent_user_id, is_active);
  END IF;
END $$;

-- ============================================================================
-- 5. AGENT CAPACITY & AVAILABILITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Capacity Settings
  max_concurrent_tickets INTEGER DEFAULT 10,
  max_daily_tickets INTEGER DEFAULT 50,
  
  -- Skill Tags
  skill_tags TEXT[],
  
  -- Language Support
  supported_languages TEXT[] DEFAULT ARRAY['en'],
  
  -- Availability Schedule
  availability_schedule JSONB DEFAULT '{}'::jsonb,
  
  -- Performance Metrics
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

CREATE INDEX IF NOT EXISTS agent_profiles_user_id_idx ON agent_profiles(user_id);
CREATE INDEX IF NOT EXISTS agent_profiles_is_online_idx ON agent_profiles(is_online);
CREATE INDEX IF NOT EXISTS agent_profiles_skill_tags_idx ON agent_profiles USING GIN(skill_tags);

CREATE TABLE IF NOT EXISTS agent_availability_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Status Change
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'away', 'busy')),
  previous_status TEXT,
  
  -- Context
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamps
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Duration
  duration_minutes INTEGER
);

CREATE INDEX IF NOT EXISTS agent_availability_logs_agent_id_idx ON agent_availability_logs(agent_user_id, changed_at);
CREATE INDEX IF NOT EXISTS agent_availability_logs_status_idx ON agent_availability_logs(status, changed_at);

-- ============================================================================
-- 6. AUTO-ASSIGNMENT ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_routing_rules (
  id BIGSERIAL PRIMARY KEY,
  
  -- Rule Identification
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  
  -- Rule Priority
  rule_priority INTEGER NOT NULL DEFAULT 0,
  
  -- Conditions
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Routing Strategy
  routing_strategy TEXT NOT NULL CHECK (routing_strategy IN (
    'round_robin', 'least_assigned', 'skill_based', 'language_based', 
    'load_based', 'priority_based', 'custom'
  )),
  
  -- Routing Parameters
  routing_params JSONB DEFAULT '{}'::jsonb,
  
  -- Target Assignment
  target_group_id BIGINT REFERENCES ticket_groups(id),
  target_role_id BIGINT REFERENCES roles(id),
  
  -- Fallback
  fallback_strategy TEXT,
  fallback_group_id BIGINT REFERENCES ticket_groups(id),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX IF NOT EXISTS ticket_routing_rules_rule_code_idx ON ticket_routing_rules(rule_code);
CREATE INDEX IF NOT EXISTS ticket_routing_rules_priority_active_idx ON ticket_routing_rules(rule_priority DESC, is_active);

CREATE TABLE IF NOT EXISTS ticket_assignment_queue (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Queue Status
  queue_status TEXT NOT NULL DEFAULT 'pending' CHECK (queue_status IN (
    'pending', 'processing', 'assigned', 'failed', 'skipped'
  )),
  
  -- Assignment Attempts
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Routing Rule Used
  routing_rule_id BIGINT REFERENCES ticket_routing_rules(id),
  
  -- Assignment Result
  assigned_to_user_id BIGINT REFERENCES system_users(id),
  assignment_method TEXT,
  
  -- Error Tracking
  error_message TEXT,
  
  -- Timestamps
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  assigned_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ticket_assignment_queue_status_idx ON ticket_assignment_queue(queue_status, queued_at);
CREATE INDEX IF NOT EXISTS ticket_assignment_queue_ticket_id_idx ON ticket_assignment_queue(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_assignment_queue_pending_idx ON ticket_assignment_queue(queue_status, queued_at) WHERE queue_status = 'pending';

-- ============================================================================
-- 7. REALTIME CHAT SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_conversations (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Conversation Metadata
  conversation_type TEXT NOT NULL DEFAULT 'ticket' CHECK (conversation_type IN (
    'ticket', 'internal', 'external'
  )),
  
  -- Participants
  participant_user_ids BIGINT[],
  participant_external_ids TEXT[],
  
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

CREATE INDEX IF NOT EXISTS ticket_conversations_ticket_id_idx ON ticket_conversations(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_conversations_last_message_idx ON ticket_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS ticket_conversations_participants_idx ON ticket_conversations USING GIN(participant_user_ids);

-- Add foreign key to ticket_messages
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ticket_messages_conversation_id_fkey'
  ) THEN
    ALTER TABLE ticket_messages 
    ADD CONSTRAINT ticket_messages_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES ticket_conversations(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ticket_message_reads (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Read Status
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS ticket_message_reads_message_id_idx ON ticket_message_reads(message_id);
CREATE INDEX IF NOT EXISTS ticket_message_reads_user_id_idx ON ticket_message_reads(user_id, read_at DESC);

CREATE TABLE IF NOT EXISTS ticket_message_typing (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ticket_conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Typing Status
  is_typing BOOLEAN DEFAULT TRUE,
  started_typing_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stopped_typing_at TIMESTAMP WITH TIME ZONE,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds')
);

CREATE INDEX IF NOT EXISTS ticket_message_typing_conversation_idx ON ticket_message_typing(conversation_id, expires_at);
CREATE INDEX IF NOT EXISTS ticket_message_typing_user_idx ON ticket_message_typing(user_id);

-- ============================================================================
-- 8. ATTACHMENTS & CLOUDFLARE R2
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES ticket_messages(id) ON DELETE CASCADE,
  
  -- File Information
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  file_extension TEXT,
  
  -- Cloudflare R2 Storage
  r2_key TEXT NOT NULL UNIQUE,
  r2_bucket TEXT NOT NULL DEFAULT 'ticket-attachments',
  r2_url TEXT,
  r2_signed_url TEXT,
  r2_signed_url_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- File Type
  file_type TEXT NOT NULL CHECK (file_type IN (
    'image', 'document', 'video', 'audio', 'other'
  )),
  
  -- Image Metadata
  image_width INTEGER,
  image_height INTEGER,
  image_format TEXT,
  
  -- Upload Information
  uploaded_by_user_id BIGINT REFERENCES system_users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Status
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_id_idx ON ticket_attachments(ticket_id, is_deleted);
CREATE INDEX IF NOT EXISTS ticket_attachments_message_id_idx ON ticket_attachments(message_id);
CREATE INDEX IF NOT EXISTS ticket_attachments_r2_key_idx ON ticket_attachments(r2_key);
CREATE INDEX IF NOT EXISTS ticket_attachments_file_type_idx ON ticket_attachments(file_type);

-- ============================================================================
-- 9. ADVANCED FILTERING & SAVED VIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_saved_filters (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Filter Identification
  filter_name TEXT NOT NULL,
  filter_description TEXT,
  
  -- Filter Configuration
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Display Settings
  is_shared BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, filter_name)
);

CREATE INDEX IF NOT EXISTS ticket_saved_filters_user_id_idx ON ticket_saved_filters(user_id, is_default);
CREATE INDEX IF NOT EXISTS ticket_saved_filters_shared_idx ON ticket_saved_filters(is_shared);

-- ============================================================================
-- 10. AUTOMATION RULES ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_automation_rules (
  id BIGSERIAL PRIMARY KEY,
  
  -- Rule Identification
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  
  -- Rule Priority
  rule_priority INTEGER NOT NULL DEFAULT 0,
  
  -- Trigger Conditions
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Actions
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Execution Settings
  execution_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (execution_mode IN (
    'immediate', 'scheduled', 'delayed'
  )),
  execution_delay_seconds INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES system_users(id)
);

CREATE INDEX IF NOT EXISTS ticket_automation_rules_rule_code_idx ON ticket_automation_rules(rule_code);
CREATE INDEX IF NOT EXISTS ticket_automation_rules_priority_active_idx ON ticket_automation_rules(rule_priority DESC, is_active);

CREATE TABLE IF NOT EXISTS ticket_automation_executions (
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

CREATE INDEX IF NOT EXISTS ticket_automation_executions_rule_id_idx ON ticket_automation_executions(rule_id, triggered_at);
CREATE INDEX IF NOT EXISTS ticket_automation_executions_ticket_id_idx ON ticket_automation_executions(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_automation_executions_status_idx ON ticket_automation_executions(execution_status, triggered_at);

-- ============================================================================
-- 11. NOTIFICATION SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_notifications (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Notification Type
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'ticket_assigned', 'ticket_updated', 'ticket_message', 
    'ticket_resolved', 'ticket_closed', 'sla_breach', 'sla_warning'
  )),
  
  -- Notification Channels
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
  
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
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ticket_notifications_user_id_idx ON ticket_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_notifications_ticket_id_idx ON ticket_notifications(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_notifications_unread_idx ON ticket_notifications(user_id, is_read) WHERE is_read = FALSE;

-- ============================================================================
-- 12. FULL-TEXT SEARCH TRIGGERS
-- ============================================================================

-- Update search_vector trigger for tickets
CREATE OR REPLACE FUNCTION tickets_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.ticket_number, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_search_vector_trigger ON tickets;
CREATE TRIGGER tickets_search_vector_trigger
  BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_search_vector_update();

-- Update search_vector trigger for messages
CREATE OR REPLACE FUNCTION ticket_messages_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.message, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_messages_search_vector_trigger ON ticket_messages;
CREATE TRIGGER ticket_messages_search_vector_trigger
  BEFORE INSERT OR UPDATE ON ticket_messages
  FOR EACH ROW EXECUTE FUNCTION ticket_messages_search_vector_update();

-- ============================================================================
-- 13. PERFORMANCE INDEXES
-- ============================================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS tickets_assignee_status_priority_idx 
  ON tickets(current_assignee_user_id, status, priority DESC, created_at DESC)
  WHERE current_assignee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_sla_breach_idx 
  ON tickets(sla_due_at, status)
  WHERE sla_due_at IS NOT NULL AND status NOT IN ('closed', 'resolved');

-- Partial indexes
CREATE INDEX IF NOT EXISTS tickets_active_idx 
  ON tickets(status, priority, created_at DESC)
  WHERE status NOT IN ('closed', 'resolved');

CREATE INDEX IF NOT EXISTS tickets_unassigned_idx 
  ON tickets(service_type, priority, created_at DESC)
  WHERE current_assignee_user_id IS NULL AND status = 'open';

CREATE INDEX IF NOT EXISTS tickets_high_priority_active_idx 
  ON tickets(priority, created_at DESC)
  WHERE priority IN ('urgent', 'critical') AND status NOT IN ('closed', 'resolved');

-- Message indexes
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_created_idx 
  ON ticket_messages(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ticket_messages_conversation_idx 
  ON ticket_messages(conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;

-- ============================================================================
-- 14. INITIAL DATA SEEDING
-- ============================================================================

-- Insert default priorities
INSERT INTO ticket_priorities (priority_code, priority_name, priority_level, display_color, display_order, is_active)
VALUES 
  ('low', 'Low', 1, '#6B7280', 1, TRUE),
  ('medium', 'Medium', 2, '#3B82F6', 2, TRUE),
  ('high', 'High', 3, '#F59E0B', 3, TRUE),
  ('urgent', 'Urgent', 4, '#EF4444', 4, TRUE),
  ('critical', 'Critical', 5, '#DC2626', 5, TRUE)
ON CONFLICT (priority_code) DO NOTHING;

-- Insert default statuses
INSERT INTO ticket_statuses (status_code, status_name, status_category, display_color, display_order, allowed_transitions, is_active)
VALUES 
  ('open', 'Open', 'open', '#3B82F6', 1, ARRAY['assigned', 'in_progress'], TRUE),
  ('assigned', 'Assigned', 'in_progress', '#8B5CF6', 2, ARRAY['in_progress', 'open'], TRUE),
  ('in_progress', 'In Progress', 'in_progress', '#F59E0B', 3, ARRAY['resolved', 'closed', 'reopened'], TRUE),
  ('resolved', 'Resolved', 'resolved', '#10B981', 4, ARRAY['closed', 'reopened'], TRUE),
  ('closed', 'Closed', 'closed', '#6B7280', 5, ARRAY['reopened'], TRUE),
  ('rejected', 'Rejected', 'closed', '#EF4444', 6, ARRAY['reopened'], TRUE),
  ('reopened', 'Reopened', 'open', '#F59E0B', 7, ARRAY['assigned', 'in_progress'], TRUE)
ON CONFLICT (status_code) DO NOTHING;

-- Insert default system roles
INSERT INTO roles (role_code, role_name, role_type, is_active)
VALUES 
  ('super_admin', 'Super Admin', 'system', TRUE),
  ('supervisor', 'Supervisor', 'system', TRUE),
  ('agent', 'Agent', 'system', TRUE),
  ('viewer', 'Viewer', 'system', TRUE)
ON CONFLICT (role_code) DO NOTHING;

-- ============================================================================
-- COMPREHENSIVE TICKET ACTIVITY AUDIT TRACKING SYSTEM
-- ============================================================================
-- This section creates/enhances the audit tracking system to capture ALL ticket activities
-- including assignments, resolutions, responses, reopens, unassignments, group changes, etc.

-- Create or enhance ticket_activity_audit table for comprehensive tracking
DO $$
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ticket_activity_audit') THEN
    CREATE TABLE ticket_activity_audit (
      id BIGSERIAL PRIMARY KEY,
      ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      
      -- Activity Details
      activity_type TEXT NOT NULL, -- See activity types below
      activity_category TEXT NOT NULL CHECK (activity_category IN (
        'assignment', 'status_change', 'priority_change', 'response', 
        'resolution', 'reopen', 'unassignment', 'group_change', 
        'service_change', 'tag_change', 'custom_field_change', 
        'sla_change', 'title_change', 'message', 'note', 'attachment',
        'rating', 'escalation', 'merge', 'split', 'other'
      )),
      activity_description TEXT NOT NULL,
      
      -- Actor Information (Who performed the action)
      actor_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
      actor_type ticket_entity_type, -- customer, rider, merchant, agent, supervisor, system
      actor_id BIGINT, -- Polymorphic actor ID (rider_id, customer_id, etc.)
      actor_name TEXT, -- Cached actor name for performance
      actor_role TEXT, -- agent, supervisor, super_admin, etc.
      
      -- Assignment Specific Fields
      assigned_to_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
      assigned_to_name TEXT, -- Cached assignee name
      assigned_by_type TEXT CHECK (assigned_by_type IN ('agent', 'supervisor', 'system', 'auto')),
      previous_assignee_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
      previous_assignee_name TEXT,
      
      -- Status Change Specific Fields
      old_status TEXT,
      new_status TEXT,
      status_change_reason TEXT,
      
      -- Priority Change Specific Fields
      old_priority TEXT,
      new_priority TEXT,
      priority_change_reason TEXT,
      
      -- Group/Service Change Fields
      old_group_id BIGINT REFERENCES ticket_groups(id) ON DELETE SET NULL,
      new_group_id BIGINT REFERENCES ticket_groups(id) ON DELETE SET NULL,
      old_service_type ticket_service_type[],
      new_service_type ticket_service_type[],
      old_ticket_section ticket_section[],
      new_ticket_section ticket_section[],
      
      -- Reopen Specific Fields
      reopened_by_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
      reopened_reason TEXT,
      reopened_from_status TEXT,
      reopened_to_status TEXT,
      
      -- Response Specific Fields
      response_message_id BIGINT REFERENCES ticket_messages(id) ON DELETE SET NULL,
      response_type TEXT CHECK (response_type IN ('public', 'internal_note', 'system')),
      is_first_response BOOLEAN DEFAULT FALSE,
      
      -- Resolution Specific Fields
      resolved_by_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
      resolution_type TEXT CHECK (resolution_type IN ('resolved', 'closed', 'rejected', 'cancelled')),
      resolution_notes TEXT,
      
      -- Unassignment Specific Fields
      unassigned_by_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
      unassignment_reason TEXT,
      
      -- Change Tracking (JSONB for flexible change tracking)
      old_value JSONB, -- Complete old state snapshot
      new_value JSONB, -- Complete new state snapshot
      changed_fields TEXT[], -- Array of field names that changed
      
      -- Metadata
      metadata JSONB DEFAULT '{}'::jsonb, -- Additional context, IP address, user agent, etc.
      ip_address INET,
      user_agent TEXT,
      
      -- Timestamps
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    
    -- Create indexes for comprehensive querying
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_ticket_id_idx 
      ON ticket_activity_audit(ticket_id, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_activity_type_idx 
      ON ticket_activity_audit(activity_type, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_activity_category_idx 
      ON ticket_activity_audit(activity_category, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_actor_user_id_idx 
      ON ticket_activity_audit(actor_user_id, created_at DESC) 
      WHERE actor_user_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_assigned_to_user_id_idx 
      ON ticket_activity_audit(assigned_to_user_id, created_at DESC) 
      WHERE assigned_to_user_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_actor_role_idx 
      ON ticket_activity_audit(actor_role, created_at DESC) 
      WHERE actor_role IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_created_at_idx 
      ON ticket_activity_audit(created_at DESC);
    
    -- Composite indexes for common queries
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_ticket_activity_idx 
      ON ticket_activity_audit(ticket_id, activity_category, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_actor_activity_idx 
      ON ticket_activity_audit(actor_user_id, activity_category, created_at DESC) 
      WHERE actor_user_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_assignment_idx 
      ON ticket_activity_audit(activity_category, assigned_to_user_id, created_at DESC) 
      WHERE activity_category = 'assignment' AND assigned_to_user_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS ticket_activity_audit_reopen_idx 
      ON ticket_activity_audit(activity_category, reopened_by_user_id, created_at DESC) 
      WHERE activity_category = 'reopen' AND reopened_by_user_id IS NOT NULL;
    
    -- Add comments
    COMMENT ON TABLE ticket_activity_audit IS 'Comprehensive immutable audit log of all ticket activities';
    COMMENT ON COLUMN ticket_activity_audit.activity_type IS 'Specific activity: assign, unassign, resolve, reopen, reply, status_change, priority_change, group_change, service_change, etc.';
    COMMENT ON COLUMN ticket_activity_audit.activity_category IS 'Category grouping: assignment, status_change, response, resolution, reopen, etc.';
    COMMENT ON COLUMN ticket_activity_audit.assigned_by_type IS 'Who assigned: agent, supervisor, system (auto-assignment), auto';
    
  ELSE
    -- Table exists, add missing columns if needed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'activity_category') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN activity_category TEXT;
      -- Update existing rows
      UPDATE ticket_activity_audit SET activity_category = 
        CASE 
          WHEN activity_type LIKE '%assign%' THEN 'assignment'
          WHEN activity_type LIKE '%status%' THEN 'status_change'
          WHEN activity_type LIKE '%priority%' THEN 'priority_change'
          WHEN activity_type LIKE '%reply%' OR activity_type LIKE '%response%' THEN 'response'
          WHEN activity_type LIKE '%resolve%' THEN 'resolution'
          WHEN activity_type LIKE '%reopen%' THEN 'reopen'
          WHEN activity_type LIKE '%unassign%' THEN 'unassignment'
          WHEN activity_type LIKE '%group%' THEN 'group_change'
          WHEN activity_type LIKE '%service%' THEN 'service_change'
          ELSE 'other'
        END;
      ALTER TABLE ticket_activity_audit ALTER COLUMN activity_category SET NOT NULL;
      ALTER TABLE ticket_activity_audit ADD CONSTRAINT ticket_activity_audit_category_check 
        CHECK (activity_category IN (
          'assignment', 'status_change', 'priority_change', 'response', 
          'resolution', 'reopen', 'unassignment', 'group_change', 
          'service_change', 'tag_change', 'custom_field_change', 
          'sla_change', 'title_change', 'message', 'note', 'attachment',
          'rating', 'escalation', 'merge', 'split', 'other'
        ));
    END IF;
    
    -- Add other missing columns as needed (checking and adding one by one)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'actor_name') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN actor_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'actor_role') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN actor_role TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'assigned_to_user_id') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN assigned_to_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'assigned_to_name') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN assigned_to_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'assigned_by_type') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN assigned_by_type TEXT 
        CHECK (assigned_by_type IN ('agent', 'supervisor', 'system', 'auto'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'previous_assignee_user_id') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN previous_assignee_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'previous_assignee_name') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN previous_assignee_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'old_status') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN old_status TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'new_status') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN new_status TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'reopened_by_user_id') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN reopened_by_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'reopened_reason') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN reopened_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'response_message_id') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN response_message_id BIGINT REFERENCES ticket_messages(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'is_first_response') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN is_first_response BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'unassigned_by_user_id') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN unassigned_by_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'changed_fields') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN changed_fields TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'ip_address') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN ip_address INET;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ticket_activity_audit' AND column_name = 'user_agent') THEN
      ALTER TABLE ticket_activity_audit ADD COLUMN user_agent TEXT;
    END IF;
    
    -- Create indexes if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ticket_activity_audit_activity_category_idx') THEN
      CREATE INDEX ticket_activity_audit_activity_category_idx 
        ON ticket_activity_audit(activity_category, created_at DESC);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ticket_activity_audit_assigned_to_user_id_idx') THEN
      CREATE INDEX ticket_activity_audit_assigned_to_user_id_idx 
        ON ticket_activity_audit(assigned_to_user_id, created_at DESC) 
        WHERE assigned_to_user_id IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ticket_activity_audit_assignment_idx') THEN
      CREATE INDEX ticket_activity_audit_assignment_idx 
        ON ticket_activity_audit(activity_category, assigned_to_user_id, created_at DESC) 
        WHERE activity_category = 'assignment' AND assigned_to_user_id IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ticket_activity_audit_reopen_idx') THEN
      CREATE INDEX ticket_activity_audit_reopen_idx 
        ON ticket_activity_audit(activity_category, reopened_by_user_id, created_at DESC) 
        WHERE activity_category = 'reopen' AND reopened_by_user_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS FOR AUDIT LOGGING
-- ============================================================================
-- These functions make it easy to log activities from application code

-- Function to log ticket assignment
CREATE OR REPLACE FUNCTION log_ticket_assignment(
  p_ticket_id BIGINT,
  p_assigned_to_user_id BIGINT,
  p_assigned_by_user_id BIGINT,
  p_assigned_by_type TEXT, -- 'agent', 'supervisor', 'system', 'auto'
  p_previous_assignee_user_id BIGINT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_assigned_to_name TEXT;
  v_previous_assignee_name TEXT;
  v_audit_id BIGINT;
BEGIN
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_assigned_by_user_id
  LIMIT 1;
  
  -- Get assignee name
  SELECT name INTO v_assigned_to_name
  FROM system_users
  WHERE id = p_assigned_to_user_id;
  
  -- Get previous assignee name if provided
  IF p_previous_assignee_user_id IS NOT NULL THEN
    SELECT name INTO v_previous_assignee_name
    FROM system_users
    WHERE id = p_previous_assignee_user_id;
  END IF;
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    assigned_to_user_id, assigned_to_name, assigned_by_type,
    previous_assignee_user_id, previous_assignee_name,
    metadata
  ) VALUES (
    p_ticket_id, 
    'assign', 
    'assignment',
    COALESCE(p_reason, 'Ticket assigned to ' || v_assigned_to_name),
    p_assigned_by_user_id,
    v_actor_name,
    v_actor_role,
    p_assigned_to_user_id,
    v_assigned_to_name,
    p_assigned_by_type,
    p_previous_assignee_user_id,
    v_previous_assignee_name,
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log ticket unassignment
CREATE OR REPLACE FUNCTION log_ticket_unassignment(
  p_ticket_id BIGINT,
  p_unassigned_by_user_id BIGINT,
  p_unassignment_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_previous_assignee_user_id BIGINT;
  v_previous_assignee_name TEXT;
  v_audit_id BIGINT;
BEGIN
  -- Get current assignee before unassignment
  SELECT current_assignee_user_id INTO v_previous_assignee_user_id
  FROM tickets
  WHERE id = p_ticket_id;
  
  IF v_previous_assignee_user_id IS NOT NULL THEN
    SELECT name INTO v_previous_assignee_name
    FROM system_users
    WHERE id = v_previous_assignee_user_id;
  END IF;
  
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_unassigned_by_user_id
  LIMIT 1;
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    unassigned_by_user_id, unassignment_reason,
    previous_assignee_user_id, previous_assignee_name,
    metadata
  ) VALUES (
    p_ticket_id,
    'unassign',
    'unassignment',
    COALESCE(p_unassignment_reason, 'Ticket unassigned from ' || COALESCE(v_previous_assignee_name, 'agent')),
    p_unassigned_by_user_id,
    v_actor_name,
    v_actor_role,
    p_unassigned_by_user_id,
    p_unassignment_reason,
    v_previous_assignee_user_id,
    v_previous_assignee_name,
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log ticket resolution
CREATE OR REPLACE FUNCTION log_ticket_resolution(
  p_ticket_id BIGINT,
  p_resolved_by_user_id BIGINT,
  p_resolution_type TEXT, -- 'resolved', 'closed', 'rejected', 'cancelled'
  p_resolution_notes TEXT DEFAULT NULL,
  p_old_status TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_audit_id BIGINT;
BEGIN
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_resolved_by_user_id
  LIMIT 1;
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    resolved_by_user_id, resolution_type, resolution_notes,
    old_status, new_status,
    metadata
  ) VALUES (
    p_ticket_id,
    'resolve',
    'resolution',
    COALESCE(p_resolution_notes, 'Ticket ' || p_resolution_type || ' by ' || v_actor_name),
    p_resolved_by_user_id,
    v_actor_name,
    v_actor_role,
    p_resolved_by_user_id,
    p_resolution_type,
    p_resolution_notes,
    p_old_status,
    p_new_status,
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log ticket reopen
CREATE OR REPLACE FUNCTION log_ticket_reopen(
  p_ticket_id BIGINT,
  p_reopened_by_user_id BIGINT,
  p_reopened_reason TEXT DEFAULT NULL,
  p_reopened_from_status TEXT DEFAULT NULL,
  p_reopened_to_status TEXT DEFAULT NULL,
  p_assigned_to_user_id BIGINT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_assigned_to_name TEXT;
  v_audit_id BIGINT;
BEGIN
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_reopened_by_user_id
  LIMIT 1;
  
  -- Get assignee name if provided
  IF p_assigned_to_user_id IS NOT NULL THEN
    SELECT name INTO v_assigned_to_name
    FROM system_users
    WHERE id = p_assigned_to_user_id;
  END IF;
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    reopened_by_user_id, reopened_reason, reopened_from_status, reopened_to_status,
    assigned_to_user_id, assigned_to_name,
    metadata
  ) VALUES (
    p_ticket_id,
    'reopen',
    'reopen',
    COALESCE(p_reopened_reason, 'Ticket reopened by ' || v_actor_name),
    p_reopened_by_user_id,
    v_actor_name,
    v_actor_role,
    p_reopened_by_user_id,
    p_reopened_reason,
    p_reopened_from_status,
    p_reopened_to_status,
    p_assigned_to_user_id,
    v_assigned_to_name,
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log ticket response/reply
CREATE OR REPLACE FUNCTION log_ticket_response(
  p_ticket_id BIGINT,
  p_response_by_user_id BIGINT,
  p_response_message_id BIGINT,
  p_response_type TEXT DEFAULT 'public', -- 'public', 'internal_note', 'system'
  p_is_first_response BOOLEAN DEFAULT FALSE,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_audit_id BIGINT;
BEGIN
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_response_by_user_id
  LIMIT 1;
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    response_message_id, response_type, is_first_response,
    metadata
  ) VALUES (
    p_ticket_id,
    CASE WHEN p_response_type = 'internal_note' THEN 'internal_note' ELSE 'reply' END,
    'response',
    CASE 
      WHEN p_response_type = 'internal_note' THEN 'Internal note added by ' || v_actor_name
      WHEN p_is_first_response THEN 'First response by ' || v_actor_name
      ELSE 'Response by ' || v_actor_name
    END,
    p_response_by_user_id,
    v_actor_name,
    v_actor_role,
    p_response_message_id,
    p_response_type,
    p_is_first_response,
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log group/service changes
CREATE OR REPLACE FUNCTION log_ticket_group_service_change(
  p_ticket_id BIGINT,
  p_changed_by_user_id BIGINT,
  p_change_type TEXT, -- 'group_change', 'service_change', 'section_change'
  p_old_group_id BIGINT DEFAULT NULL,
  p_new_group_id BIGINT DEFAULT NULL,
  p_old_service_type ticket_service_type[] DEFAULT NULL,
  p_new_service_type ticket_service_type[] DEFAULT NULL,
  p_old_ticket_section ticket_section[] DEFAULT NULL,
  p_new_ticket_section ticket_section[] DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_old_group_name TEXT;
  v_new_group_name TEXT;
  v_activity_category TEXT;
  v_activity_description TEXT;
  v_audit_id BIGINT;
BEGIN
  -- Determine activity category
  v_activity_category := CASE 
    WHEN p_change_type = 'group_change' THEN 'group_change'
    WHEN p_change_type = 'service_change' THEN 'service_change'
    ELSE 'service_change'
  END;
  
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_changed_by_user_id
  LIMIT 1;
  
  -- Get group names if provided
  IF p_old_group_id IS NOT NULL THEN
    SELECT group_name INTO v_old_group_name FROM ticket_groups WHERE id = p_old_group_id;
  END IF;
  
  IF p_new_group_id IS NOT NULL THEN
    SELECT group_name INTO v_new_group_name FROM ticket_groups WHERE id = p_new_group_id;
  END IF;
  
  -- Build activity description
  v_activity_description := COALESCE(p_reason, 
    CASE 
      WHEN p_change_type = 'group_change' THEN 
        'Group changed from ' || COALESCE(v_old_group_name, 'N/A') || ' to ' || COALESCE(v_new_group_name, 'N/A')
      WHEN p_change_type = 'service_change' THEN 
        'Service type changed'
      ELSE 
        'Service/Section changed'
    END
  );
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    old_group_id, new_group_id,
    old_service_type, new_service_type,
    old_ticket_section, new_ticket_section,
    changed_fields,
    metadata
  ) VALUES (
    p_ticket_id,
    p_change_type,
    v_activity_category,
    v_activity_description,
    p_changed_by_user_id,
    v_actor_name,
    v_actor_role,
    p_old_group_id,
    p_new_group_id,
    p_old_service_type,
    p_new_service_type,
    p_old_ticket_section,
    p_new_ticket_section,
    ARRAY[p_change_type],
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log status/priority changes
CREATE OR REPLACE FUNCTION log_ticket_status_priority_change(
  p_ticket_id BIGINT,
  p_changed_by_user_id BIGINT,
  p_change_type TEXT, -- 'status_change', 'priority_change'
  p_old_value TEXT,
  p_new_value TEXT,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_activity_category TEXT;
  v_activity_description TEXT;
  v_audit_id BIGINT;
BEGIN
  v_activity_category := p_change_type;
  
  -- Get actor information
  SELECT name, role_code INTO v_actor_name, v_actor_role
  FROM system_users su
  LEFT JOIN user_roles ur ON ur.user_id = su.id AND ur.is_active = TRUE
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE su.id = p_changed_by_user_id
  LIMIT 1;
  
  -- Build activity description
  v_activity_description := COALESCE(p_reason,
    CASE 
      WHEN p_change_type = 'status_change' THEN 
        'Status changed from ' || p_old_value || ' to ' || p_new_value || ' by ' || v_actor_name
      WHEN p_change_type = 'priority_change' THEN 
        'Priority changed from ' || p_old_value || ' to ' || p_new_value || ' by ' || v_actor_name
      ELSE 
        p_change_type || ' changed from ' || p_old_value || ' to ' || p_new_value
    END
  );
  
  -- Insert audit record
  INSERT INTO ticket_activity_audit (
    ticket_id, activity_type, activity_category, activity_description,
    actor_user_id, actor_name, actor_role,
    old_status, new_status,
    old_priority, new_priority,
    status_change_reason, priority_change_reason,
    changed_fields,
    metadata
  ) VALUES (
    p_ticket_id,
    p_change_type,
    v_activity_category,
    v_activity_description,
    p_changed_by_user_id,
    v_actor_name,
    v_actor_role,
    CASE WHEN p_change_type = 'status_change' THEN p_old_value ELSE NULL END,
    CASE WHEN p_change_type = 'status_change' THEN p_new_value ELSE NULL END,
    CASE WHEN p_change_type = 'priority_change' THEN p_old_value ELSE NULL END,
    CASE WHEN p_change_type = 'priority_change' THEN p_new_value ELSE NULL END,
    CASE WHEN p_change_type = 'status_change' THEN p_reason ELSE NULL END,
    CASE WHEN p_change_type = 'priority_change' THEN p_reason ELSE NULL END,
    ARRAY[p_change_type],
    p_metadata
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
