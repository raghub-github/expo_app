-- unified_tickets.ticket_title was enum unified_ticket_title; catalog / merchant intake needs arbitrary codes.
-- Convert all columns using that enum to text, then drop the enum type.

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    WHERE c.relname = 'unified_tickets'
      AND a.attname = 'ticket_title'
      AND NOT a.attisdropped
      AND t.typname = 'unified_ticket_title'
  ) THEN
    ALTER TABLE public.unified_tickets
      ALTER COLUMN ticket_title TYPE text USING ticket_title::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    WHERE c.relname = 'ticket_title_config'
      AND a.attname = 'ticket_title'
      AND NOT a.attisdropped
      AND t.typname = 'unified_ticket_title'
  ) THEN
    ALTER TABLE public.ticket_title_config
      ALTER COLUMN ticket_title TYPE text USING ticket_title::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    WHERE c.relname = 'ticket_auto_generation_rules'
      AND a.attname = 'ticket_title'
      AND NOT a.attisdropped
      AND t.typname = 'unified_ticket_title'
  ) THEN
    ALTER TABLE public.ticket_auto_generation_rules
      ALTER COLUMN ticket_title TYPE text USING ticket_title::text;
  END IF;
END
$migration$;

DROP TYPE IF EXISTS public.unified_ticket_title;

COMMENT ON COLUMN public.unified_tickets.ticket_title IS 'Ticket title code (text); aligned with ticket_titles.intake_unified_title / catalog.';

COMMENT ON COLUMN public.ticket_titles.intake_unified_title IS 'Stored on unified_tickets.ticket_title as free-text code when creating from merchant help.';
