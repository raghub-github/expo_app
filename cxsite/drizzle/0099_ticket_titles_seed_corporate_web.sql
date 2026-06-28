-- Run after 0097 (and 0098 if used) has COMMITTED. Uses enum labels added in a prior transaction (avoids 55P04).

INSERT INTO public.ticket_titles (
  group_id,
  service_type,
  ticket_section,
  source_role,
  title_code,
  title_text,
  description,
  display_order,
  is_active
)
SELECT
  58,
  'GENERAL'::public.ticket_service_type,
  'CORPORATE'::public.ticket_section,
  'WEB_FORM'::public.ticket_source_role,
  'CORPORATE_WEB',
  'Corporate web enquiry',
  'Leads from the public GatiMitra /corporates form',
  0,
  true
WHERE EXISTS (SELECT 1 FROM public.ticket_groups WHERE id = 58)
ON CONFLICT (title_code) DO NOTHING;
