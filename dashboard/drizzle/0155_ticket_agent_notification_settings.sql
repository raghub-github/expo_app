-- Server-side templates for emailing agents on ticket assign / reopen (managed from Dashboard → Automation).

CREATE TABLE IF NOT EXISTS public.ticket_agent_notification_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  assign_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reopen_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assign_subject_template TEXT NOT NULL DEFAULT 'Ticket assigned to you — {{ticket_subject}}',
  assign_body_template TEXT NOT NULL DEFAULT E'Hi {{agent_name}},\n\nThis ticket has been assigned to you.\n\n{{ticket_subject}}\n\nOpen ticket:\n{{ticket_url}}\n',
  reopen_subject_template TEXT NOT NULL DEFAULT 'Ticket reopened — {{ticket_subject}}',
  reopen_body_template TEXT NOT NULL DEFAULT E'Hi {{agent_name}},\n\nThis ticket was reopened.\n\nPrevious status: {{previous_status}}\nCurrent status: {{current_status}}\n\n{{ticket_subject}}\n\nOpen ticket:\n{{ticket_url}}\n',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ticket_agent_notification_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.ticket_agent_notification_settings IS 'Single-row config: email templates when a ticket is assigned or reopened (placeholders {{agent_name}}, {{ticket_subject}}, {{ticket_number}}, {{ticket_url}}, {{previous_status}}, {{current_status}}).';
