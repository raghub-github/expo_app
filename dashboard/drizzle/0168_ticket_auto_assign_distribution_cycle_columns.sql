-- Configurable N:M primary:secondary round-robin (runtime + per-cycle counts).

ALTER TABLE public.ticket_auto_assign_distribution
  ADD COLUMN IF NOT EXISTS primary_per_cycle smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS secondary_per_cycle smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS secondary_slots_remaining smallint NOT NULL DEFAULT 0;

COMMENT ON TABLE public.ticket_auto_assign_distribution IS
  'Singleton id=1: round-robin queue assign. primary_per_cycle / secondary_per_cycle = pattern; primary_slots_remaining / secondary_slots_remaining = runtime.';
