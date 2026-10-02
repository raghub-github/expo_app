-- Geo-engine auto-action policy (Part 2) — Super-Admin tunables on tracking_config
-- (single row id=1). The geo-engine resolves each violation in REAL TIME per these
-- settings instead of leaving it 'open' for an admin queue.
--
-- MONEY-SAFE DEFAULT: auto_action_enabled = true (violations auto-resolve live),
-- but apply_wallet_penalties = false and all penalty amounts = 0, so NOTHING is
-- debited from a rider until an operator sets amounts and flips apply_wallet_penalties
-- on the Real-time Tracking & Geo-Scoping config page.
--
-- Idempotent (IF NOT EXISTS). Reversible (see _rollback.sql).

ALTER TABLE public.tracking_config
  ADD COLUMN IF NOT EXISTS auto_action_enabled      boolean NOT NULL DEFAULT true,
  -- Master money gate — real wallet deductions ONLY when this is true.
  ADD COLUMN IF NOT EXISTS apply_wallet_penalties   boolean NOT NULL DEFAULT false,
  -- Violations below this level auto-dismiss; at/above it are "serious".
  ADD COLUMN IF NOT EXISTS penalize_min_level       integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS dismiss_below_min_level  boolean NOT NULL DEFAULT true,
  -- Flat penalty (₹, rupees) per serious violation, per type. 0 = mark-only.
  ADD COLUMN IF NOT EXISTS penalty_long_stop        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_wrong_direction  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_route_deviation  integer NOT NULL DEFAULT 0,
  -- Safety cap: max total geo-penalty ₹ charged to a rider for one order.
  ADD COLUMN IF NOT EXISTS per_order_penalty_cap    integer NOT NULL DEFAULT 100;
