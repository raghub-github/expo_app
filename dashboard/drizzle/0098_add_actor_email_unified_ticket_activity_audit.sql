-- Store complete actor email in activity audit so UI shows email, not primary key.
ALTER TABLE public.unified_ticket_activity_audit
  ADD COLUMN IF NOT EXISTS actor_email TEXT NULL;

COMMENT ON COLUMN public.unified_ticket_activity_audit.actor_email IS 'Full email of the actor (e.g. agent) for display in activity timeline; do not show primary key.';
