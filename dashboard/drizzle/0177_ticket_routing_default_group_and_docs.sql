-- Default queue when automation rules leave a ticket without group_id (fallback routing).
-- Safe to re-run.

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS default_routing_group_id bigint NULL;

COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.default_routing_group_id IS
  'Optional fallback queue: applied after ticket_created / ticket_updated / ticket_reopened automation when group_id is still NULL. Configure in Manager → Queue settings.';

DO $$
BEGIN
  IF to_regclass('public.ticket_groups') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ticket_queue_auto_assign_settings_default_routing_group_id_fkey'
      AND conrelid = 'public.ticket_queue_auto_assign_settings'::regclass
  ) THEN
    ALTER TABLE public.ticket_queue_auto_assign_settings
      ADD CONSTRAINT ticket_queue_auto_assign_settings_default_routing_group_id_fkey
      FOREIGN KEY (default_routing_group_id) REFERENCES public.ticket_groups (id) ON DELETE SET NULL;
  END IF;
END $$;
