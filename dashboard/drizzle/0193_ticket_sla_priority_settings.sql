-- Priority-wise SLA breach thresholds for unified tickets.
-- Stored in existing singleton settings row (id=1) used by queue manager.

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS sla_minutes_low INTEGER;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS sla_minutes_medium INTEGER;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS sla_minutes_high INTEGER;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS sla_minutes_urgent INTEGER;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS sla_minutes_critical INTEGER;

UPDATE public.ticket_queue_auto_assign_settings
SET
  sla_minutes_low = COALESCE(sla_minutes_low, 30),
  sla_minutes_medium = COALESCE(sla_minutes_medium, 25),
  sla_minutes_high = COALESCE(sla_minutes_high, 20),
  sla_minutes_urgent = COALESCE(sla_minutes_urgent, 15),
  sla_minutes_critical = COALESCE(sla_minutes_critical, 10)
WHERE id = 1;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ALTER COLUMN sla_minutes_low SET DEFAULT 30;
ALTER TABLE public.ticket_queue_auto_assign_settings
  ALTER COLUMN sla_minutes_medium SET DEFAULT 25;
ALTER TABLE public.ticket_queue_auto_assign_settings
  ALTER COLUMN sla_minutes_high SET DEFAULT 20;
ALTER TABLE public.ticket_queue_auto_assign_settings
  ALTER COLUMN sla_minutes_urgent SET DEFAULT 15;
ALTER TABLE public.ticket_queue_auto_assign_settings
  ALTER COLUMN sla_minutes_critical SET DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_queue_auto_assign_settings_sla_minutes_low_chk'
      AND conrelid = 'public.ticket_queue_auto_assign_settings'::regclass
  ) THEN
    ALTER TABLE public.ticket_queue_auto_assign_settings
      ADD CONSTRAINT ticket_queue_auto_assign_settings_sla_minutes_low_chk
      CHECK (sla_minutes_low IS NULL OR (sla_minutes_low >= 1 AND sla_minutes_low <= 1440));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_queue_auto_assign_settings_sla_minutes_medium_chk'
      AND conrelid = 'public.ticket_queue_auto_assign_settings'::regclass
  ) THEN
    ALTER TABLE public.ticket_queue_auto_assign_settings
      ADD CONSTRAINT ticket_queue_auto_assign_settings_sla_minutes_medium_chk
      CHECK (sla_minutes_medium IS NULL OR (sla_minutes_medium >= 1 AND sla_minutes_medium <= 1440));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_queue_auto_assign_settings_sla_minutes_high_chk'
      AND conrelid = 'public.ticket_queue_auto_assign_settings'::regclass
  ) THEN
    ALTER TABLE public.ticket_queue_auto_assign_settings
      ADD CONSTRAINT ticket_queue_auto_assign_settings_sla_minutes_high_chk
      CHECK (sla_minutes_high IS NULL OR (sla_minutes_high >= 1 AND sla_minutes_high <= 1440));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_queue_auto_assign_settings_sla_minutes_urgent_chk'
      AND conrelid = 'public.ticket_queue_auto_assign_settings'::regclass
  ) THEN
    ALTER TABLE public.ticket_queue_auto_assign_settings
      ADD CONSTRAINT ticket_queue_auto_assign_settings_sla_minutes_urgent_chk
      CHECK (sla_minutes_urgent IS NULL OR (sla_minutes_urgent >= 1 AND sla_minutes_urgent <= 1440));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_queue_auto_assign_settings_sla_minutes_critical_chk'
      AND conrelid = 'public.ticket_queue_auto_assign_settings'::regclass
  ) THEN
    ALTER TABLE public.ticket_queue_auto_assign_settings
      ADD CONSTRAINT ticket_queue_auto_assign_settings_sla_minutes_critical_chk
      CHECK (sla_minutes_critical IS NULL OR (sla_minutes_critical >= 1 AND sla_minutes_critical <= 1440));
  END IF;
END $$;

COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.sla_minutes_low IS 'SLA breach threshold in minutes for LOW priority unified tickets.';
COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.sla_minutes_medium IS 'SLA breach threshold in minutes for MEDIUM priority unified tickets.';
COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.sla_minutes_high IS 'SLA breach threshold in minutes for HIGH priority unified tickets.';
COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.sla_minutes_urgent IS 'SLA breach threshold in minutes for URGENT priority unified tickets.';
COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.sla_minutes_critical IS 'SLA breach threshold in minutes for CRITICAL priority unified tickets.';

INSERT INTO public.ticket_tags (
  tag_code,
  tag_name,
  tag_description,
  tag_color,
  is_active
)
SELECT
  'SLA_BREACHED',
  'SLA Breached',
  'Applied automatically when SLA due time has passed and ticket is still unresolved.',
  '#DC2626',
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ticket_tags
  WHERE UPPER(tag_code) = 'SLA_BREACHED'
);

-- One-time consistency backfill for already resolved/closed tickets.
UPDATE public.unified_tickets
SET
  resolved_at = COALESCE(resolved_at, updated_at, created_at),
  resolved_by = COALESCE(resolved_by, assigned_to_agent_id),
  resolved_by_name = COALESCE(resolved_by_name, assigned_to_agent_name),
  resolution_time_minutes = COALESCE(
    resolution_time_minutes,
    GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (COALESCE(resolved_at, updated_at, created_at) - created_at)) / 60.0)::INTEGER
    )
  )
WHERE status::text IN ('RESOLVED', 'CLOSED');

UPDATE public.unified_tickets
SET closed_at = COALESCE(closed_at, resolved_at, updated_at, created_at)
WHERE status::text = 'CLOSED';
