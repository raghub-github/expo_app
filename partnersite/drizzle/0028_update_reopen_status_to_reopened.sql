-- Migration: Update reopen ticket API to use REOPENED status instead of OPEN
-- This migration ensures that when a ticket is reopened, its status is set to 'REOPENED'
-- The REOPENED status already exists in the unified_ticket_status enum

-- Add reopened_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unified_tickets' 
    AND column_name = 'reopened_at'
  ) THEN
    ALTER TABLE unified_tickets 
    ADD COLUMN reopened_at TIMESTAMP WITH TIME ZONE;
    
    COMMENT ON COLUMN unified_tickets.reopened_at IS 'Timestamp when ticket was reopened after being resolved/closed';
  END IF;
END $$;

-- Verify REOPENED status exists in enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'REOPENED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unified_ticket_status')
  ) THEN
    RAISE EXCEPTION 'REOPENED status does not exist in unified_ticket_status enum';
  END IF;
END $$;

-- Update any existing tickets that were reopened but still have OPEN status
-- This is a data migration to fix any inconsistencies
-- Note: We check for resolved_at to identify previously resolved tickets
UPDATE unified_tickets
SET status = 'REOPENED',
    reopened_at = COALESCE(reopened_at, updated_at)
WHERE status = 'OPEN' 
  AND resolved_at IS NOT NULL
  AND (reopened_at IS NOT NULL OR updated_at > resolved_at);

-- Add comment to document the change
COMMENT ON COLUMN unified_tickets.status IS 'Ticket status: OPEN, IN_PROGRESS, WAITING_FOR_USER, WAITING_FOR_MERCHANT, WAITING_FOR_RIDER, RESOLVED, CLOSED, ESCALATED, REOPENED, CANCELLED. REOPENED status is used when a resolved/closed ticket is reopened by the merchant.';
