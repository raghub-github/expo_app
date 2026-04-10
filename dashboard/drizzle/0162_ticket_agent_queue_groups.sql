-- Queue supervisor: per-agent primary & secondary ticket group arrays (Postgres bigint[]).
-- Replaces flat ticket_agent_queue_groups if present.
-- Also: singleton row for 2:1 round-robin (2 primary-tier picks, then 1 secondary-tier pick).

DROP TABLE IF EXISTS public.ticket_agent_queue_groups;

CREATE TABLE IF NOT EXISTS public.ticket_agent_queue_assignments (
  system_user_id bigint PRIMARY KEY REFERENCES public.system_users (id) ON DELETE CASCADE,
  primary_group_ids bigint[] NOT NULL DEFAULT '{}',
  secondary_group_ids bigint[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_agent_queue_assignments_primary
  ON public.ticket_agent_queue_assignments USING gin (primary_group_ids);

CREATE INDEX IF NOT EXISTS idx_ticket_agent_queue_assignments_secondary
  ON public.ticket_agent_queue_assignments USING gin (secondary_group_ids);

-- id = 1 only: primary_slots_remaining counts how many of the next consecutive auto-assigns
-- should prefer the primary pool (starts at 2, then one secondary, then reset to 2).
CREATE TABLE IF NOT EXISTS public.ticket_auto_assign_distribution (
  id smallint PRIMARY KEY,
  primary_slots_remaining smallint NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_auto_assign_distribution_singleton CHECK (id = 1)
);

INSERT INTO public.ticket_auto_assign_distribution (id, primary_slots_remaining) VALUES (1, 2)
ON CONFLICT (id) DO NOTHING;
