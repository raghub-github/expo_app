-- Optional: enum labels only (no INSERT). Same logic as 0097 ADD VALUE blocks.
-- Use if 0097 was skipped or enums pre-existed without GENERAL / CORPORATE / WEB_FORM.
-- Do NOT add INSERT here — use 0099 in a separate committed migration (55P04).
-- Safe to run multiple times.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_service_type')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'ticket_service_type' AND e.enumlabel = 'GENERAL'
     ) THEN
    ALTER TYPE public.ticket_service_type ADD VALUE 'GENERAL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_section')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'ticket_section' AND e.enumlabel = 'CORPORATE'
     ) THEN
    ALTER TYPE public.ticket_section ADD VALUE 'CORPORATE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source_role')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'ticket_source_role' AND e.enumlabel = 'WEB_FORM'
     ) THEN
    ALTER TYPE public.ticket_source_role ADD VALUE 'WEB_FORM';
  END IF;
END $$;
