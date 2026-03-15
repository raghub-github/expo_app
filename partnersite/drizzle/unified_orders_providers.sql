-- ============================================================================
-- UNIFIED ORDERS PROVIDER INTEGRATION
-- Production-Grade Provider Integration System
-- Supports external providers (Swiggy, Zomato, Rapido) and 3PL providers
-- Migration: unified_orders_providers
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Provider Agnostic: Supports multiple external providers
-- - Conflict Tracking: Tracks conflicts between our system and providers
-- - Sync Logging: Complete sync attempt logs
-- - Status Sync: Tracks provider status vs our status
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source_type') THEN
    CREATE TYPE order_source_type AS ENUM (
      'internal',
      'swiggy',
      'zomato',
      'rapido',
      'ondc',
      'shiprocket',
      'other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_type') THEN
    CREATE TYPE order_status_type AS ENUM (
      'assigned',
      'accepted',
      'reached_store',
      'picked_up',
      'in_transit',
      'delivered',
      'cancelled',
      'failed'
    );
  END IF;
END $$;

-- ============================================================================
-- ORDER PROVIDERS (Provider Master Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_providers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- 'swiggy', 'zomato', 'rapido', etc.
  name TEXT NOT NULL, -- 'Swiggy', 'Zomato', 'Rapido', etc.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for order_providers
CREATE INDEX IF NOT EXISTS order_providers_code_idx ON public.order_providers(code);
CREATE INDEX IF NOT EXISTS order_providers_is_active_idx ON public.order_providers(is_active) WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE public.order_providers IS 'Master table for external order providers. Tracks provider code, name, and active status.';
COMMENT ON COLUMN public.order_providers.code IS 'Provider code: swiggy, zomato, rapido, etc. (unique).';
COMMENT ON COLUMN public.order_providers.name IS 'Provider display name: Swiggy, Zomato, Rapido, etc.';
COMMENT ON COLUMN public.order_providers.is_active IS 'Whether provider is currently active.';

-- ============================================================================
-- ORDER PROVIDER MAPPING (Mapping to External Providers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_provider_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- PROVIDER ORDER INFORMATION
  -- ==========================================================================
  provider_order_id TEXT NOT NULL, -- Provider's order ID
  provider_reference TEXT, -- Provider's reference number
  
  -- ==========================================================================
  -- PROVIDER STATUS
  -- ==========================================================================
  provider_status TEXT, -- Provider's status (may differ from ours)
  provider_status_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- SYNC INFORMATION
  -- ==========================================================================
  synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT, -- 'synced', 'pending', 'failed', 'conflict'
  sync_error TEXT,
  
  -- ==========================================================================
  -- PROVIDER FINANCIALS
  -- ==========================================================================
  provider_fare NUMERIC(12, 2), -- Provider's fare amount
  provider_commission NUMERIC(12, 2), -- Provider's commission
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  provider_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  UNIQUE(order_id, provider_id) -- One mapping per provider per order
);

-- Ensure columns exist and add foreign key constraints
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_order_id column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_order_id'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_order_id TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add provider_reference column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_reference'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_reference TEXT;
  END IF;
  
  -- Add provider_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_status'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_status TEXT;
  END IF;
  
  -- Add provider_status_updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_status_updated_at'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_status_updated_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add synced_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'synced_at'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN synced_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add sync_status column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'sync_status'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN sync_status TEXT;
  END IF;
  
  -- Add sync_error column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'sync_error'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN sync_error TEXT;
  END IF;
  
  -- Add provider_fare column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_fare'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_fare NUMERIC(12, 2);
  END IF;
  
  -- Add provider_commission column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_commission'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_commission NUMERIC(12, 2);
  END IF;
  
  -- Add provider_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'provider_metadata'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN provider_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_provider_mapping' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.order_provider_mapping 
      ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_provider_mapping' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_provider_mapping' 
          AND constraint_name = 'order_provider_mapping_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_provider_mapping 
          ADD CONSTRAINT order_provider_mapping_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_providers table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_provider_mapping' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_provider_mapping' 
          AND constraint_name = 'order_provider_mapping_provider_id_fkey'
      ) THEN
        ALTER TABLE public.order_provider_mapping 
          ADD CONSTRAINT order_provider_mapping_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_provider_mapping
CREATE INDEX IF NOT EXISTS order_provider_mapping_order_id_idx ON public.order_provider_mapping(order_id);
CREATE INDEX IF NOT EXISTS order_provider_mapping_provider_id_idx ON public.order_provider_mapping(provider_id);
CREATE INDEX IF NOT EXISTS order_provider_mapping_provider_order_id_idx ON public.order_provider_mapping(provider_order_id);
CREATE INDEX IF NOT EXISTS order_provider_mapping_sync_status_idx ON public.order_provider_mapping(sync_status) WHERE sync_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_provider_mapping_created_at_idx ON public.order_provider_mapping(created_at);

-- Comments
COMMENT ON TABLE public.order_provider_mapping IS 'Mapping between our orders and external provider orders. Tracks provider order ID, status, sync status, and financials.';
COMMENT ON COLUMN public.order_provider_mapping.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_provider_mapping.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.order_provider_mapping.provider_order_id IS 'Provider''s order ID (required).';
COMMENT ON COLUMN public.order_provider_mapping.provider_reference IS 'Provider''s reference number (if applicable).';
COMMENT ON COLUMN public.order_provider_mapping.provider_status IS 'Provider''s status (may differ from our status).';
COMMENT ON COLUMN public.order_provider_mapping.provider_status_updated_at IS 'When provider status was last updated.';
COMMENT ON COLUMN public.order_provider_mapping.sync_status IS 'Sync status: synced, pending, failed, conflict.';
COMMENT ON COLUMN public.order_provider_mapping.sync_error IS 'Sync error message (if sync failed).';
COMMENT ON COLUMN public.order_provider_mapping.provider_fare IS 'Provider''s fare amount (may differ from ours).';
COMMENT ON COLUMN public.order_provider_mapping.provider_commission IS 'Provider''s commission (may differ from ours).';

-- ============================================================================
-- ORDER CONFLICTS (Conflicts with Providers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_conflicts (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- CONFLICT DETAILS
  -- ==========================================================================
  provider_type order_source_type NOT NULL, -- 'swiggy', 'zomato', 'rapido', etc.
  conflict_type TEXT NOT NULL, -- 'status_mismatch', 'fare_mismatch', 'rider_mismatch', 'payment_mismatch', 'item_mismatch'
  our_value JSONB NOT NULL, -- Our value
  provider_value JSONB NOT NULL, -- Provider's value
  
  -- ==========================================================================
  -- RESOLUTION
  -- ==========================================================================
  resolution_strategy TEXT, -- 'manual_review', 'ours_wins', 'theirs_wins', 'merge'
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Conflicts are immutable - never updated (only resolved flag changes)
);

-- Ensure columns exist and add foreign key constraints for order_conflicts
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_type column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'provider_type'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN provider_type order_source_type NOT NULL DEFAULT 'internal';
  END IF;
  
  -- Add conflict_type column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'conflict_type'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN conflict_type TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add our_value column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'our_value'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN our_value JSONB NOT NULL DEFAULT '{}';
  END IF;
  
  -- Add provider_value column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'provider_value'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN provider_value JSONB NOT NULL DEFAULT '{}';
  END IF;
  
  -- Add resolution_strategy column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'resolution_strategy'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN resolution_strategy TEXT;
  END IF;
  
  -- Add resolved column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'resolved'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN resolved BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add resolved_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'resolved_by'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN resolved_by INTEGER;
  END IF;
  
  -- Add resolved_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'resolved_at'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add resolution_notes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'resolution_notes'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN resolution_notes TEXT;
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_conflicts' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.order_conflicts 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_conflicts' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_conflicts' 
          AND constraint_name = 'order_conflicts_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_conflicts 
          ADD CONSTRAINT order_conflicts_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_conflicts
CREATE INDEX IF NOT EXISTS order_conflicts_order_id_idx ON public.order_conflicts(order_id);
CREATE INDEX IF NOT EXISTS order_conflicts_provider_type_idx ON public.order_conflicts(provider_type);
CREATE INDEX IF NOT EXISTS order_conflicts_conflict_type_idx ON public.order_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS order_conflicts_resolved_idx ON public.order_conflicts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS order_conflicts_created_at_idx ON public.order_conflicts(created_at);

-- Comments
COMMENT ON TABLE public.order_conflicts IS 'Conflicts between our system and external providers. Tracks conflict type, our value vs provider value, and resolution.';
COMMENT ON COLUMN public.order_conflicts.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_conflicts.provider_type IS 'Provider type: swiggy, zomato, rapido, etc.';
COMMENT ON COLUMN public.order_conflicts.conflict_type IS 'Type of conflict: status_mismatch, fare_mismatch, rider_mismatch, payment_mismatch, item_mismatch.';
COMMENT ON COLUMN public.order_conflicts.our_value IS 'Our value (stored as JSONB for flexibility).';
COMMENT ON COLUMN public.order_conflicts.provider_value IS 'Provider''s value (stored as JSONB for flexibility).';
COMMENT ON COLUMN public.order_conflicts.resolution_strategy IS 'Resolution strategy: manual_review, ours_wins, theirs_wins, merge.';
COMMENT ON COLUMN public.order_conflicts.resolved IS 'Whether conflict has been resolved.';
COMMENT ON COLUMN public.order_conflicts.resolved_by IS 'ID of admin who resolved the conflict.';
COMMENT ON COLUMN public.order_conflicts.resolution_notes IS 'Notes about resolution.';

-- ============================================================================
-- ORDER SYNC LOGS (Sync Attempt Logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- SYNC DETAILS
  -- ==========================================================================
  provider_type order_source_type NOT NULL, -- 'swiggy', 'zomato', 'rapido', etc.
  sync_direction TEXT NOT NULL, -- 'outbound' (us → provider), 'inbound' (provider → us)
  sync_type TEXT NOT NULL, -- 'status', 'payment', 'rider', 'item', 'full'
  
  -- ==========================================================================
  -- STATUS CHANGES
  -- ==========================================================================
  old_status order_status_type,
  new_status order_status_type,
  
  -- ==========================================================================
  -- DATA CHANGES
  -- ==========================================================================
  old_data JSONB, -- Old data (before sync)
  new_data JSONB, -- New data (after sync)
  
  -- ==========================================================================
  -- SYNC RESULT
  -- ==========================================================================
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Sync logs are immutable - never updated or deleted
);

-- Ensure columns exist and add foreign key constraints for order_sync_logs
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_type column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'provider_type'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN provider_type order_source_type NOT NULL DEFAULT 'internal';
  END IF;
  
  -- Add sync_direction column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'sync_direction'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN sync_direction TEXT NOT NULL DEFAULT 'outbound';
  END IF;
  
  -- Add sync_type column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'sync_type'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN sync_type TEXT NOT NULL DEFAULT 'status';
  END IF;
  
  -- Add old_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'old_status'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN old_status order_status_type;
  END IF;
  
  -- Add new_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'new_status'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN new_status order_status_type;
  END IF;
  
  -- Add old_data column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'old_data'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN old_data JSONB;
  END IF;
  
  -- Add new_data column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'new_data'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN new_data JSONB;
  END IF;
  
  -- Add success column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'success'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN success BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add error_message column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'error_message'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN error_message TEXT;
  END IF;
  
  -- Add retry_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_sync_logs' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.order_sync_logs 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_sync_logs' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_sync_logs' 
          AND constraint_name = 'order_sync_logs_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_sync_logs 
          ADD CONSTRAINT order_sync_logs_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_sync_logs
CREATE INDEX IF NOT EXISTS order_sync_logs_order_id_idx ON public.order_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS order_sync_logs_provider_type_idx ON public.order_sync_logs(provider_type);
CREATE INDEX IF NOT EXISTS order_sync_logs_sync_direction_idx ON public.order_sync_logs(sync_direction);
CREATE INDEX IF NOT EXISTS order_sync_logs_sync_type_idx ON public.order_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS order_sync_logs_success_idx ON public.order_sync_logs(success) WHERE success = FALSE;
CREATE INDEX IF NOT EXISTS order_sync_logs_created_at_idx ON public.order_sync_logs(created_at);
CREATE INDEX IF NOT EXISTS order_sync_logs_order_created_idx ON public.order_sync_logs(order_id, created_at);

-- Comments
COMMENT ON TABLE public.order_sync_logs IS 'Logs of all sync attempts with external providers. Immutable record - never updated or deleted. Used for sync monitoring and error tracking.';
COMMENT ON COLUMN public.order_sync_logs.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_sync_logs.provider_type IS 'Provider type: swiggy, zomato, rapido, etc.';
COMMENT ON COLUMN public.order_sync_logs.sync_direction IS 'Sync direction: outbound (us → provider), inbound (provider → us).';
COMMENT ON COLUMN public.order_sync_logs.sync_type IS 'Type of sync: status, payment, rider, item, full.';
COMMENT ON COLUMN public.order_sync_logs.old_status IS 'Old status (before sync).';
COMMENT ON COLUMN public.order_sync_logs.new_status IS 'New status (after sync).';
COMMENT ON COLUMN public.order_sync_logs.old_data IS 'Old data before sync (stored as JSONB).';
COMMENT ON COLUMN public.order_sync_logs.new_data IS 'New data after sync (stored as JSONB).';
COMMENT ON COLUMN public.order_sync_logs.success IS 'Whether sync succeeded.';
COMMENT ON COLUMN public.order_sync_logs.error_message IS 'Error message if sync failed.';
COMMENT ON COLUMN public.order_sync_logs.retry_count IS 'Number of retry attempts.';

-- ============================================================================
-- PROVIDER ORDER ANALYTICS (Provider Performance Analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_order_analytics (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- ANALYTICS DATA
  -- ==========================================================================
  analytics_date DATE NOT NULL,
  order_count INTEGER DEFAULT 1,
  total_revenue NUMERIC(12, 2) DEFAULT 0,
  total_commission NUMERIC(12, 2) DEFAULT 0,
  avg_delivery_time_minutes NUMERIC(6, 2),
  success_rate NUMERIC(5, 2), -- Percentage
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  analytics_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  UNIQUE(order_id, provider_id, analytics_date) -- One record per order per provider per date
);

-- Ensure columns exist and add foreign key constraints
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add analytics_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'analytics_date'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN analytics_date DATE NOT NULL DEFAULT CURRENT_DATE;
  END IF;
  
  -- Add order_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'order_count'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN order_count INTEGER DEFAULT 1;
  END IF;
  
  -- Add total_revenue column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'total_revenue'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN total_revenue NUMERIC(12, 2) DEFAULT 0;
  END IF;
  
  -- Add total_commission column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'total_commission'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN total_commission NUMERIC(12, 2) DEFAULT 0;
  END IF;
  
  -- Add avg_delivery_time_minutes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'avg_delivery_time_minutes'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN avg_delivery_time_minutes NUMERIC(6, 2);
  END IF;
  
  -- Add success_rate column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'success_rate'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN success_rate NUMERIC(5, 2);
  END IF;
  
  -- Add analytics_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'analytics_metadata'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN analytics_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_analytics' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.provider_order_analytics 
      ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_analytics' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_analytics' 
          AND constraint_name = 'provider_order_analytics_order_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_analytics 
          ADD CONSTRAINT provider_order_analytics_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_providers table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_analytics' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_analytics' 
          AND constraint_name = 'provider_order_analytics_provider_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_analytics 
          ADD CONSTRAINT provider_order_analytics_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for provider_order_analytics
CREATE INDEX IF NOT EXISTS provider_order_analytics_order_id_idx ON public.provider_order_analytics(order_id);
CREATE INDEX IF NOT EXISTS provider_order_analytics_provider_id_idx ON public.provider_order_analytics(provider_id);
CREATE INDEX IF NOT EXISTS provider_order_analytics_analytics_date_idx ON public.provider_order_analytics(analytics_date);
CREATE INDEX IF NOT EXISTS provider_order_analytics_provider_date_idx ON public.provider_order_analytics(provider_id, analytics_date);

-- Comments
COMMENT ON TABLE public.provider_order_analytics IS 'Provider performance analytics. Aggregated data per provider per day.';
COMMENT ON COLUMN public.provider_order_analytics.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.provider_order_analytics.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.provider_order_analytics.analytics_date IS 'Date for analytics (one record per order per provider per date).';
COMMENT ON COLUMN public.provider_order_analytics.order_count IS 'Number of orders (usually 1, but can be aggregated).';
COMMENT ON COLUMN public.provider_order_analytics.total_revenue IS 'Total revenue from provider orders.';
COMMENT ON COLUMN public.provider_order_analytics.total_commission IS 'Total commission from provider orders.';
COMMENT ON COLUMN public.provider_order_analytics.avg_delivery_time_minutes IS 'Average delivery time in minutes.';
COMMENT ON COLUMN public.provider_order_analytics.success_rate IS 'Success rate percentage.';

-- ============================================================================
-- PROVIDER ORDER CONFLICTS (Provider-Specific Conflicts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_order_conflicts (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- CONFLICT DETAILS
  -- ==========================================================================
  conflict_type TEXT NOT NULL, -- 'status', 'fare', 'rider', 'payment', 'item'
  conflict_field TEXT NOT NULL, -- Field name where conflict occurred
  our_value JSONB NOT NULL,
  provider_value JSONB NOT NULL,
  
  -- ==========================================================================
  -- RESOLUTION
  -- ==========================================================================
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure columns exist and add foreign key constraints for provider_order_conflicts
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_conflicts' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_conflicts' 
          AND constraint_name = 'provider_order_conflicts_order_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_conflicts 
          ADD CONSTRAINT provider_order_conflicts_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_providers table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_conflicts' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_conflicts' 
          AND constraint_name = 'provider_order_conflicts_provider_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_conflicts 
          ADD CONSTRAINT provider_order_conflicts_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
  
  -- Add conflict_type column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'conflict_type'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN conflict_type TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add conflict_field column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'conflict_field'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN conflict_field TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add our_value column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'our_value'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN our_value JSONB NOT NULL DEFAULT '{}';
  END IF;
  
  -- Add provider_value column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'provider_value'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN provider_value JSONB NOT NULL DEFAULT '{}';
  END IF;
  
  -- Add resolved column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'resolved'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN resolved BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add resolved_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'resolved_by'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN resolved_by INTEGER;
  END IF;
  
  -- Add resolved_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'resolved_at'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add resolution_notes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'resolution_notes'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN resolution_notes TEXT;
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_conflicts' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.provider_order_conflicts 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Indexes for provider_order_conflicts
CREATE INDEX IF NOT EXISTS provider_order_conflicts_order_id_idx ON public.provider_order_conflicts(order_id);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_provider_id_idx ON public.provider_order_conflicts(provider_id);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_conflict_type_idx ON public.provider_order_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_resolved_idx ON public.provider_order_conflicts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS provider_order_conflicts_created_at_idx ON public.provider_order_conflicts(created_at);

-- Comments
COMMENT ON TABLE public.provider_order_conflicts IS 'Provider-specific conflicts. Similar to order_conflicts but provider-specific.';
COMMENT ON COLUMN public.provider_order_conflicts.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.provider_order_conflicts.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.provider_order_conflicts.conflict_type IS 'Type of conflict: status, fare, rider, payment, item.';
COMMENT ON COLUMN public.provider_order_conflicts.conflict_field IS 'Field name where conflict occurred.';
COMMENT ON COLUMN public.provider_order_conflicts.our_value IS 'Our value (stored as JSONB).';
COMMENT ON COLUMN public.provider_order_conflicts.provider_value IS 'Provider''s value (stored as JSONB).';

-- ============================================================================
-- PROVIDER ORDER ITEM MAPPING (Provider Item Mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_order_item_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  order_item_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- PROVIDER ITEM INFORMATION
  -- ==========================================================================
  provider_item_id TEXT NOT NULL, -- Provider's item ID
  provider_item_name TEXT,
  provider_item_price NUMERIC(10, 2),
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  mapping_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  UNIQUE(order_item_id, provider_id) -- One mapping per item per provider
);

-- Ensure columns exist and add foreign key constraints for provider_order_item_mapping
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'order_item_id'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN order_item_id BIGINT NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add foreign keys if tables exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_item_mapping' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_item_mapping' 
          AND constraint_name = 'provider_order_item_mapping_order_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_item_mapping 
          ADD CONSTRAINT provider_order_item_mapping_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_item_mapping' 
        AND column_name = 'order_item_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_item_mapping' 
          AND constraint_name = 'provider_order_item_mapping_order_item_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_item_mapping 
          ADD CONSTRAINT provider_order_item_mapping_order_item_id_fkey 
          FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_item_mapping' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_item_mapping' 
          AND constraint_name = 'provider_order_item_mapping_provider_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_item_mapping 
          ADD CONSTRAINT provider_order_item_mapping_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
  
  -- Add provider_item_id column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'provider_item_id'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN provider_item_id TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add provider_item_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'provider_item_name'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN provider_item_name TEXT;
  END IF;
  
  -- Add provider_item_price column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'provider_item_price'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN provider_item_price NUMERIC(10, 2);
  END IF;
  
  -- Add mapping_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'mapping_metadata'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN mapping_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_item_mapping' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.provider_order_item_mapping 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Indexes for provider_order_item_mapping
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_order_id_idx ON public.provider_order_item_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_order_item_id_idx ON public.provider_order_item_mapping(order_item_id);
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_provider_id_idx ON public.provider_order_item_mapping(provider_id);
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_provider_item_id_idx ON public.provider_order_item_mapping(provider_item_id);

-- Comments
COMMENT ON TABLE public.provider_order_item_mapping IS 'Mapping between our order items and provider items. Tracks provider item ID, name, and price.';
COMMENT ON COLUMN public.provider_order_item_mapping.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.provider_order_item_mapping.order_item_id IS 'Foreign key to order_items table.';
COMMENT ON COLUMN public.provider_order_item_mapping.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.provider_order_item_mapping.provider_item_id IS 'Provider''s item ID (required).';
COMMENT ON COLUMN public.provider_order_item_mapping.provider_item_name IS 'Provider''s item name.';
COMMENT ON COLUMN public.provider_order_item_mapping.provider_item_price IS 'Provider''s item price (may differ from ours).';

-- ============================================================================
-- PROVIDER ORDER PAYMENT MAPPING (Provider Payment Mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_order_payment_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  order_payment_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- PROVIDER PAYMENT INFORMATION
  -- ==========================================================================
  provider_payment_id TEXT NOT NULL, -- Provider's payment ID
  provider_transaction_id TEXT,
  provider_payment_status TEXT,
  provider_payment_amount NUMERIC(12, 2),
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  mapping_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  UNIQUE(order_payment_id, provider_id) -- One mapping per payment per provider
);

-- Ensure columns exist and add foreign key constraints for provider_order_payment_mapping
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'order_payment_id'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN order_payment_id BIGINT NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add foreign keys if tables exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_payment_mapping' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_payment_mapping' 
          AND constraint_name = 'provider_order_payment_mapping_order_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_payment_mapping 
          ADD CONSTRAINT provider_order_payment_mapping_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_payments') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_payment_mapping' 
        AND column_name = 'order_payment_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_payment_mapping' 
          AND constraint_name = 'provider_order_payment_mapping_order_payment_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_payment_mapping 
          ADD CONSTRAINT provider_order_payment_mapping_order_payment_id_fkey 
          FOREIGN KEY (order_payment_id) REFERENCES public.order_payments(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_payment_mapping' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_payment_mapping' 
          AND constraint_name = 'provider_order_payment_mapping_provider_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_payment_mapping 
          ADD CONSTRAINT provider_order_payment_mapping_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
  
  -- Add provider_payment_id column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'provider_payment_id'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN provider_payment_id TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add provider_transaction_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'provider_transaction_id'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN provider_transaction_id TEXT;
  END IF;
  
  -- Add provider_payment_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'provider_payment_status'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN provider_payment_status TEXT;
  END IF;
  
  -- Add provider_payment_amount column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'provider_payment_amount'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN provider_payment_amount NUMERIC(12, 2);
  END IF;
  
  -- Add mapping_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'mapping_metadata'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN mapping_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_payment_mapping' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.provider_order_payment_mapping 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Indexes for provider_order_payment_mapping
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_order_id_idx ON public.provider_order_payment_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_order_payment_id_idx ON public.provider_order_payment_mapping(order_payment_id);
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_provider_id_idx ON public.provider_order_payment_mapping(provider_id);
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_provider_payment_id_idx ON public.provider_order_payment_mapping(provider_payment_id);

-- Comments
COMMENT ON TABLE public.provider_order_payment_mapping IS 'Mapping between our order payments and provider payments. Tracks provider payment ID, transaction ID, status, and amount.';
COMMENT ON COLUMN public.provider_order_payment_mapping.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.provider_order_payment_mapping.order_payment_id IS 'Foreign key to order_payments table.';
COMMENT ON COLUMN public.provider_order_payment_mapping.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.provider_order_payment_mapping.provider_payment_id IS 'Provider''s payment ID (required).';
COMMENT ON COLUMN public.provider_order_payment_mapping.provider_transaction_id IS 'Provider''s transaction ID.';
COMMENT ON COLUMN public.provider_order_payment_mapping.provider_payment_status IS 'Provider''s payment status (may differ from ours).';
COMMENT ON COLUMN public.provider_order_payment_mapping.provider_payment_amount IS 'Provider''s payment amount (may differ from ours).';

-- ============================================================================
-- PROVIDER ORDER REFUND MAPPING (Provider Refund Mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_order_refund_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  order_refund_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- PROVIDER REFUND INFORMATION
  -- ==========================================================================
  provider_refund_id TEXT NOT NULL, -- Provider's refund ID
  provider_refund_status TEXT,
  provider_refund_amount NUMERIC(12, 2),
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  mapping_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  UNIQUE(order_refund_id, provider_id) -- One mapping per refund per provider
);

-- Ensure columns exist and add foreign key constraints for provider_order_refund_mapping
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'order_refund_id'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN order_refund_id BIGINT NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add foreign keys if tables exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_refund_mapping' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_refund_mapping' 
          AND constraint_name = 'provider_order_refund_mapping_order_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_refund_mapping 
          ADD CONSTRAINT provider_order_refund_mapping_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_refunds') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_refund_mapping' 
        AND column_name = 'order_refund_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_refund_mapping' 
          AND constraint_name = 'provider_order_refund_mapping_order_refund_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_refund_mapping 
          ADD CONSTRAINT provider_order_refund_mapping_order_refund_id_fkey 
          FOREIGN KEY (order_refund_id) REFERENCES public.order_refunds(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_refund_mapping' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_refund_mapping' 
          AND constraint_name = 'provider_order_refund_mapping_provider_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_refund_mapping 
          ADD CONSTRAINT provider_order_refund_mapping_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
  
  -- Add provider_refund_id column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'provider_refund_id'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN provider_refund_id TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add provider_refund_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'provider_refund_status'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN provider_refund_status TEXT;
  END IF;
  
  -- Add provider_refund_amount column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'provider_refund_amount'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN provider_refund_amount NUMERIC(12, 2);
  END IF;
  
  -- Add mapping_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'mapping_metadata'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN mapping_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_refund_mapping' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.provider_order_refund_mapping 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Indexes for provider_order_refund_mapping
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_order_id_idx ON public.provider_order_refund_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_order_refund_id_idx ON public.provider_order_refund_mapping(order_refund_id);
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_provider_id_idx ON public.provider_order_refund_mapping(provider_id);
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_provider_refund_id_idx ON public.provider_order_refund_mapping(provider_refund_id);

-- Comments
COMMENT ON TABLE public.provider_order_refund_mapping IS 'Mapping between our order refunds and provider refunds. Tracks provider refund ID, status, and amount.';
COMMENT ON COLUMN public.provider_order_refund_mapping.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.provider_order_refund_mapping.order_refund_id IS 'Foreign key to order_refunds table.';
COMMENT ON COLUMN public.provider_order_refund_mapping.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.provider_order_refund_mapping.provider_refund_id IS 'Provider''s refund ID (required).';
COMMENT ON COLUMN public.provider_order_refund_mapping.provider_refund_status IS 'Provider''s refund status (may differ from ours).';
COMMENT ON COLUMN public.provider_order_refund_mapping.provider_refund_amount IS 'Provider''s refund amount (may differ from ours).';

-- ============================================================================
-- PROVIDER ORDER STATUS SYNC (Provider Status Sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_order_status_sync (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- STATUS SYNC DETAILS
  -- ==========================================================================
  our_status order_status_type NOT NULL,
  provider_status TEXT NOT NULL,
  sync_direction TEXT NOT NULL, -- 'outbound', 'inbound'
  
  -- ==========================================================================
  -- SYNC RESULT
  -- ==========================================================================
  sync_success BOOLEAN DEFAULT FALSE,
  sync_error TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  sync_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure columns exist and add foreign key constraints for provider_order_status_sync
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add provider_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN provider_id BIGINT NOT NULL;
  END IF;
  
  -- Add our_status column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'our_status'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN our_status order_status_type NOT NULL DEFAULT 'assigned';
  END IF;
  
  -- Add provider_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'provider_status'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN provider_status TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add sync_direction column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'sync_direction'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN sync_direction TEXT NOT NULL DEFAULT 'outbound';
  END IF;
  
  -- Add sync_success column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'sync_success'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN sync_success BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add sync_error column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'sync_error'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN sync_error TEXT;
  END IF;
  
  -- Add retry_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
  
  -- Add sync_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'sync_metadata'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN sync_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist (used in indexes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'provider_order_status_sync' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.provider_order_status_sync 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_status_sync' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_status_sync' 
          AND constraint_name = 'provider_order_status_sync_order_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_status_sync 
          ADD CONSTRAINT provider_order_status_sync_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_providers table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_providers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'provider_order_status_sync' 
        AND column_name = 'provider_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'provider_order_status_sync' 
          AND constraint_name = 'provider_order_status_sync_provider_id_fkey'
      ) THEN
        ALTER TABLE public.provider_order_status_sync 
          ADD CONSTRAINT provider_order_status_sync_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES public.order_providers(id) ON DELETE RESTRICT;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for provider_order_status_sync
CREATE INDEX IF NOT EXISTS provider_order_status_sync_order_id_idx ON public.provider_order_status_sync(order_id);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_provider_id_idx ON public.provider_order_status_sync(provider_id);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_our_status_idx ON public.provider_order_status_sync(our_status);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_sync_success_idx ON public.provider_order_status_sync(sync_success) WHERE sync_success = FALSE;
CREATE INDEX IF NOT EXISTS provider_order_status_sync_created_at_idx ON public.provider_order_status_sync(created_at);

-- Comments
COMMENT ON TABLE public.provider_order_status_sync IS 'Provider status sync tracking. Tracks our status vs provider status and sync results.';
COMMENT ON COLUMN public.provider_order_status_sync.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.provider_order_status_sync.provider_id IS 'Foreign key to order_providers table.';
COMMENT ON COLUMN public.provider_order_status_sync.our_status IS 'Our order status.';
COMMENT ON COLUMN public.provider_order_status_sync.provider_status IS 'Provider''s order status (may differ from ours).';
COMMENT ON COLUMN public.provider_order_status_sync.sync_direction IS 'Sync direction: outbound (us → provider), inbound (provider → us).';
COMMENT ON COLUMN public.provider_order_status_sync.sync_success IS 'Whether status sync succeeded.';
COMMENT ON COLUMN public.provider_order_status_sync.sync_error IS 'Error message if sync failed.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update order_providers updated_at
DROP TRIGGER IF EXISTS order_providers_updated_at_trigger ON public.order_providers;
CREATE TRIGGER order_providers_updated_at_trigger
  BEFORE UPDATE ON public.order_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_provider_mapping updated_at
DROP TRIGGER IF EXISTS order_provider_mapping_updated_at_trigger ON public.order_provider_mapping;
CREATE TRIGGER order_provider_mapping_updated_at_trigger
  BEFORE UPDATE ON public.order_provider_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_order_analytics updated_at
DROP TRIGGER IF EXISTS provider_order_analytics_updated_at_trigger ON public.provider_order_analytics;
CREATE TRIGGER provider_order_analytics_updated_at_trigger
  BEFORE UPDATE ON public.provider_order_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_provider_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_order_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_order_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_order_item_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_order_payment_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_order_refund_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_order_status_sync ENABLE ROW LEVEL SECURITY;
