-- Nested ticket titles (e.g. help topics under a parent heading). Optional self-referential FK.

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS parent_title_id bigint REFERENCES public.ticket_titles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ticket_titles_parent_title_id_idx
  ON public.ticket_titles (parent_title_id)
  WHERE parent_title_id IS NOT NULL;

COMMENT ON COLUMN public.ticket_titles.parent_title_id IS 'Optional parent row for dashboard tree / grouped catalog under one title.';
