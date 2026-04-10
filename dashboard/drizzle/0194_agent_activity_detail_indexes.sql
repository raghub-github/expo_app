-- Speeds up Agent Activity "View details" counters.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS unified_ticket_messages_sender_created_idx
  ON public.unified_ticket_messages (sender_id, created_at DESC)
  WHERE sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS unified_ticket_messages_sender_internal_created_idx
  ON public.unified_ticket_messages (sender_id, is_internal_note, created_at DESC)
  WHERE sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_prev_assignee_created_idx
  ON public.unified_ticket_activity_audit (previous_assignee_user_id, created_at DESC)
  WHERE previous_assignee_user_id IS NOT NULL;
