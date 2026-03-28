-- Per-user to-do list on the Tickets GatiMitra Queue dashboard (widget "To-do").

CREATE TABLE IF NOT EXISTS public.agent_helpdesk_todos (
  id BIGSERIAL PRIMARY KEY,
  system_user_id INTEGER NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_helpdesk_todos_title_nonempty CHECK (char_length(trim(title)) >= 1)
);

CREATE INDEX IF NOT EXISTS agent_helpdesk_todos_user_sort_idx
  ON public.agent_helpdesk_todos (system_user_id, sort_order ASC, id ASC);

COMMENT ON TABLE public.agent_helpdesk_todos IS 'Personal GatiMitra Queue to-dos per dashboard user; CRUD via GET/POST /api/tickets/helpdesk-todos and PATCH/DELETE /api/tickets/helpdesk-todos/[id].';
