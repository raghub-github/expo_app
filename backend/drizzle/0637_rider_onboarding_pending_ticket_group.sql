-- 0637: Rider-Onboarding-Pending ticket group + assign onboarding verification tickets.
--
-- I/O-safe:
--   ticket_groups / ticket_titles are small catalogs. INSERT is 0–1 group + 0–1 title.
--   unified_tickets UPDATE only rewrites open onboarding-verification rows that still
--   have NULL group_id (typically a handful). No table rewrite, no new index build.
--   Optional ADD COLUMN for unified_tickets.group_id is skipped when already present
--   (dashboard 0095) so we do not take ACCESS EXCLUSIVE for a no-op.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

-- Ensure unified_tickets.group_id exists (idempotent; usually already from 0095).
-- Do NOT CREATE INDEX here — partial index on a live unified_tickets table is not I/O-safe.
DO $$
BEGIN
  IF to_regclass('public.unified_tickets') IS NULL THEN
    RAISE EXCEPTION 'unified_tickets missing';
  END IF;
  IF to_regclass('public.ticket_groups') IS NULL THEN
    RAISE EXCEPTION 'ticket_groups missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'unified_tickets' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.unified_tickets
      ADD COLUMN group_id BIGINT REFERENCES public.ticket_groups (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Seed queue group (stable code; display name matches agent UI request).
INSERT INTO public.ticket_groups (
  group_code, group_name, group_description,
  ticket_section, source_role, is_active, display_order
)
VALUES (
  'RIDER_ONBOARDING_PENDING',
  'Rider-Onboarding-Pending',
  'Rider onboarding document / account verification queue',
  'rider',
  'rider',
  TRUE,
  45
)
ON CONFLICT (group_code) DO UPDATE
SET group_name = EXCLUDED.group_name,
    group_description = EXCLUDED.group_description,
    ticket_section = EXCLUDED.ticket_section,
    source_role = EXCLUDED.source_role,
    is_active = TRUE,
    updated_at = NOW();

-- Optional ticket_category when column exists (dashboard 0093+).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_groups' AND column_name = 'ticket_category'
  ) THEN
    UPDATE public.ticket_groups
    SET ticket_category = 'non_order'::ticket_category,
        updated_at = NOW()
    WHERE group_code = 'RIDER_ONBOARDING_PENDING'
      AND ticket_category IS DISTINCT FROM 'non_order'::ticket_category;
  END IF;
END $$;

-- Intake columns on ticket_titles (skip ALTER when already present).
DO $$
BEGIN
  IF to_regclass('public.ticket_titles') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_titles' AND column_name = 'intake_unified_title'
  ) THEN
    ALTER TABLE public.ticket_titles ADD COLUMN intake_unified_title TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_titles' AND column_name = 'intake_unified_category'
  ) THEN
    ALTER TABLE public.ticket_titles ADD COLUMN intake_unified_category TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_titles' AND column_name = 'intake_unified_priority'
  ) THEN
    ALTER TABLE public.ticket_titles ADD COLUMN intake_unified_priority TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_titles' AND column_name = 'intake_unified_service_type'
  ) THEN
    ALTER TABLE public.ticket_titles ADD COLUMN intake_unified_service_type TEXT;
  END IF;
END $$;

-- Catalog title so intake / routing can resolve group_id from title_code.
WITH g AS (
  SELECT id AS gid
  FROM public.ticket_groups
  WHERE group_code = 'RIDER_ONBOARDING_PENDING'
  LIMIT 1
)
INSERT INTO public.ticket_titles (
  title_code, title_text, description,
  service_type, ticket_section, source_role,
  group_id, display_order, is_active,
  intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type
)
SELECT
  'ONBOARDING_VERIFICATION_PENDING',
  'Onboarding Verification Pending',
  'Auto-created after onboarding payment while documents / account await review',
  'other'::ticket_service_type,
  'rider'::ticket_section,
  'rider'::ticket_source_role,
  (SELECT gid FROM g),
  10,
  TRUE,
  'ONBOARDING_VERIFICATION_PENDING',
  'VERIFICATION',
  'MEDIUM',
  'GENERAL'
WHERE EXISTS (SELECT 1 FROM g)
  AND to_regclass('public.ticket_titles') IS NOT NULL
ON CONFLICT (title_code) DO UPDATE
SET title_text = EXCLUDED.title_text,
    description = EXCLUDED.description,
    group_id = EXCLUDED.group_id,
    is_active = TRUE,
    intake_unified_title = EXCLUDED.intake_unified_title,
    intake_unified_category = EXCLUDED.intake_unified_category,
    intake_unified_priority = EXCLUDED.intake_unified_priority,
    intake_unified_service_type = EXCLUDED.intake_unified_service_type,
    updated_at = NOW();

-- Backfill open onboarding-verification tickets that still have no group.
UPDATE public.unified_tickets ut
SET
  group_id = g.id,
  updated_at = NOW()
FROM public.ticket_groups g
WHERE g.group_code = 'RIDER_ONBOARDING_PENDING'
  AND ut.group_id IS NULL
  AND ut.status NOT IN (
    'RESOLVED'::unified_ticket_status,
    'CLOSED'::unified_ticket_status
  )
  AND (
    ut.subject = 'Onboarding Verification Pending'
    OR COALESCE(ut.metadata->>'onboarding_verification_pending', '') = 'true'
    OR COALESCE(ut.metadata->'rider_help'->>'title_code', '') = 'ONBOARDING_VERIFICATION_PENDING'
    OR (
      ut.tags IS NOT NULL
      AND 'onboarding_verification_pending' = ANY (ut.tags)
    )
  );

COMMIT;
