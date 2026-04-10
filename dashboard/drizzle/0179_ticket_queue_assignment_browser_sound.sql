-- Browser buzzer when a new ticket lands in an agent's queue (Manager → Queue alert sound).
-- Creates ticket_agent_notification_settings if missing (e.g. migration 0155 not applied yet).

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

ALTER TABLE public.ticket_agent_notification_settings
  ADD COLUMN IF NOT EXISTS queue_assignment_sound_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.ticket_agent_notification_settings
  ADD COLUMN IF NOT EXISTS queue_assignment_sound_url text NOT NULL DEFAULT '/notification.wav';

COMMENT ON TABLE public.ticket_agent_notification_settings IS
  'Single-row config: email templates when a ticket is assigned or reopened; optional browser queue alert sound.';

COMMENT ON COLUMN public.ticket_agent_notification_settings.queue_assignment_sound_enabled IS
  'When true, agents on /queue/home hear a short sound when a new ticket appears in their current list view.';

COMMENT ON COLUMN public.ticket_agent_notification_settings.queue_assignment_sound_url IS
  'Same-origin path to an audio file (e.g. /notification.wav or /uploads/ticket-queue/...).';
