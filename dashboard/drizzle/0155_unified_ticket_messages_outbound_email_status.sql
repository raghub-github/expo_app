-- Track agent outbound email result for helpdesk "Undelivered" style reporting.
ALTER TABLE public.unified_ticket_messages
  ADD COLUMN IF NOT EXISTS outbound_email_status TEXT;

COMMENT ON COLUMN public.unified_ticket_messages.outbound_email_status IS
  'For agent TEXT replies with email dispatch: sent | failed. NULL when not applicable (notes, non-email).';

CREATE INDEX IF NOT EXISTS unified_ticket_messages_outbound_email_failed_idx
  ON public.unified_ticket_messages (ticket_id)
  WHERE outbound_email_status = 'failed';
