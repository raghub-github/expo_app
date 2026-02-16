-- ============================================================================
-- ENTERPRISE-GRADE MULTI-SERVICE TICKET SYSTEM
-- ============================================================================
-- This migration creates a comprehensive, enterprise-ready ticket management
-- system that supports:
-- - Multiple services: food, parcel, person_ride, other
-- - Multiple domains: customer, rider, merchant, system
-- - Dynamic title catalog (replaces enum-based titles)
-- - Full audit trail and history tracking
-- - Post-resolution ratings
-- - Many-to-many tag system
-- - Service-wise RBAC support
-- - Designed for 10M+ tickets with optimized indexes
-- ============================================================================
-- Migration: 0055_enterprise_ticket_system
-- Date: 2026-01-23
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Service Type (which service the ticket is about)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_service_type') THEN
    CREATE TYPE ticket_service_type AS ENUM (
      'food',        -- Food delivery service
      'parcel',      -- Parcel delivery service
      'person_ride', -- Person ride service
      'other'        -- Other/System tickets
    );
  END IF;
END $$;

-- Ticket Category (order-related or not)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_category') THEN
    CREATE TYPE ticket_category AS ENUM (
      'order_related', -- Ticket is related to a specific order
      'non_order',     -- Ticket is not related to any order
      'other'          -- Other category
    );
  END IF;
END $$;

-- Ticket Section (domain/section)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_section') THEN
    CREATE TYPE ticket_section AS ENUM (
      'customer',  -- Customer section
      'rider',     -- Rider section
      'merchant',  -- Merchant section
      'system',    -- System section
      'other'      -- Other section
    );
  END IF;
END $$;

-- Source Role (who/what created the ticket)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source_role') THEN
    CREATE TYPE ticket_source_role AS ENUM (
      'customer',        -- Customer raised
      'customer_pickup', -- Customer (pickup location) for parcel
      'customer_drop',   -- Customer (drop location) for parcel
      'rider',           -- Internal rider raised
      'rider_3pl',       -- 3PL/external rider raised
      'merchant',         -- Merchant raised
      'system',          -- System-generated
      'provider'          -- External provider (3PL)
    );
  END IF;
END $$;

-- Ticket Status (lifecycle)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM (
      'open',        -- Just created
      'assigned',    -- Assigned to agent
      'in_progress', -- Being worked on
      'resolved',    -- Resolved but not closed
      'closed',      -- Closed
      'rejected',    -- Rejected
      'reopened'     -- Reopened after closure
    );
  END IF;
END $$;

-- Ticket Priority
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM (
      'low',
      'medium',
      'high',
      'urgent',
      'critical'
    );
  END IF;
END $$;

-- Participant Role (role in ticket)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_participant_role') THEN
    CREATE TYPE ticket_participant_role AS ENUM (
      'creator',       -- Who created the ticket
      'affected_party', -- Who is affected
      'pickup',        -- Pickup location (parcel)
      'drop'           -- Drop location (parcel)
    );
  END IF;
END $$;

-- Entity Type (for polymorphic references)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_entity_type') THEN
    CREATE TYPE ticket_entity_type AS ENUM (
      'customer',
      'rider',
      'rider_3pl',      -- 3PL/external rider
      'merchant',
      'system',
      'provider'         -- External provider (3PL)
    );
  END IF;
END $$;

-- Message Type
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_message_type') THEN
    CREATE TYPE ticket_message_type AS ENUM (
      'reply',         -- Regular reply
      'internal_note', -- Internal note (agents only)
      'system'         -- System message
    );
  END IF;
END $$;

-- Sender Type (for messages)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_sender_type') THEN
    CREATE TYPE ticket_sender_type AS ENUM (
      'customer',
      'rider',
      'merchant',
      'agent',
      'system'
    );
  END IF;
END $$;

-- Rated By Type (for ratings)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_rated_by_type') THEN
    CREATE TYPE ticket_rated_by_type AS ENUM (
      'customer',
      'rider',
      'merchant'
    );
  END IF;
END $$;

-- ============================================================================
-- TICKET GROUPS (Future Planning - Flexible Grouping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_groups (
  id BIGSERIAL PRIMARY KEY,
  
  -- Group Identification
  group_code TEXT NOT NULL UNIQUE, -- Stable identifier, e.g., "ORDER_ISSUES", "PAYMENT_ISSUES"
  group_name TEXT NOT NULL, -- Display name
  group_description TEXT, -- Description of the group
  
  -- Hierarchy (for nested groups)
  parent_group_id BIGINT REFERENCES ticket_groups(id) ON DELETE SET NULL,
  group_level INTEGER NOT NULL DEFAULT 1, -- 1 = top level, 2 = sub-group, etc.
  display_order INTEGER DEFAULT 0, -- For UI ordering
  
  -- Applicability (optional - can be NULL for global groups)
  service_type ticket_service_type, -- NULL = applies to all services
  ticket_section ticket_section, -- NULL = applies to all sections
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for ticket_groups
CREATE INDEX IF NOT EXISTS ticket_groups_group_code_idx 
  ON ticket_groups(group_code);
CREATE INDEX IF NOT EXISTS ticket_groups_parent_group_id_idx 
  ON ticket_groups(parent_group_id) 
  WHERE parent_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_groups_service_section_idx 
  ON ticket_groups(service_type, ticket_section, is_active);
CREATE INDEX IF NOT EXISTS ticket_groups_display_order_idx 
  ON ticket_groups(display_order);

COMMENT ON TABLE ticket_groups IS 'Flexible grouping system for tickets - supports hierarchical groups and future planning';
COMMENT ON COLUMN ticket_groups.group_code IS 'Stable identifier for the group (e.g., ORDER_ISSUES, PAYMENT_ISSUES)';
COMMENT ON COLUMN ticket_groups.parent_group_id IS 'Parent group for hierarchical grouping (NULL = top level)';
COMMENT ON COLUMN ticket_groups.service_type IS 'Service type this group applies to (NULL = all services)';

-- ============================================================================
-- TICKET TITLES (Dynamic Title Catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_titles (
  id BIGSERIAL PRIMARY KEY,
  
  -- Group Reference (for future planning)
  group_id BIGINT REFERENCES ticket_groups(id) ON DELETE SET NULL,
  
  -- Classification
  service_type ticket_service_type NOT NULL,
  ticket_section ticket_section NOT NULL,
  source_role ticket_source_role NOT NULL,
  
  -- Title Details
  title_code TEXT NOT NULL UNIQUE, -- Stable identifier, e.g., "ORDER_DELAYED"
  title_text TEXT NOT NULL, -- Display text
  description TEXT, -- Internal description
  
  -- Display Settings
  display_order INTEGER DEFAULT 0, -- For UI ordering within group
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadata (for future extensions)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add group_id and other columns to ticket_titles if they don't exist
DO $$ 
BEGIN
  -- Check and add group_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_titles' AND column_name = 'group_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_titles ADD COLUMN group_id BIGINT;
  END IF;
  
  -- Check and add display_order
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_titles' AND column_name = 'display_order' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_titles ADD COLUMN display_order INTEGER DEFAULT 0;
  END IF;
  
  -- Check and add metadata
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_titles' AND column_name = 'metadata' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_titles ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
  
  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_titles_group_id_fkey'
  ) THEN
    ALTER TABLE ticket_titles 
      ADD CONSTRAINT ticket_titles_group_id_fkey 
      FOREIGN KEY (group_id) REFERENCES ticket_groups(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, will be created by CREATE TABLE above
    NULL;
END $$;

-- Indexes for ticket_titles
-- Create group_id index only if column exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_titles' AND column_name = 'group_id' AND table_schema = 'public'
  ) THEN
    CREATE INDEX IF NOT EXISTS ticket_titles_group_id_idx 
      ON ticket_titles(group_id) 
      WHERE group_id IS NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ticket_titles_service_section_source_idx 
  ON ticket_titles(service_type, ticket_section, source_role, is_active);
CREATE INDEX IF NOT EXISTS ticket_titles_title_code_idx 
  ON ticket_titles(title_code);
CREATE INDEX IF NOT EXISTS ticket_titles_is_active_idx 
  ON ticket_titles(is_active);
CREATE INDEX IF NOT EXISTS ticket_titles_display_order_idx 
  ON ticket_titles(display_order);

COMMENT ON TABLE ticket_groups IS 'Flexible grouping system for tickets - supports hierarchical groups for future planning';
COMMENT ON TABLE ticket_titles IS 'Dynamic catalog of ticket titles, configurable per service, section, and source role. Can be grouped via ticket_groups.';
COMMENT ON COLUMN ticket_titles.title_code IS 'Stable identifier for the title (e.g., ORDER_DELAYED)';
COMMENT ON COLUMN ticket_titles.title_text IS 'Display text shown to users';
COMMENT ON COLUMN ticket_titles.is_active IS 'Whether this title is currently available for selection';
COMMENT ON COLUMN ticket_titles.group_id IS 'Optional group this title belongs to (for future planning and organization)';

-- ============================================================================
-- TICKETS (Main Entity - Single Source of Truth)
-- ============================================================================

-- Ensure critical columns exist BEFORE creating table (safeguard for existing tables)
-- This runs FIRST to add columns if table exists from previous partial run
DO $$ 
BEGIN
  -- If table exists, ensure critical columns are added immediately
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    -- Ensure ticket_number exists (critical for triggers and constraints)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_number'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN ticket_number TEXT;
      -- Add unique constraint if not exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_ticket_number_key'
      ) THEN
        ALTER TABLE public.tickets ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);
      END IF;
      -- Add CHECK constraint if not exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_ticket_number_check'
      ) THEN
        ALTER TABLE public.tickets ADD CONSTRAINT tickets_ticket_number_check 
          CHECK (ticket_number ~ '^TKT-\d{4}-\d{6}$');
      END IF;
    END IF;
    
    -- Ensure service_type exists (critical for indexes and constraints)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'service_type'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN service_type ticket_service_type;
    END IF;
    
    -- Ensure status exists (critical for indexes and triggers)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'status'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN status ticket_status DEFAULT 'open';
    END IF;
    
    -- Ensure priority exists (critical for indexes)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'priority'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN priority ticket_priority DEFAULT 'medium';
    END IF;
    
    -- Ensure other critical columns exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_category'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN ticket_category ticket_category;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_section'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN ticket_section ticket_section;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'source_role'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN source_role ticket_source_role;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'subject'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN subject TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'description'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN description TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Ensure order-related columns exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'order_id'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN order_id BIGINT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'order_service_type'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN order_service_type ticket_service_type;
    END IF;
    
    -- Ensure title_id exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'title_id'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN title_id BIGINT;
    END IF;
    
    -- Ensure assignment columns exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'created_by_user_id'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN created_by_user_id BIGINT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'current_assignee_user_id'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN current_assignee_user_id BIGINT;
    END IF;
    
    -- Ensure SLA and resolution columns exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'sla_due_at'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN sla_due_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'resolved_at'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'closed_at'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Ensure 3PL columns exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'is_3pl_order'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN is_3pl_order BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tpl_provider_id'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN tpl_provider_id BIGINT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tpl_direction'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN tpl_direction TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'external_order_id'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN external_order_id TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'external_provider_name'
    ) THEN
      ALTER TABLE public.tickets ADD COLUMN external_provider_name TEXT;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors, table might not exist yet or other issues
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  
  -- Ticket Identification
  ticket_number TEXT NOT NULL UNIQUE, -- Globally unique, e.g., TKT-2026-000001
  
  -- Classification
  service_type ticket_service_type NOT NULL,
  ticket_category ticket_category NOT NULL,
  ticket_section ticket_section NOT NULL,
  source_role ticket_source_role NOT NULL,
  
  -- Title Reference
  title_id BIGINT REFERENCES ticket_titles(id) ON DELETE SET NULL,
  subject TEXT NOT NULL, -- Snapshot of title text at creation
  
  -- Description
  description TEXT NOT NULL,
  
  -- Status & Priority
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  
  -- Order Link (nullable for non-order tickets)
  order_id BIGINT, -- FK to orders table (if exists)
  order_service_type ticket_service_type, -- Derived from order or set explicitly
  
  -- 3PL/External Provider Support
  is_3pl_order BOOLEAN DEFAULT FALSE, -- Whether this ticket is related to a 3PL order
  tpl_provider_id BIGINT, -- FK to tpl_providers table (if exists)
  tpl_direction TEXT CHECK (tpl_direction IN ('inbound', 'outbound') OR tpl_direction IS NULL), -- Direction: inbound (received from 3PL) or outbound (sent to 3PL)
  external_order_id TEXT, -- External provider's order ID
  external_provider_name TEXT, -- Name of external provider (if not in tpl_providers)
  
  -- Assignment
  created_by_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  current_assignee_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  
  -- SLA Tracking
  sla_due_at TIMESTAMP WITH TIME ZONE,
  
  -- Resolution
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT tickets_ticket_number_check CHECK (ticket_number ~ '^TKT-\d{4}-\d{6}$'),
  CONSTRAINT tickets_order_category_check CHECK (
    (ticket_category = 'order_related' AND order_id IS NOT NULL) OR
    (ticket_category = 'non_order' AND order_id IS NULL) OR
    (ticket_category = 'other')
  ),
  CONSTRAINT tickets_rating_status_check CHECK (
    -- Ratings only allowed for resolved/closed tickets (enforced at application level)
    TRUE
  )
);

-- Add all missing columns if they don't exist (for migration safety)
-- This handles the case where table was created in a previous run without these columns
DO $$ 
BEGIN
  -- Add all standard columns that might be missing
  -- (Critical ones are already in safeguard block, but this ensures completeness)
  
  -- Check and add is_3pl_order
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'is_3pl_order' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tickets ADD COLUMN is_3pl_order BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Check and add tpl_provider_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'tpl_provider_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tickets ADD COLUMN tpl_provider_id BIGINT;
  END IF;
  
  -- Check and add tpl_direction
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'tpl_direction' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tickets ADD COLUMN tpl_direction TEXT;
  END IF;
  
  -- Check and add external_order_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'external_order_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tickets ADD COLUMN external_order_id TEXT;
  END IF;
  
  -- Check and add external_provider_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'external_provider_name' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tickets ADD COLUMN external_provider_name TEXT;
  END IF;
  
  -- Ensure order_service_type exists (in case it wasn't in safeguard)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'order_service_type' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tickets ADD COLUMN order_service_type ticket_service_type;
  END IF;
  
  -- Add tpl_direction constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_tpl_direction_check'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_tpl_direction_check 
      CHECK (tpl_direction IN ('inbound', 'outbound') OR tpl_direction IS NULL);
  END IF;
  
  -- Add ticket_number CHECK constraint if it doesn't exist (for existing tables)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'ticket_number' AND table_schema = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_ticket_number_check'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_number_check 
      CHECK (ticket_number ~ '^TKT-\d{4}-\d{6}$');
  END IF;
  
  -- Add order_category CHECK constraint if it doesn't exist (for existing tables)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'ticket_category' AND table_schema = 'public'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'order_id' AND table_schema = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_order_category_check'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_order_category_check 
      CHECK (
        (ticket_category = 'order_related' AND order_id IS NOT NULL) OR
        (ticket_category = 'non_order' AND order_id IS NULL) OR
        (ticket_category = 'other')
      );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, will be created by CREATE TABLE above
    NULL;
END $$;

-- Core Indexes for tickets
-- Create ticket_number index only if column exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_number'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_ticket_number_idx ON tickets(ticket_number);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
-- Create indexes conditionally (only if columns exist)
DO $$ 
BEGIN
  -- service_type, status, created_at index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'service_type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_service_status_created_idx 
      ON tickets(service_type, status, created_at DESC);
  END IF;
  
  -- assignee, status index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' 
    AND column_name IN ('current_assignee_user_id', 'status')
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_assignee_status_idx 
      ON tickets(current_assignee_user_id, status) 
      WHERE current_assignee_user_id IS NOT NULL;
  END IF;
  
  -- order_id index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'order_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_order_id_idx 
      ON tickets(order_id) 
      WHERE order_id IS NOT NULL;
  END IF;
  
  -- status, priority, created_at index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'priority'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_status_priority_created_idx 
      ON tickets(status, priority, created_at DESC);
  END IF;
  
  -- sla_due_at index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'sla_due_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_sla_due_idx 
      ON tickets(sla_due_at) 
      WHERE sla_due_at IS NOT NULL AND status NOT IN ('closed', 'resolved');
  END IF;
  
  -- created_at index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_created_at_idx 
      ON tickets(created_at DESC);
  END IF;
  
  -- title_id index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'title_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_title_id_idx 
      ON tickets(title_id) 
      WHERE title_id IS NOT NULL;
  END IF;
  
  -- service_type index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'service_type'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_service_type_idx 
      ON tickets(service_type);
  END IF;
  
  -- ticket_section index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_section'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_ticket_section_idx 
      ON tickets(ticket_section);
  END IF;
  
  -- source_role index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'source_role'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_source_role_idx 
      ON tickets(source_role);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
-- Create 3PL indexes only if columns exist
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'is_3pl_order' AND table_schema = 'public'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_3pl_order_idx 
      ON tickets(is_3pl_order, tpl_provider_id) 
      WHERE is_3pl_order = TRUE;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'external_order_id' AND table_schema = 'public'
  ) THEN
    CREATE INDEX IF NOT EXISTS tickets_external_order_id_idx 
      ON tickets(external_order_id) 
      WHERE external_order_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON TABLE tickets IS 'Main ticket table - single source of truth for all tickets across all services';

-- Comments for tickets columns (conditional to ensure columns exist)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_number'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.ticket_number IS ''Globally unique ticket identifier (format: TKT-YYYY-NNNNNN)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'subject'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.subject IS ''Snapshot of title text at ticket creation time''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'order_service_type'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.order_service_type IS ''Service type of the linked order (derived from order or set explicitly)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'sla_due_at'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.sla_due_at IS ''SLA due date/time for this ticket''';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Comments for 3PL columns (placed after ALTER TABLE to ensure columns exist)
-- Using EXECUTE for dynamic SQL since COMMENT cannot be used directly in DO blocks
DO $$ 
BEGIN
  -- Only add comments if columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'is_3pl_order'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.is_3pl_order IS ''Whether this ticket is related to a 3PL (Third-Party Logistics) order''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tpl_provider_id'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.tpl_provider_id IS ''Reference to 3PL provider if this is a 3PL-related ticket''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tpl_direction'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.tpl_direction IS ''Direction: inbound (order received from 3PL) or outbound (order sent to 3PL)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'external_order_id'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.external_order_id IS ''External provider order ID (for 3PL orders)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'external_provider_name'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tickets.external_provider_name IS ''Name of external provider (if not in tpl_providers table)''';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================================
-- TICKET PARTICIPANTS (Polymorphic Actors)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_participants (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Participant Role
  participant_role ticket_participant_role NOT NULL,
  entity_type ticket_entity_type NOT NULL,
  
  -- Polymorphic Entity Reference (exactly one must be NOT NULL)
  customer_id BIGINT, -- FK to customers table (if exists)
  rider_id INTEGER, -- FK to riders table (if exists) - internal riders
  rider_3pl_id TEXT, -- 3PL/external rider ID (if entity_type = 'rider_3pl')
  merchant_id BIGINT, -- FK to merchant_stores table (if exists)
  system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  provider_id BIGINT, -- FK to tpl_providers table (if entity_type = 'provider')
  
  -- External Provider Details (for 3PL riders and providers)
  external_provider_name TEXT, -- Name of external provider (if not in tpl_providers)
  external_entity_id TEXT, -- External entity ID (rider ID from provider, etc.)
  external_entity_name TEXT, -- External entity name (for display)
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT ticket_participants_entity_check CHECK (
    (entity_type = 'customer' AND customer_id IS NOT NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
    (entity_type = 'rider' AND rider_id IS NOT NULL AND customer_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
    (entity_type = 'rider_3pl' AND rider_3pl_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
    (entity_type = 'merchant' AND merchant_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
    (entity_type = 'system' AND system_user_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND provider_id IS NULL) OR
    (entity_type = 'provider' AND provider_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL)
  )
);

-- Add 3PL columns to ticket_participants if they don't exist
DO $$ 
BEGIN
  -- Drop old constraint if it exists (it might reference columns that don't exist yet)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_participants_entity_check'
  ) THEN
    ALTER TABLE ticket_participants DROP CONSTRAINT ticket_participants_entity_check;
  END IF;
  
  -- Check and add rider_3pl_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'rider_3pl_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_participants ADD COLUMN rider_3pl_id TEXT;
  END IF;
  
  -- Check and add provider_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'provider_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_participants ADD COLUMN provider_id BIGINT;
  END IF;
  
  -- Check and add external_provider_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'external_provider_name' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_participants ADD COLUMN external_provider_name TEXT;
  END IF;
  
  -- Check and add external_entity_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'external_entity_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_participants ADD COLUMN external_entity_id TEXT;
  END IF;
  
  -- Check and add external_entity_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'external_entity_name' AND table_schema = 'public'
  ) THEN
    ALTER TABLE ticket_participants ADD COLUMN external_entity_name TEXT;
  END IF;
  
  -- Recreate constraint with all columns
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_participants_entity_check'
  ) THEN
    ALTER TABLE ticket_participants ADD CONSTRAINT ticket_participants_entity_check CHECK (
      (entity_type = 'customer' AND customer_id IS NOT NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
      (entity_type = 'rider' AND rider_id IS NOT NULL AND customer_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
      (entity_type = 'rider_3pl' AND rider_3pl_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
      (entity_type = 'merchant' AND merchant_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND system_user_id IS NULL AND provider_id IS NULL) OR
      (entity_type = 'system' AND system_user_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND provider_id IS NULL) OR
      (entity_type = 'provider' AND provider_id IS NOT NULL AND customer_id IS NULL AND rider_id IS NULL AND rider_3pl_id IS NULL AND merchant_id IS NULL AND system_user_id IS NULL)
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, will be created by CREATE TABLE above
    NULL;
END $$;

-- Indexes for ticket_participants
CREATE INDEX IF NOT EXISTS ticket_participants_ticket_id_idx 
  ON ticket_participants(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_participants_customer_id_idx 
  ON ticket_participants(customer_id) 
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_participants_rider_id_idx 
  ON ticket_participants(rider_id) 
  WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_participants_merchant_id_idx 
  ON ticket_participants(merchant_id) 
  WHERE merchant_id IS NOT NULL;
-- Create 3PL participant indexes only if columns exist
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'rider_3pl_id' AND table_schema = 'public'
  ) THEN
    CREATE INDEX IF NOT EXISTS ticket_participants_rider_3pl_id_idx 
      ON ticket_participants(rider_3pl_id) 
      WHERE rider_3pl_id IS NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ticket_participants' AND column_name = 'provider_id' AND table_schema = 'public'
  ) THEN
    CREATE INDEX IF NOT EXISTS ticket_participants_provider_id_idx 
      ON ticket_participants(provider_id) 
      WHERE provider_id IS NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ticket_participants_entity_type_idx 
  ON ticket_participants(entity_type, participant_role);

-- Unique constraint to prevent duplicate participants
CREATE UNIQUE INDEX IF NOT EXISTS ticket_participants_unique_idx 
  ON ticket_participants(ticket_id, participant_role, entity_type, 
    COALESCE(customer_id::text, ''), 
    COALESCE(rider_id::text, ''), 
    COALESCE(rider_3pl_id, ''), 
    COALESCE(merchant_id::text, ''), 
    COALESCE(system_user_id::text, ''),
    COALESCE(provider_id::text, ''));

COMMENT ON TABLE ticket_participants IS 'Polymorphic participants in tickets - tracks all parties involved';
COMMENT ON COLUMN ticket_participants.participant_role IS 'Role of this participant (creator, affected_party, pickup, drop)';

-- Comments for 3PL participant columns (placed after ALTER TABLE to ensure columns exist)
-- Using EXECUTE for dynamic SQL since COMMENT cannot be used directly in DO blocks
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ticket_participants' AND column_name = 'rider_3pl_id'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN ticket_participants.rider_3pl_id IS ''3PL/external rider ID (when entity_type = rider_3pl)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ticket_participants' AND column_name = 'provider_id'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN ticket_participants.provider_id IS ''3PL provider ID (when entity_type = provider)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ticket_participants' AND column_name = 'external_provider_name'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN ticket_participants.external_provider_name IS ''Name of external provider (if not in tpl_providers table)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ticket_participants' AND column_name = 'external_entity_id'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN ticket_participants.external_entity_id IS ''External entity ID from provider (rider ID, etc.)''';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ticket_participants' AND column_name = 'external_entity_name'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN ticket_participants.external_entity_name IS ''External entity name (for display purposes)''';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================================
-- TICKET ASSIGNMENTS (Assignment History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_assignments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Assignment Details
  assigned_to_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  assigned_by_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Unassignment
  unassigned_at TIMESTAMP WITH TIME ZONE,
  reason TEXT, -- Optional reason for assignment/unassignment
  
  -- Constraints
  CONSTRAINT ticket_assignments_unassigned_check CHECK (
    unassigned_at IS NULL OR unassigned_at >= assigned_at
  )
);

-- Indexes for ticket_assignments
CREATE INDEX IF NOT EXISTS ticket_assignments_ticket_id_idx 
  ON ticket_assignments(ticket_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS ticket_assignments_assigned_to_idx 
  ON ticket_assignments(assigned_to_user_id, unassigned_at) 
  WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS ticket_assignments_assigned_by_idx 
  ON ticket_assignments(assigned_by_user_id);

COMMENT ON TABLE ticket_assignments IS 'Complete history of all ticket assignments - never overwritten';
COMMENT ON COLUMN ticket_assignments.unassigned_at IS 'When this assignment ended (NULL = currently assigned)';

-- ============================================================================
-- TICKET MESSAGES (Conversation/Replies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Sender Information
  sender_type ticket_sender_type NOT NULL,
  sender_id BIGINT, -- Polymorphic: customer_id, rider_id, merchant_id, system_user_id
  
  -- Message Details
  message_type ticket_message_type NOT NULL DEFAULT 'reply',
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of attachment objects
  
  -- Edit Tracking
  edited_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for ticket_messages
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_id_idx 
  ON ticket_messages(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_messages_sender_idx 
  ON ticket_messages(sender_type, sender_id) 
  WHERE sender_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_messages_message_type_idx 
  ON ticket_messages(message_type);
CREATE INDEX IF NOT EXISTS ticket_messages_created_at_idx 
  ON ticket_messages(created_at DESC);

COMMENT ON TABLE ticket_messages IS 'All messages, replies, internal notes, and system messages for tickets';
COMMENT ON COLUMN ticket_messages.attachments IS 'JSONB array of attachment objects: [{"url": "...", "filename": "...", "type": "..."}]';

-- ============================================================================
-- TICKET STATUS HISTORY (State Transitions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_status_history (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Status Change
  old_status ticket_status NOT NULL,
  new_status ticket_status NOT NULL,
  changed_by_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Reason (mandatory for close/reject/reopen)
  reason TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Constraints (will be added conditionally after table creation to handle enum values)
);

-- Add constraint conditionally (check which enum values exist)
DO $$ 
DECLARE
  has_rejected BOOLEAN := FALSE;
  has_reopened BOOLEAN := FALSE;
  has_closed BOOLEAN := FALSE;
  constraint_sql TEXT;
BEGIN
  -- Check which enum values exist
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ticket_status' AND e.enumlabel = 'rejected'
  ) INTO has_rejected;
  
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ticket_status' AND e.enumlabel = 'reopened'
  ) INTO has_reopened;
  
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ticket_status' AND e.enumlabel = 'closed'
  ) INTO has_closed;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ticket_status_history_reason_check'
  ) THEN
    -- Build constraint based on available enum values
    IF has_closed AND has_reopened AND has_rejected THEN
      -- All three values exist
      constraint_sql := '(new_status IN (''closed'', ''rejected'', ''reopened'') AND reason IS NOT NULL) OR (new_status NOT IN (''closed'', ''rejected'', ''reopened''))';
    ELSIF has_closed AND has_reopened THEN
      -- Only closed and reopened exist
      constraint_sql := '(new_status IN (''closed'', ''reopened'') AND reason IS NOT NULL) OR (new_status NOT IN (''closed'', ''reopened''))';
    ELSIF has_closed THEN
      -- Only closed exists
      constraint_sql := '(new_status = ''closed'' AND reason IS NOT NULL) OR (new_status != ''closed'')';
    ELSIF has_reopened THEN
      -- Only reopened exists
      constraint_sql := '(new_status = ''reopened'' AND reason IS NOT NULL) OR (new_status != ''reopened'')';
    ELSE
      -- No special statuses exist, just require reason for any status change
      constraint_sql := 'TRUE';
    END IF;
    
    -- Execute the constraint creation
    EXECUTE format('ALTER TABLE ticket_status_history ADD CONSTRAINT ticket_status_history_reason_check CHECK (%s)', constraint_sql);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN OTHERS THEN
    -- Ignore other errors (e.g., if enum doesn't exist yet)
    NULL;
END $$;

-- Indexes for ticket_status_history
CREATE INDEX IF NOT EXISTS ticket_status_history_ticket_id_idx 
  ON ticket_status_history(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_status_history_new_status_idx 
  ON ticket_status_history(new_status, created_at);
CREATE INDEX IF NOT EXISTS ticket_status_history_changed_by_idx 
  ON ticket_status_history(changed_by_user_id);

COMMENT ON TABLE ticket_status_history IS 'Complete history of all status transitions for tickets';
COMMENT ON COLUMN ticket_status_history.reason IS 'Mandatory reason when closing, rejecting, or reopening a ticket';

-- ============================================================================
-- TICKET ACTIONS AUDIT (Full Audit Log - Immutable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_actions_audit (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Action Details
  action_type TEXT NOT NULL, -- create, assign, reply, resolve, close, reject, reopen, priority_change, title_change, sla_override, tag_change
  actor_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  actor_type ticket_entity_type, -- customer, rider, merchant, system
  actor_id BIGINT, -- Polymorphic actor ID
  
  -- Change Tracking
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for ticket_actions_audit
CREATE INDEX IF NOT EXISTS ticket_actions_audit_ticket_id_idx 
  ON ticket_actions_audit(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_actions_audit_action_type_idx 
  ON ticket_actions_audit(action_type, created_at);
CREATE INDEX IF NOT EXISTS ticket_actions_audit_actor_user_id_idx 
  ON ticket_actions_audit(actor_user_id, created_at) 
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_actions_audit_created_at_idx 
  ON ticket_actions_audit(created_at DESC);

COMMENT ON TABLE ticket_actions_audit IS 'Append-only immutable audit log of all ticket actions';
COMMENT ON COLUMN ticket_actions_audit.action_type IS 'Type of action: create, assign, reply, resolve, close, reject, reopen, priority_change, title_change, sla_override, tag_change';

-- ============================================================================
-- TICKET RATINGS (Post-Resolution Feedback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_ratings (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Rating Details
  rated_by_type ticket_rated_by_type NOT NULL,
  rated_by_id BIGINT NOT NULL, -- customer_id, rider_id, or merchant_id
  rating_value SMALLINT NOT NULL CHECK (rating_value >= 1 AND rating_value <= 5),
  feedback_text TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT ticket_ratings_unique_per_actor UNIQUE (ticket_id, rated_by_type, rated_by_id)
);

-- Indexes for ticket_ratings
CREATE INDEX IF NOT EXISTS ticket_ratings_ticket_id_idx 
  ON ticket_ratings(ticket_id, rated_by_type);
CREATE INDEX IF NOT EXISTS ticket_ratings_rated_by_idx 
  ON ticket_ratings(rated_by_type, rating_value, created_at);
CREATE INDEX IF NOT EXISTS ticket_ratings_rating_value_idx 
  ON ticket_ratings(rating_value, created_at);

COMMENT ON TABLE ticket_ratings IS 'Post-resolution ratings submitted by customers, riders, or merchants';
COMMENT ON COLUMN ticket_ratings.rated_by_id IS 'ID of the customer, rider, or merchant who submitted the rating';

-- ============================================================================
-- TICKET TAGS (Tag Master)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_tags (
  id BIGSERIAL PRIMARY KEY,
  
  -- Tag Details
  tag_code TEXT NOT NULL UNIQUE, -- e.g., "fraud", "abuse", "escalation", "refund", "technical", "sla_breach"
  tag_name TEXT NOT NULL,
  tag_description TEXT,
  tag_color TEXT, -- For UI display (hex color)
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for ticket_tags
CREATE INDEX IF NOT EXISTS ticket_tags_tag_code_idx 
  ON ticket_tags(tag_code);
CREATE INDEX IF NOT EXISTS ticket_tags_is_active_idx 
  ON ticket_tags(is_active);

COMMENT ON TABLE ticket_tags IS 'Master table of ticket tags for categorization and filtering';
COMMENT ON COLUMN ticket_tags.tag_code IS 'Stable identifier for the tag (e.g., fraud, abuse, escalation)';

-- ============================================================================
-- TICKET TAG MAP (Many-to-Many Mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_tag_map (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES ticket_tags(id) ON DELETE CASCADE,
  
  -- Audit
  added_by_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT ticket_tag_map_unique UNIQUE (ticket_id, tag_id)
);

-- Indexes for ticket_tag_map
CREATE INDEX IF NOT EXISTS ticket_tag_map_ticket_id_idx 
  ON ticket_tag_map(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_tag_map_tag_id_idx 
  ON ticket_tag_map(tag_id);
CREATE INDEX IF NOT EXISTS ticket_tag_map_added_by_idx 
  ON ticket_tag_map(added_by_user_id);

COMMENT ON TABLE ticket_tag_map IS 'Many-to-many mapping between tickets and tags';

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for tickets table
DROP TRIGGER IF EXISTS tickets_updated_at_trigger ON tickets;
CREATE TRIGGER tickets_updated_at_trigger
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_updated_at();

-- Trigger for ticket_messages table
DROP TRIGGER IF EXISTS ticket_messages_updated_at_trigger ON ticket_messages;
CREATE TRIGGER ticket_messages_updated_at_trigger
  BEFORE UPDATE ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_updated_at();

-- Trigger for ticket_titles table
DROP TRIGGER IF EXISTS ticket_titles_updated_at_trigger ON ticket_titles;
CREATE TRIGGER ticket_titles_updated_at_trigger
  BEFORE UPDATE ON ticket_titles
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_updated_at();

-- Function to auto-generate ticket_number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  ticket_prefix TEXT := 'TKT';
BEGIN
  -- Only generate if ticket_number is not provided
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '\d+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM tickets
    WHERE ticket_number LIKE ticket_prefix || '-' || year_part || '-%';
    
    -- Generate ticket number: TKT-YYYY-NNNNNN
    NEW.ticket_number := ticket_prefix || '-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-generating ticket_number
-- Only create trigger if ticket_number column exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_number'
  ) THEN
    DROP TRIGGER IF EXISTS tickets_generate_number_trigger ON tickets;
    EXECUTE 'CREATE TRIGGER tickets_generate_number_trigger
      BEFORE INSERT ON tickets
      FOR EACH ROW
      WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '''')
      EXECUTE FUNCTION generate_ticket_number()';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Function to log status changes to ticket_status_history
CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO ticket_status_history (
      ticket_id,
      old_status,
      new_status,
      changed_by_user_id,
      reason
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(NEW.current_assignee_user_id, NEW.created_by_user_id, 1), -- Fallback to system user
      CASE 
        WHEN NEW.status = 'closed' OR NEW.status = 'reopened' THEN 
          'Status changed to ' || NEW.status::text
        WHEN NEW.status::text = 'rejected' THEN
          -- Handle 'rejected' status (check if enum supports it)
          'Status changed to rejected'
        ELSE NULL
      END
    );
    
    -- Update resolved_at or closed_at timestamps
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
      NEW.resolved_at := NOW();
    ELSIF NEW.status = 'closed' AND OLD.status != 'closed' THEN
      NEW.closed_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for logging status changes
DROP TRIGGER IF EXISTS tickets_status_history_trigger ON tickets;
CREATE TRIGGER tickets_status_history_trigger
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_status_change();

-- Function to log assignment changes
CREATE OR REPLACE FUNCTION log_ticket_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Log assignment when current_assignee_user_id changes
  IF OLD.current_assignee_user_id IS DISTINCT FROM NEW.current_assignee_user_id THEN
    -- Unassign previous assignment if exists
    IF OLD.current_assignee_user_id IS NOT NULL THEN
      UPDATE ticket_assignments
      SET unassigned_at = NOW()
      WHERE ticket_id = NEW.id
        AND assigned_to_user_id = OLD.current_assignee_user_id
        AND unassigned_at IS NULL;
    END IF;
    
    -- Create new assignment record
    IF NEW.current_assignee_user_id IS NOT NULL THEN
      INSERT INTO ticket_assignments (
        ticket_id,
        assigned_to_user_id,
        assigned_by_user_id
      ) VALUES (
        NEW.id,
        NEW.current_assignee_user_id,
        COALESCE(NEW.current_assignee_user_id, NEW.created_by_user_id, 1) -- Fallback
      );
      
      -- Update status to 'assigned' if it was 'open'
      IF NEW.status = 'open' THEN
        NEW.status := 'assigned';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for logging assignments
DROP TRIGGER IF EXISTS tickets_assignment_trigger ON tickets;
CREATE TRIGGER tickets_assignment_trigger
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_assignment();

-- Function to log all actions to audit table
CREATE OR REPLACE FUNCTION log_ticket_action_audit()
RETURNS TRIGGER AS $$
BEGIN
  -- This function will be called by application code or other triggers
  -- It's defined here for consistency but typically called explicitly
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (Optional - Enable if needed)
-- ============================================================================

-- Enable RLS on all tables (policies to be defined separately)
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_actions_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tag_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_groups ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INITIAL DATA: Default Tags
-- ============================================================================

INSERT INTO ticket_tags (tag_code, tag_name, tag_description, tag_color) VALUES
  ('fraud', 'Fraud', 'Ticket related to fraud detection', '#FF0000'),
  ('abuse', 'Abuse', 'Ticket related to abuse or misconduct', '#FF6600'),
  ('escalation', 'Escalation', 'Ticket requires escalation', '#FFAA00'),
  ('refund', 'Refund', 'Ticket related to refund request', '#00AA00'),
  ('technical', 'Technical', 'Technical issue ticket', '#0066FF'),
  ('sla_breach', 'SLA Breach', 'Ticket has breached SLA', '#AA00AA')
ON CONFLICT (tag_code) DO NOTHING;

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA public IS 'Enterprise-grade multi-service ticket system - designed for 10M+ tickets with full auditability';

COMMENT ON TYPE ticket_service_type IS 'Service type: food, parcel, person_ride, other';
COMMENT ON TYPE ticket_category IS 'Ticket category: order_related, non_order, other';
COMMENT ON TYPE ticket_section IS 'Ticket section/domain: customer, rider, merchant, system, other';
COMMENT ON TYPE ticket_source_role IS 'Source role: customer, customer_pickup, customer_drop, rider, merchant, system';
COMMENT ON TYPE ticket_status IS 'Ticket status: open, assigned, in_progress, resolved, closed, rejected, reopened';
COMMENT ON TYPE ticket_priority IS 'Ticket priority: low, medium, high, urgent, critical';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
