-- ============================================================================
-- UNIFIED ORDERS OTP SYSTEM
-- Production-Grade OTP System for Pickup and Delivery
-- Individual OTP per rider assignment for pickup and delivery verification
-- Migration: unified_orders_otps
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Rider-Specific OTPs: Each rider assignment has individual OTPs
-- - Pickup & Delivery: Separate OTPs for pickup and delivery
-- - Service-Agnostic: Works for food, parcel, and ride services
-- - Immutable Audit Trail: Complete OTP history preserved
-- - Security: OTP expiry, attempt limits, lockout mechanism
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_type') THEN
    CREATE TYPE otp_type AS ENUM (
      'pickup',
      'delivery'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_status') THEN
    CREATE TYPE otp_status AS ENUM (
      'pending',
      'verified',
      'expired',
      'failed',
      'cancelled',
      'bypassed'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_verification_method') THEN
    CREATE TYPE otp_verification_method AS ENUM (
      'manual_entry',
      'auto_verify',
      'admin_override',
      'system_bypass'
    );
  END IF;
END $$;

-- ============================================================================
-- ORDER OTPS (Rider-Specific OTPs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_otps (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  rider_assignment_id BIGINT NOT NULL,
  
  -- ==========================================================================
  -- OTP DETAILS
  -- ==========================================================================
  otp_type otp_type NOT NULL, -- 'pickup' or 'delivery'
  otp_code TEXT NOT NULL, -- 4-6 digit OTP code
  otp_status otp_status NOT NULL DEFAULT 'pending',
  
  -- ==========================================================================
  -- EXPIRY & SECURITY
  -- ==========================================================================
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- OTP expiry time
  attempt_count INTEGER DEFAULT 0 CHECK (attempt_count >= 0), -- Number of verification attempts
  max_attempts INTEGER DEFAULT 3, -- Maximum allowed attempts
  locked_until TIMESTAMP WITH TIME ZONE, -- Lockout until this time (if too many failed attempts)
  
  -- ==========================================================================
  -- VERIFICATION DETAILS
  -- ==========================================================================
  verified_at TIMESTAMP WITH TIME ZONE, -- When OTP was verified
  verified_by TEXT, -- Who verified: 'rider', 'merchant', 'customer', 'system', 'agent'
  verified_by_id BIGINT, -- ID of who verified
  verification_method otp_verification_method, -- How OTP was verified
  verification_location_lat DOUBLE PRECISION, -- Location where verified
  verification_location_lon DOUBLE PRECISION,
  verification_location_address TEXT, -- Address where verified
  
  -- ==========================================================================
  -- BYPASS & CANCELLATION
  -- ==========================================================================
  bypassed BOOLEAN DEFAULT FALSE, -- Whether OTP was bypassed
  bypass_reason TEXT, -- Reason for bypass
  bypassed_by TEXT, -- Who bypassed: 'system', 'agent', 'admin'
  bypassed_by_id BIGINT, -- ID of who bypassed
  bypassed_at TIMESTAMP WITH TIME ZONE, -- When bypassed
  
  cancelled BOOLEAN DEFAULT FALSE, -- Whether OTP was cancelled
  cancellation_reason TEXT, -- Reason for cancellation
  cancelled_by TEXT, -- Who cancelled
  cancelled_by_id BIGINT, -- ID of who cancelled
  cancelled_at TIMESTAMP WITH TIME ZONE, -- When cancelled
  
  -- ==========================================================================
  -- SERVICE-SPECIFIC FIELDS
  -- ==========================================================================
  -- For food orders: pickup OTP verified by merchant, delivery OTP verified by customer
  -- For parcel orders: pickup OTP verified by sender, delivery OTP verified by recipient
  -- For ride orders: Usually only pickup OTP (passenger present), delivery OTP optional
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  otp_metadata JSONB DEFAULT '{}', -- Additional OTP metadata
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  -- Note: Unique constraint for active OTPs is enforced via partial unique index below
);

-- Ensure columns exist (for backward compatibility if table already exists)
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add rider_assignment_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'rider_assignment_id'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN rider_assignment_id BIGINT NOT NULL;
  END IF;
  
  -- Add otp_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'otp_type'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN otp_type otp_type NOT NULL DEFAULT 'pickup';
  END IF;
  
  -- Add otp_code column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'otp_code'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN otp_code TEXT NOT NULL DEFAULT '';
  END IF;
  
  -- Add otp_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'otp_status'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN otp_status otp_status NOT NULL DEFAULT 'pending';
  END IF;
  
  -- Add expires_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '10 minutes';
  END IF;
  
  -- Add attempt_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'attempt_count'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN attempt_count INTEGER DEFAULT 0;
  END IF;
  
  -- Add max_attempts column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'max_attempts'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN max_attempts INTEGER DEFAULT 3;
  END IF;
  
  -- Add locked_until column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'locked_until'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add verified_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add verified_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verified_by'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verified_by TEXT;
  END IF;
  
  -- Add verified_by_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verified_by_id'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verified_by_id BIGINT;
  END IF;
  
  -- Add verification_method column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verification_method'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verification_method otp_verification_method;
  END IF;
  
  -- Add verification_location_lat column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verification_location_lat'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verification_location_lat DOUBLE PRECISION;
  END IF;
  
  -- Add verification_location_lon column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verification_location_lon'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verification_location_lon DOUBLE PRECISION;
  END IF;
  
  -- Add verification_location_address column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'verification_location_address'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN verification_location_address TEXT;
  END IF;
  
  -- Add bypassed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'bypassed'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN bypassed BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add bypass_reason column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'bypass_reason'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN bypass_reason TEXT;
  END IF;
  
  -- Add bypassed_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'bypassed_by'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN bypassed_by TEXT;
  END IF;
  
  -- Add bypassed_by_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'bypassed_by_id'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN bypassed_by_id BIGINT;
  END IF;
  
  -- Add bypassed_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'bypassed_at'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN bypassed_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add cancelled column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'cancelled'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN cancelled BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add cancellation_reason column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN cancellation_reason TEXT;
  END IF;
  
  -- Add cancelled_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'cancelled_by'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN cancelled_by TEXT;
  END IF;
  
  -- Add cancelled_by_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'cancelled_by_id'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN cancelled_by_id BIGINT;
  END IF;
  
  -- Add cancelled_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add otp_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'otp_metadata'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN otp_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otps' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.order_otps 
      ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Add foreign key constraints if referenced tables exist
DO $$
BEGIN
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_otps' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_otps' 
          AND constraint_name = 'order_otps_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_otps 
          ADD CONSTRAINT order_otps_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_rider_assignments table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_rider_assignments') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_otps' 
        AND column_name = 'rider_assignment_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_otps' 
          AND constraint_name = 'order_otps_rider_assignment_id_fkey'
      ) THEN
        ALTER TABLE public.order_otps 
          ADD CONSTRAINT order_otps_rider_assignment_id_fkey 
          FOREIGN KEY (rider_assignment_id) REFERENCES public.order_rider_assignments(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_otps
CREATE INDEX IF NOT EXISTS order_otps_order_id_idx ON public.order_otps(order_id);
CREATE INDEX IF NOT EXISTS order_otps_rider_assignment_id_idx ON public.order_otps(rider_assignment_id);
CREATE INDEX IF NOT EXISTS order_otps_otp_type_idx ON public.order_otps(otp_type);
CREATE INDEX IF NOT EXISTS order_otps_otp_status_idx ON public.order_otps(otp_status);
CREATE INDEX IF NOT EXISTS order_otps_otp_code_idx ON public.order_otps(otp_code);
CREATE INDEX IF NOT EXISTS order_otps_expires_at_idx ON public.order_otps(expires_at);
CREATE INDEX IF NOT EXISTS order_otps_verified_at_idx ON public.order_otps(verified_at) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_otps_pending_expires_idx ON public.order_otps(expires_at) WHERE otp_status = 'pending';

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS order_otps_rider_type_status_idx ON public.order_otps(rider_assignment_id, otp_type, otp_status);
CREATE INDEX IF NOT EXISTS order_otps_order_type_status_idx ON public.order_otps(order_id, otp_type, otp_status);

-- Partial unique index: Ensure only one active (pending) OTP per rider assignment per type
-- Multiple OTPs allowed if previous ones expired/failed/cancelled
CREATE UNIQUE INDEX IF NOT EXISTS order_otps_rider_assignment_type_pending_unique 
  ON public.order_otps(rider_assignment_id, otp_type) 
  WHERE otp_status = 'pending';

-- Comments
COMMENT ON TABLE public.order_otps IS 'Rider-specific OTPs for pickup and delivery verification. Each rider assignment has individual OTPs for pickup and delivery. Supports food, parcel, and ride services.';
COMMENT ON COLUMN public.order_otps.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_otps.rider_assignment_id IS 'Foreign key to order_rider_assignments table. Each rider assignment has its own OTPs.';
COMMENT ON COLUMN public.order_otps.otp_type IS 'Type of OTP: pickup (for pickup verification) or delivery (for delivery verification).';
COMMENT ON COLUMN public.order_otps.otp_code IS 'OTP code (4-6 digits). Should be encrypted or hashed in production.';
COMMENT ON COLUMN public.order_otps.otp_status IS 'OTP status: pending, verified, expired, failed, cancelled, bypassed.';
COMMENT ON COLUMN public.order_otps.expires_at IS 'When OTP expires. Typically 5-10 minutes after generation.';
COMMENT ON COLUMN public.order_otps.attempt_count IS 'Number of verification attempts made.';
COMMENT ON COLUMN public.order_otps.max_attempts IS 'Maximum allowed verification attempts before lockout.';
COMMENT ON COLUMN public.order_otps.locked_until IS 'Lockout until this time if too many failed attempts.';
COMMENT ON COLUMN public.order_otps.verified_at IS 'When OTP was successfully verified.';
COMMENT ON COLUMN public.order_otps.verified_by IS 'Who verified the OTP: rider, merchant, customer, system, agent.';
COMMENT ON COLUMN public.order_otps.verification_method IS 'How OTP was verified: manual_entry, auto_verify, admin_override, system_bypass.';
COMMENT ON COLUMN public.order_otps.verification_location_lat IS 'Latitude where OTP was verified (for location verification).';
COMMENT ON COLUMN public.order_otps.verification_location_lon IS 'Longitude where OTP was verified (for location verification).';
COMMENT ON COLUMN public.order_otps.bypassed IS 'Whether OTP was bypassed (e.g., technical issues, customer request).';
COMMENT ON COLUMN public.order_otps.bypass_reason IS 'Reason for bypassing OTP.';
COMMENT ON COLUMN public.order_otps.cancelled IS 'Whether OTP was cancelled (e.g., order cancelled, rider changed).';

-- ============================================================================
-- ORDER OTP AUDIT LOG (Immutable OTP History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_otp_audit (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  order_otp_id BIGINT,
  rider_assignment_id BIGINT,
  
  -- ==========================================================================
  -- ACTION DETAILS
  -- ==========================================================================
  action TEXT NOT NULL, -- 'GENERATE', 'VALIDATE_SUCCESS', 'VALIDATE_FAIL', 'EXPIRE', 'CANCEL', 'BYPASS', 'LOCK'
  otp_type otp_type NOT NULL, -- 'pickup' or 'delivery'
  
  -- ==========================================================================
  -- OTP DETAILS (Snapshot)
  -- ==========================================================================
  otp_code TEXT, -- OTP code (may be masked in audit log)
  otp_status otp_status, -- Status at time of action
  
  -- ==========================================================================
  -- ACTOR INFORMATION
  -- ==========================================================================
  actor_type TEXT NOT NULL, -- 'rider', 'merchant', 'customer', 'system', 'agent'
  actor_id BIGINT, -- Actor ID
  actor_name TEXT, -- Actor name
  
  -- ==========================================================================
  -- VERIFICATION ATTEMPT DETAILS
  -- ==========================================================================
  attempted_code TEXT, -- Code that was attempted (for validation failures)
  attempt_number INTEGER, -- Attempt number
  failure_reason TEXT, -- Reason for failure (if applicable)
  
  -- ==========================================================================
  -- LOCATION INFORMATION
  -- ==========================================================================
  location_lat DOUBLE PRECISION, -- Location where action occurred
  location_lon DOUBLE PRECISION,
  location_address TEXT, -- Address where action occurred
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  action_metadata JSONB DEFAULT '{}', -- Additional action metadata
  
  -- ==========================================================================
  -- TIMESTAMP
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: This is an immutable audit log - never update or delete
);

-- Ensure columns exist for order_otp_audit (for backward compatibility if table already exists)
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otp_audit' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_otp_audit 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add order_otp_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otp_audit' 
      AND column_name = 'order_otp_id'
  ) THEN
    ALTER TABLE public.order_otp_audit 
      ADD COLUMN order_otp_id BIGINT;
  END IF;
  
  -- Add rider_assignment_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_otp_audit' 
      AND column_name = 'rider_assignment_id'
  ) THEN
    ALTER TABLE public.order_otp_audit 
      ADD COLUMN rider_assignment_id BIGINT;
  END IF;
END $$;

-- Add foreign key constraints for order_otp_audit if referenced tables exist
DO $$
BEGIN
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_otp_audit' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_otp_audit' 
          AND constraint_name = 'order_otp_audit_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_otp_audit 
          ADD CONSTRAINT order_otp_audit_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_otps table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_otps') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_otp_audit' 
        AND column_name = 'order_otp_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_otp_audit' 
          AND constraint_name = 'order_otp_audit_order_otp_id_fkey'
      ) THEN
        ALTER TABLE public.order_otp_audit 
          ADD CONSTRAINT order_otp_audit_order_otp_id_fkey 
          FOREIGN KEY (order_otp_id) REFERENCES public.order_otps(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
  
  -- Add foreign key to order_rider_assignments table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_rider_assignments') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_otp_audit' 
        AND column_name = 'rider_assignment_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_otp_audit' 
          AND constraint_name = 'order_otp_audit_rider_assignment_id_fkey'
      ) THEN
        ALTER TABLE public.order_otp_audit 
          ADD CONSTRAINT order_otp_audit_rider_assignment_id_fkey 
          FOREIGN KEY (rider_assignment_id) REFERENCES public.order_rider_assignments(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_otp_audit
CREATE INDEX IF NOT EXISTS order_otp_audit_order_id_idx ON public.order_otp_audit(order_id);
CREATE INDEX IF NOT EXISTS order_otp_audit_order_otp_id_idx ON public.order_otp_audit(order_otp_id) WHERE order_otp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_otp_audit_rider_assignment_id_idx ON public.order_otp_audit(rider_assignment_id) WHERE rider_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_otp_audit_action_idx ON public.order_otp_audit(action);
CREATE INDEX IF NOT EXISTS order_otp_audit_otp_type_idx ON public.order_otp_audit(otp_type);
CREATE INDEX IF NOT EXISTS order_otp_audit_actor_type_idx ON public.order_otp_audit(actor_type);
CREATE INDEX IF NOT EXISTS order_otp_audit_actor_id_idx ON public.order_otp_audit(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_otp_audit_created_at_idx ON public.order_otp_audit(created_at);
CREATE INDEX IF NOT EXISTS order_otp_audit_order_created_idx ON public.order_otp_audit(order_id, created_at);

-- Comments
COMMENT ON TABLE public.order_otp_audit IS 'Immutable audit log of all OTP actions. Tracks OTP generation, validation attempts, expiry, cancellation, and bypass. Never updated or deleted.';
COMMENT ON COLUMN public.order_otp_audit.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_otp_audit.order_otp_id IS 'Foreign key to order_otps table (if OTP exists).';
COMMENT ON COLUMN public.order_otp_audit.rider_assignment_id IS 'Foreign key to order_rider_assignments table.';
COMMENT ON COLUMN public.order_otp_audit.action IS 'Action type: GENERATE, VALIDATE_SUCCESS, VALIDATE_FAIL, EXPIRE, CANCEL, BYPASS, LOCK.';
COMMENT ON COLUMN public.order_otp_audit.otp_type IS 'Type of OTP: pickup or delivery.';
COMMENT ON COLUMN public.order_otp_audit.otp_code IS 'OTP code (may be masked/redacted in audit log for security).';
COMMENT ON COLUMN public.order_otp_audit.attempted_code IS 'Code that was attempted during validation (for failed attempts).';
COMMENT ON COLUMN public.order_otp_audit.attempt_number IS 'Attempt number (1, 2, 3, etc.).';
COMMENT ON COLUMN public.order_otp_audit.failure_reason IS 'Reason for validation failure (if applicable).';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update order_otps updated_at
DROP TRIGGER IF EXISTS order_otps_updated_at_trigger ON public.order_otps;
CREATE TRIGGER order_otps_updated_at_trigger
  BEFORE UPDATE ON public.order_otps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-expire OTPs
CREATE OR REPLACE FUNCTION expire_otps()
RETURNS TRIGGER AS $$
BEGIN
  -- Update expired OTPs
  UPDATE public.order_otps
  SET otp_status = 'expired',
      updated_at = NOW()
  WHERE otp_status = 'pending'
    AND expires_at < NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger should be called periodically via a scheduled job
-- For immediate expiry check, use a BEFORE INSERT/UPDATE trigger

-- Trigger: Create audit log entry on OTP status change
CREATE OR REPLACE FUNCTION create_otp_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
BEGIN
  -- Determine action based on status change
  IF OLD.otp_status IS DISTINCT FROM NEW.otp_status THEN
    CASE NEW.otp_status
      WHEN 'verified' THEN
        v_action := 'VALIDATE_SUCCESS';
      WHEN 'expired' THEN
        v_action := 'EXPIRE';
      WHEN 'failed' THEN
        v_action := 'VALIDATE_FAIL';
      WHEN 'cancelled' THEN
        v_action := 'CANCEL';
      WHEN 'bypassed' THEN
        v_action := 'BYPASS';
      ELSE
        v_action := 'UPDATE';
    END CASE;
    
    INSERT INTO public.order_otp_audit (
      order_id,
      order_otp_id,
      rider_assignment_id,
      action,
      otp_type,
      otp_code,
      otp_status,
      actor_type,
      actor_id,
      actor_name,
      attempt_number,
      failure_reason,
      action_metadata,
      created_at
    ) VALUES (
      NEW.order_id,
      NEW.id,
      NEW.rider_assignment_id,
      v_action,
      NEW.otp_type,
      NEW.otp_code,
      NEW.otp_status,
      COALESCE(NEW.verified_by, NEW.bypassed_by, NEW.cancelled_by, 'system'),
      COALESCE(NEW.verified_by_id, NEW.bypassed_by_id, NEW.cancelled_by_id, NULL),
      NULL,
      NEW.attempt_count,
      CASE WHEN NEW.otp_status = 'failed' THEN 'Invalid OTP code' ELSE NULL END,
      jsonb_build_object(
        'old_status', OLD.otp_status,
        'new_status', NEW.otp_status,
        'verification_method', NEW.verification_method,
        'bypass_reason', NEW.bypass_reason,
        'cancellation_reason', NEW.cancellation_reason
      ),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_otps_audit_trigger ON public.order_otps;
CREATE TRIGGER order_otps_audit_trigger
  AFTER UPDATE ON public.order_otps
  FOR EACH ROW
  WHEN (OLD.otp_status IS DISTINCT FROM NEW.otp_status)
  EXECUTE FUNCTION create_otp_audit_log();

-- Trigger: Create audit log entry on OTP generation
CREATE OR REPLACE FUNCTION create_otp_generation_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_otp_audit (
    order_id,
    order_otp_id,
    rider_assignment_id,
    action,
    otp_type,
    otp_code,
    otp_status,
    actor_type,
    actor_id,
    actor_name,
    action_metadata,
    created_at
  ) VALUES (
    NEW.order_id,
    NEW.id,
    NEW.rider_assignment_id,
    'GENERATE',
    NEW.otp_type,
    NEW.otp_code,
    NEW.otp_status,
    'system',
    NULL,
    NULL,
    jsonb_build_object(
      'expires_at', NEW.expires_at,
      'max_attempts', NEW.max_attempts
    ),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_otps_generation_audit_trigger ON public.order_otps;
CREATE TRIGGER order_otps_generation_audit_trigger
  AFTER INSERT ON public.order_otps
  FOR EACH ROW
  EXECUTE FUNCTION create_otp_generation_audit();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Generate OTP code (4-6 digits)
CREATE OR REPLACE FUNCTION generate_otp_code()
RETURNS TEXT AS $$
BEGIN
  -- Generate 6-digit OTP
  RETURN LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Check if OTP is valid
CREATE OR REPLACE FUNCTION is_otp_valid(
  p_otp_id BIGINT,
  p_otp_code TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  SELECT * INTO v_otp_record
  FROM public.order_otps
  WHERE id = p_otp_id;
  
  -- Check if OTP exists
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if OTP is pending
  IF v_otp_record.otp_status != 'pending' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if OTP is expired
  IF v_otp_record.expires_at < NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Check if OTP is locked
  IF v_otp_record.locked_until IS NOT NULL AND v_otp_record.locked_until > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Check if max attempts exceeded
  IF v_otp_record.attempt_count >= v_otp_record.max_attempts THEN
    RETURN FALSE;
  END IF;
  
  -- Check if code matches
  IF v_otp_record.otp_code != p_otp_code THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Verify OTP
CREATE OR REPLACE FUNCTION verify_otp(
  p_otp_id BIGINT,
  p_otp_code TEXT,
  p_verified_by TEXT,
  p_verified_by_id BIGINT,
  p_verification_method otp_verification_method DEFAULT 'manual_entry',
  p_location_lat DOUBLE PRECISION DEFAULT NULL,
  p_location_lon DOUBLE PRECISION DEFAULT NULL,
  p_location_address TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_valid BOOLEAN;
  v_otp_record RECORD;
BEGIN
  -- Check if OTP is valid
  v_is_valid := is_otp_valid(p_otp_id, p_otp_code);
  
  IF NOT v_is_valid THEN
    -- Increment attempt count
    UPDATE public.order_otps
    SET attempt_count = attempt_count + 1,
        otp_status = CASE 
          WHEN attempt_count + 1 >= max_attempts THEN 'failed'
          ELSE 'pending'
        END,
        locked_until = CASE 
          WHEN attempt_count + 1 >= max_attempts THEN NOW() + INTERVAL '15 minutes'
          ELSE locked_until
        END,
        updated_at = NOW()
    WHERE id = p_otp_id;
    
    RETURN FALSE;
  END IF;
  
  -- Verify OTP
  UPDATE public.order_otps
  SET otp_status = 'verified',
      verified_at = NOW(),
      verified_by = p_verified_by,
      verified_by_id = p_verified_by_id,
      verification_method = p_verification_method,
      verification_location_lat = p_location_lat,
      verification_location_lon = p_location_lon,
      verification_location_address = p_location_address,
      updated_at = NOW()
  WHERE id = p_otp_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_otp_audit ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS ON FUNCTIONS
-- ============================================================================

COMMENT ON FUNCTION generate_otp_code() IS 'Generates a 6-digit OTP code.';
COMMENT ON FUNCTION is_otp_valid(BIGINT, TEXT) IS 'Checks if OTP is valid (not expired, not locked, not exceeded max attempts, code matches).';
COMMENT ON FUNCTION verify_otp(BIGINT, TEXT, TEXT, BIGINT, otp_verification_method, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) IS 'Verifies OTP code. Returns TRUE if valid and verified, FALSE otherwise. Increments attempt count on failure.';
