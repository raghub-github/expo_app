-- Customer website support intake queue (idempotent / I/O-safe).
-- Safe to re-run: upserts group by group_code; backfill only touches NULL group_id rows.

BEGIN;

INSERT INTO public.ticket_groups (
  group_code,
  group_name,
  group_description,
  parent_group_id,
  group_level,
  display_order,
  is_active,
  metadata
)
VALUES (
  'GRP_CUSTOMER_WEBSITE',
  'Customer Website',
  'Tickets raised from gatimitra.com /support (ticket + report). Agents reply via customer email.',
  NULL,
  1,
  25,
  true,
  '{"source":"customer_website","channels":["ticket","report"]}'::jsonb
)
ON CONFLICT (group_code) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  group_description = EXCLUDED.group_description,
  is_active = true,
  updated_at = NOW();

-- Optional columns — wrap each update so missing enums/columns never abort the migration.
DO $$
DECLARE
  gid bigint;
BEGIN
  SELECT id INTO gid FROM public.ticket_groups WHERE group_code = 'GRP_CUSTOMER_WEBSITE' LIMIT 1;
  IF gid IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.ticket_groups SET ticket_category = 'non_order' WHERE id = gid;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    UPDATE public.ticket_groups SET source_role = 'customer' WHERE id = gid;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    UPDATE public.ticket_groups SET ticket_section = 'customer' WHERE id = gid;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    UPDATE public.ticket_groups SET service_type = 'other' WHERE id = gid;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Backfill only unassigned matching tickets (no overwrite of existing groups).
UPDATE public.unified_tickets ut
SET group_id = g.id
FROM public.ticket_groups g
WHERE g.group_code = 'GRP_CUSTOMER_WEBSITE'
  AND ut.group_id IS NULL
  AND (
    ut.ticket_source::text = 'CUSTOMER_WEBSITE'
    OR COALESCE(ut.metadata->>'source', '') = 'gatimitra_customer_website'
    OR (ut.tags IS NOT NULL AND 'customer-website' = ANY (ut.tags))
  );

COMMIT;
