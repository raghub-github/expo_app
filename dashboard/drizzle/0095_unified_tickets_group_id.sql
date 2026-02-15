-- Add group_id to unified_tickets to link to ticket_groups for auto-assignment and display.
-- Group can be resolved by ticket_title (via ticket_titles) or by service_type / ticket_source / ticket_category.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'unified_tickets' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.unified_tickets
      ADD COLUMN group_id BIGINT REFERENCES ticket_groups(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS unified_tickets_group_id_idx ON public.unified_tickets(group_id)
      WHERE group_id IS NOT NULL;
  END IF;
END $$;
