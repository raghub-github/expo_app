-- ticket_titles: per-group catalog of title_code (drives unified_tickets.ticket_title) + display copy.
-- Enums are namespaced (ticket_*) to avoid clashing with unified_ticket_* types.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_service_type') THEN
    CREATE TYPE public.ticket_service_type AS ENUM ('GENERAL', 'FOOD', 'PARCEL', 'RIDE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_section') THEN
    CREATE TYPE public.ticket_section AS ENUM (
      'CORPORATE',
      'ORDER',
      'BILLING',
      'ACCOUNT',
      'TECHNICAL',
      'OTHER'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source_role') THEN
    CREATE TYPE public.ticket_source_role AS ENUM (
      'WEB_FORM',
      'SYSTEM',
      'CUSTOMER',
      'MERCHANT',
      'RIDER',
      'EMAIL',
      'AGENT',
      'CALL',
      'WHATSAPP'
    );
  END IF;
END $$;

-- If these enum types already existed (created elsewhere) without our labels, add them here.
-- Seed row that casts to these enums runs in 0099 (separate transaction).
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

-- Allow unified_tickets.ticket_title to use catalog code for corporates web (unique vs plain OTHER).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unified_ticket_title'
      AND e.enumlabel = 'CORPORATE_WEB'
  ) THEN
    ALTER TYPE unified_ticket_title ADD VALUE 'CORPORATE_WEB';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_titles (
  id bigserial NOT NULL,
  group_id bigint NULL,
  service_type public.ticket_service_type NOT NULL,
  ticket_section public.ticket_section NOT NULL,
  source_role public.ticket_source_role NOT NULL,
  title_code text NOT NULL,
  title_text text NOT NULL,
  description text NULL,
  display_order integer NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_titles_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_titles_title_code_key UNIQUE (title_code)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_groups'
  )
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_titles_group_id_fkey') THEN
    ALTER TABLE public.ticket_titles
      ADD CONSTRAINT ticket_titles_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.ticket_groups (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ticket_titles_group_id_idx ON public.ticket_titles USING btree (group_id)
WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ticket_titles_service_section_source_idx ON public.ticket_titles USING btree (
  service_type,
  ticket_section,
  source_role,
  is_active
);

CREATE INDEX IF NOT EXISTS ticket_titles_title_code_idx ON public.ticket_titles USING btree (title_code);

CREATE INDEX IF NOT EXISTS ticket_titles_is_active_idx ON public.ticket_titles USING btree (is_active);

CREATE INDEX IF NOT EXISTS ticket_titles_display_order_idx ON public.ticket_titles USING btree (display_order);

-- Matches user DDL name; same behavior as update_updated_at_column in this repo.
CREATE OR REPLACE FUNCTION public.update_ticket_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_titles_updated_at_trigger ON public.ticket_titles;
CREATE TRIGGER ticket_titles_updated_at_trigger
  BEFORE UPDATE ON public.ticket_titles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticket_updated_at();

-- Seed INSERT is in 0099: PostgreSQL forbids using new enum labels (GENERAL, CORPORATE, WEB_FORM)
-- in the same transaction as ALTER TYPE ... ADD VALUE (55P04).
