-- Add sla_due_at to unified_tickets for overdue status and SLA tracking
ALTER TABLE public.unified_tickets
  ADD COLUMN IF NOT EXISTS sla_due_at timestamp with time zone NULL;

COMMENT ON COLUMN public.unified_tickets.sla_due_at IS 'SLA due datetime; when past, ticket is considered overdue';
