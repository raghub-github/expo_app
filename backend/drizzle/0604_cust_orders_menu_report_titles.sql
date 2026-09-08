-- 0604: CUST_ORDERS titles for restaurant "Report fraud or bad practices".
--
-- I/O-safe:
--   ticket_titles is a small catalog (not orders). No table rewrite, no index
--   build, no backfill of large tables. DDL is skipped when already present
--   so we do not take ACCESS EXCLUSIVE for no-op ADD COLUMN. UPDATE only
--   rewrites rows that actually change. INSERT is 0–3 rows.
--
-- WHY:
--   Store-menu reports must create a unified support ticket against the three
--   Help Topics titles under CUST_ORDERS. Rows added only in Ticket Management
--   often lack intake_unified_title, which made ticket insert fail.

SET lock_timeout = '3s';
SET statement_timeout = '15s';

-- Skip ALTER TABLE when columns already exist (0223+). Avoids ACCESS EXCLUSIVE.
DO $$
BEGIN
  IF to_regclass('public.ticket_titles') IS NULL THEN
    RAISE EXCEPTION 'ticket_titles missing';
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_titles' AND column_name = 'applicable_order_statuses'
  ) THEN
    ALTER TABLE public.ticket_titles ADD COLUMN applicable_order_statuses TEXT[];
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_titles' AND column_name = 'customer_section_id'
  ) THEN
    ALTER TABLE public.ticket_titles ADD COLUMN customer_section_id TEXT;
  END IF;
END $$;

-- Enum values already seeded in 0224. Add only if the legacy enum still exists
-- and the label is missing. No-op on text ticket_title (0201).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unified_ticket_title') THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_FEEDBACK';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_OTHER';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_GENERAL_QUERY';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Rewrite only dirty matching catalog rows (typically 0–3).
UPDATE public.ticket_titles tt
SET
  title_text = CASE
    WHEN lower(trim(tt.title_text)) IN (
      'inaccurate photos or descriptions',
      'inaccurate photos/descriptions',
      'inaccurate photos or description'
    ) THEN 'Inaccurate Photos or Descriptions'
    WHEN lower(trim(tt.title_text)) IN (
      'items missing from the menu',
      'items are missing in the menu',
      'items missing in the menu',
      'item missing from the menu'
    ) THEN 'Items Missing from the Menu'
    WHEN lower(trim(tt.title_text)) IN (
      'other issue',
      'i have some other issue',
      'some other issue'
    ) THEN 'Other Issue'
    ELSE tt.title_text
  END,
  intake_unified_title = COALESCE(NULLIF(trim(tt.intake_unified_title), ''),
    CASE
      WHEN lower(trim(tt.title_text)) IN (
        'other issue', 'i have some other issue', 'some other issue'
      ) THEN 'CUSTOMER_OTHER'
      ELSE 'CUSTOMER_FEEDBACK'
    END
  ),
  intake_unified_category = COALESCE(NULLIF(trim(tt.intake_unified_category), ''), 'COMPLAINT'),
  intake_unified_priority = COALESCE(NULLIF(trim(tt.intake_unified_priority), ''), 'MEDIUM'),
  intake_unified_service_type = COALESCE(NULLIF(trim(tt.intake_unified_service_type), ''), 'FOOD'),
  customer_section_id = COALESCE(NULLIF(trim(tt.customer_section_id), ''), 'orders'),
  applicable_order_statuses = CASE
    WHEN tt.applicable_order_statuses IS NULL THEN ARRAY['NO_ORDER']::text[]
    WHEN 'NO_ORDER' = ANY(tt.applicable_order_statuses) THEN tt.applicable_order_statuses
    ELSE tt.applicable_order_statuses || ARRAY['NO_ORDER']::text[]
  END,
  is_active = TRUE,
  updated_at = NOW()
FROM public.ticket_groups tg
WHERE tt.group_id = tg.id
  AND tg.group_code = 'CUST_ORDERS'
  AND lower(trim(tt.title_text)) IN (
    'inaccurate photos or descriptions',
    'inaccurate photos/descriptions',
    'inaccurate photos or description',
    'items missing from the menu',
    'items are missing in the menu',
    'items missing in the menu',
    'item missing from the menu',
    'other issue',
    'i have some other issue',
    'some other issue'
  )
  AND (
    tt.title_text NOT IN (
      'Inaccurate Photos or Descriptions',
      'Items Missing from the Menu',
      'Other Issue'
    )
    OR NULLIF(trim(tt.intake_unified_title), '') IS NULL
    OR NULLIF(trim(tt.intake_unified_category), '') IS NULL
    OR NULLIF(trim(tt.intake_unified_priority), '') IS NULL
    OR NULLIF(trim(tt.intake_unified_service_type), '') IS NULL
    OR NULLIF(trim(tt.customer_section_id), '') IS NULL
    OR tt.applicable_order_statuses IS NULL
    OR NOT ('NO_ORDER' = ANY(tt.applicable_order_statuses))
    OR tt.is_active IS DISTINCT FROM TRUE
  );

WITH g AS (
  SELECT id AS gid_orders
  FROM public.ticket_groups
  WHERE group_code = 'CUST_ORDERS'
  LIMIT 1
), existing AS (
  SELECT lower(trim(tt.title_text)) AS key
  FROM public.ticket_titles tt
  JOIN public.ticket_groups tg ON tg.id = tt.group_id
  WHERE tg.group_code = 'CUST_ORDERS'
)
INSERT INTO public.ticket_titles
  (title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
   group_id, display_order, is_active,
   intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type,
   applicable_order_statuses)
SELECT v.title_code, v.title_text, v.service_type, v.ticket_section, v.source_role, v.customer_section_id,
       (SELECT gid_orders FROM g), v.display_order, TRUE,
       v.intake_unified_title, v.intake_unified_category, v.intake_unified_priority, v.intake_unified_service_type,
       v.applicable_order_statuses
FROM (
  VALUES
    (
      'CUST_MENU_INACCURATE_PHOTOS',
      'Inaccurate Photos or Descriptions',
      'food'::ticket_service_type,
      'customer'::ticket_section,
      'customer'::ticket_source_role,
      'orders',
      600,
      'CUSTOMER_FEEDBACK',
      'COMPLAINT',
      'MEDIUM',
      'FOOD',
      ARRAY['NO_ORDER']::text[]
    ),
    (
      'CUST_MENU_ITEMS_MISSING',
      'Items Missing from the Menu',
      'food'::ticket_service_type,
      'customer'::ticket_section,
      'customer'::ticket_source_role,
      'orders',
      610,
      'CUSTOMER_FEEDBACK',
      'COMPLAINT',
      'MEDIUM',
      'FOOD',
      ARRAY['NO_ORDER']::text[]
    ),
    (
      'CUST_MENU_OTHER_ISSUE',
      'Other Issue',
      'food'::ticket_service_type,
      'customer'::ticket_section,
      'customer'::ticket_source_role,
      'orders',
      620,
      'CUSTOMER_OTHER',
      'COMPLAINT',
      'MEDIUM',
      'FOOD',
      ARRAY['NO_ORDER']::text[]
    )
) AS v(
  title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
  display_order, intake_unified_title, intake_unified_category, intake_unified_priority,
  intake_unified_service_type, applicable_order_statuses
)
WHERE (SELECT gid_orders FROM g) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ticket_titles t WHERE t.title_code = v.title_code
  )
  AND NOT EXISTS (
    SELECT 1 FROM existing e WHERE e.key = lower(v.title_text)
  );
