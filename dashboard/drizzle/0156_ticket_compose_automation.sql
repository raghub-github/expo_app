-- Legacy: per-user row (system_user_id PK). For global single-row schema and migration off this shape, run 0159_ticket_compose_automation_global.sql.

CREATE TABLE IF NOT EXISTS public.ticket_compose_automation (
  system_user_id INTEGER PRIMARY KEY REFERENCES public.system_users(id) ON DELETE CASCADE,
  default_to TEXT NOT NULL DEFAULT '',
  default_cc TEXT NOT NULL DEFAULT '',
  default_bcc TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_compose_automation IS 'Saved reply-composer defaults per dashboard user; empty Cc is allowed — outbound send may still add support CC on the server.';

CREATE INDEX IF NOT EXISTS ticket_compose_automation_updated_at_idx ON public.ticket_compose_automation(updated_at DESC);
