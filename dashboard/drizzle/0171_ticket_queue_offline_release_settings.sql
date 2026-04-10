-- Manager controls: whether going fully offline releases open assignments, and batch cap.

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS release_assignments_when_agent_offline boolean NOT NULL DEFAULT true;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD COLUMN IF NOT EXISTS offline_release_max_tickets integer NOT NULL DEFAULT 200;

UPDATE public.ticket_queue_auto_assign_settings
SET offline_release_max_tickets = GREATEST(1, LEAST(500, offline_release_max_tickets))
WHERE id = 1;

ALTER TABLE public.ticket_queue_auto_assign_settings
  DROP CONSTRAINT IF EXISTS ticket_queue_offline_release_max_check;

ALTER TABLE public.ticket_queue_auto_assign_settings
  ADD CONSTRAINT ticket_queue_offline_release_max_check
  CHECK (offline_release_max_tickets >= 1 AND offline_release_max_tickets <= 500);

COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.release_assignments_when_agent_offline IS
  'When true, agents who set status to fully offline (not break/busy) trigger release + re-queue of their open tickets.';

COMMENT ON COLUMN public.ticket_queue_auto_assign_settings.offline_release_max_tickets IS
  'Max open tickets to release per offline event (1–500).';
