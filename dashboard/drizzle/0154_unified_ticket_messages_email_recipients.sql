-- Outbound email routing for agent TEXT replies/forwards (persist To / Cc / Bcc actually used).

ALTER TABLE public.unified_ticket_messages
  ADD COLUMN IF NOT EXISTS email_recipient_to TEXT,
  ADD COLUMN IF NOT EXISTS email_recipient_cc TEXT,
  ADD COLUMN IF NOT EXISTS email_recipient_bcc TEXT;

COMMENT ON COLUMN public.unified_ticket_messages.email_recipient_to IS 'Comma-separated To addresses for this outbound agent TEXT message (reply/forward).';
COMMENT ON COLUMN public.unified_ticket_messages.email_recipient_cc IS 'Comma-separated Cc including support fallback when applicable.';
COMMENT ON COLUMN public.unified_ticket_messages.email_recipient_bcc IS 'Comma-separated Bcc addresses when set by the agent.';
