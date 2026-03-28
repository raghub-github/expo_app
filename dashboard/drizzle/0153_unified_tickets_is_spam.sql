-- Spam flag persisted independently of ticket status (agents can change status without losing spam marking).
ALTER TABLE public.unified_tickets
  ADD COLUMN IF NOT EXISTS is_spam BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.unified_tickets.is_spam IS 'True when the ticket was marked as spam; independent of unified_ticket_status.';

-- Historical rows that were closed as spam via REJECTED status only.
UPDATE public.unified_tickets
SET is_spam = true
WHERE status::text = 'REJECTED'
  AND COALESCE(is_spam, false) = false;
