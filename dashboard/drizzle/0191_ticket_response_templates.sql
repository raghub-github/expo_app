-- Queue Manager-managed canned responses used in Ticket Conversation composer.
-- Replaces hardcoded QUICK_REPLY_TEMPLATES and KNOWLEDGE_BASE_SNIPPETS.

CREATE TABLE IF NOT EXISTS public.ticket_response_templates (
  id BIGSERIAL PRIMARY KEY,
  template_type TEXT NOT NULL CHECK (template_type IN ('quick_reply', 'knowledge_base')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_system_user_id BIGINT NULL REFERENCES public.system_users(id) ON DELETE SET NULL,
  updated_by_system_user_id BIGINT NULL REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_response_templates_type_active_sort
  ON public.ticket_response_templates(template_type, is_active, sort_order, id);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'quick_reply', 'Acknowledgement', 'Thank you for contacting us. We will get back to you shortly.', 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'quick_reply'
    AND content = 'Thank you for contacting us. We will get back to you shortly.'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'quick_reply', 'Request received', 'We have received your request and are looking into it.', 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'quick_reply'
    AND content = 'We have received your request and are looking into it.'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'quick_reply', 'Need details', 'Could you please provide more details?', 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'quick_reply'
    AND content = 'Could you please provide more details?'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'quick_reply', 'Issue resolved', 'This has been resolved. Let us know if you need anything else.', 40
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'quick_reply'
    AND content = 'This has been resolved. Let us know if you need anything else.'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'knowledge_base', 'Resolution time', 'Typical resolution time for requests like yours is 24–48 business hours. We will update you as soon as we have progress.', 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'knowledge_base'
    AND content = 'Typical resolution time for requests like yours is 24–48 business hours. We will update you as soon as we have progress.'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'knowledge_base', 'Required details', 'To help us resolve this faster, please share your order ID and, if possible, a screenshot of the invoice or the issue you are seeing.', 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'knowledge_base'
    AND content = 'To help us resolve this faster, please share your order ID and, if possible, a screenshot of the invoice or the issue you are seeing.'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'knowledge_base', 'Track order', 'You can check live order status anytime in the GatiMitra app under Orders → Active.', 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'knowledge_base'
    AND content = 'You can check live order status anytime in the GatiMitra app under Orders → Active.'
);

INSERT INTO public.ticket_response_templates (template_type, title, content, sort_order)
SELECT 'knowledge_base', 'Escalation info', 'If the issue continues after these steps, we will escalate to our logistics partner and follow up within one business day.', 40
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_response_templates
  WHERE template_type = 'knowledge_base'
    AND content = 'If the issue continues after these steps, we will escalate to our logistics partner and follow up within one business day.'
);

COMMENT ON TABLE public.ticket_response_templates IS 'Queue Manager managed canned responses for ticket reply composer (quick replies + knowledge base snippets).';
