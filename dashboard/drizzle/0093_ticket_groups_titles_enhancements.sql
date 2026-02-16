-- ============================================================================
-- Ticket Groups & Titles enhancements for Super Admin Ticket Settings
-- ============================================================================
-- Adds: ticket_category (order_related / non_order / other), source_role (source of ticket)
-- to ticket_groups. Ensures ticket_titles can be managed per group.
-- ============================================================================
-- Migration: 0093_ticket_groups_titles_enhancements
-- ============================================================================

-- Add ticket_category to ticket_groups (order related vs non-order)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_groups' AND column_name = 'ticket_category'
  ) THEN
    ALTER TABLE ticket_groups
      ADD COLUMN ticket_category ticket_category;
    COMMENT ON COLUMN ticket_groups.ticket_category IS 'order_related, non_order, or other';
  END IF;
END $$;

-- Add source_role to ticket_groups (source of ticket: who raised it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_groups' AND column_name = 'source_role'
  ) THEN
    ALTER TABLE ticket_groups
      ADD COLUMN source_role ticket_source_role;
    COMMENT ON COLUMN ticket_groups.source_role IS 'Source of ticket: customer, rider, merchant, system, etc.';
  END IF;
END $$;

-- Index for filtering groups by category and source
CREATE INDEX IF NOT EXISTS ticket_groups_category_source_idx
  ON ticket_groups(ticket_category, source_role)
  WHERE ticket_category IS NOT NULL OR source_role IS NOT NULL;
