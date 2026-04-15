-- Many-to-many: ticket_titles ↔ ticket_tags (admin can assign multiple tags per help topic).
-- Keeps ticket_titles.tag_id as the first tag for legacy readers; sync on write via dashboard API.

CREATE TABLE IF NOT EXISTS public.ticket_title_tags (
  ticket_title_id bigint NOT NULL REFERENCES public.ticket_titles (id) ON DELETE CASCADE,
  tag_id bigint NOT NULL REFERENCES public.ticket_tags (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_title_id, tag_id)
);

CREATE INDEX IF NOT EXISTS ticket_title_tags_tag_id_idx ON public.ticket_title_tags (tag_id);

INSERT INTO public.ticket_title_tags (ticket_title_id, tag_id)
SELECT tt.id, tt.tag_id
FROM public.ticket_titles tt
WHERE tt.tag_id IS NOT NULL
ON CONFLICT (ticket_title_id, tag_id) DO NOTHING;
