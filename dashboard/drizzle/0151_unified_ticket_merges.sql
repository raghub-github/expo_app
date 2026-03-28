-- Track ticket merge operations (many duplicate tickets into one primary ticket)
CREATE TABLE IF NOT EXISTS public.unified_ticket_merges (
  id BIGSERIAL PRIMARY KEY,
  primary_ticket_id BIGINT NOT NULL REFERENCES public.unified_tickets(id) ON DELETE CASCADE,
  merged_ticket_id BIGINT NOT NULL REFERENCES public.unified_tickets(id) ON DELETE CASCADE,
  merged_by_user_id BIGINT NULL REFERENCES public.system_users(id) ON DELETE SET NULL,
  merged_by_email TEXT NULL,
  reason TEXT NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (primary_ticket_id <> merged_ticket_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS unified_ticket_merges_merged_ticket_id_uidx
  ON public.unified_ticket_merges(merged_ticket_id);

CREATE INDEX IF NOT EXISTS unified_ticket_merges_primary_ticket_id_idx
  ON public.unified_ticket_merges(primary_ticket_id);

CREATE INDEX IF NOT EXISTS unified_ticket_merges_merged_at_idx
  ON public.unified_ticket_merges(merged_at DESC);

