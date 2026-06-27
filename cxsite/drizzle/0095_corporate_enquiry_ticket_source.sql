-- Migration: corporate web enquiry tickets
-- Adds unified_ticket_source value for gatimitra.com/corporates form submissions.
-- Display label in product copy: "Other-Corporate"; DB enum: OTHER_CORPORATE (no hyphens in PG enums).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unified_ticket_source'
      AND e.enumlabel = 'OTHER_CORPORATE'
  ) THEN
    ALTER TYPE unified_ticket_source ADD VALUE 'OTHER_CORPORATE';
  END IF;
END $$;

-- Optional column: corporate routing group (FK only when ticket_groups exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'unified_tickets'
      AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.unified_tickets ADD COLUMN group_id BIGINT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_groups'
  )
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unified_tickets_group_id_fkey') THEN
    ALTER TABLE public.unified_tickets
      ADD CONSTRAINT unified_tickets_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.ticket_groups (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS unified_tickets_group_id_idx ON public.unified_tickets (group_id)
WHERE group_id IS NOT NULL;

-- ticket_title_config update for OTHER_CORPORATE is in 0096 (PG forbids using a new enum
-- literal in the same transaction as ALTER TYPE ... ADD VALUE).
