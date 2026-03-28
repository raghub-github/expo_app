-- Server-side email automation when a ticket is assigned or reopened (templates + To/Cc/Bcc).

CREATE TABLE IF NOT EXISTS public.ticket_notification_automation (
  event_code TEXT PRIMARY KEY CHECK (event_code IN ('ticket_assigned', 'ticket_reopened')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  email_to TEXT NOT NULL DEFAULT '{{agent_email}}',
  email_cc TEXT NOT NULL DEFAULT '',
  email_bcc TEXT NOT NULL DEFAULT '',
  subject_template TEXT NOT NULL DEFAULT '',
  body_template TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_notification_automation IS 'Templates for outbound emails on ticket_assigned and ticket_reopened; placeholders {{agent_name}}, {{agent_email}}, {{ticket_ref}}, {{subject}}, {{ticket_url}}, {{raised_by_name}}, {{raised_by_mobile}}, {{raised_by_email}}, {{status}}.';

INSERT INTO public.ticket_notification_automation (event_code, enabled, email_to, email_cc, email_bcc, subject_template, body_template)
VALUES
  (
    'ticket_assigned',
    false,
    '{{agent_email}}',
    '',
    '',
    'Ticket assigned to you - {{subject}}',
    E'Hi {{agent_name}},\n\nA ticket has been assigned to you.\n\nSubject: {{subject}}\nTicket: {{ticket_ref}}\nStatus: {{status}}\n\nOpen in dashboard:\n{{ticket_url}}\n'
  ),
  (
    'ticket_reopened',
    false,
    '{{agent_email}}',
    '',
    '',
    'Ticket reopened - {{subject}}',
    E'Hi {{agent_name}},\n\nA ticket assigned to you has been reopened.\n\nSubject: {{subject}}\nTicket: {{ticket_ref}}\nStatus: {{status}}\n\nOpen in dashboard:\n{{ticket_url}}\n'
  )
ON CONFLICT (event_code) DO NOTHING;
