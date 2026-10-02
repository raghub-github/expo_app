-- Rollback 0642 — drop the geo-engine auto-action policy columns.
ALTER TABLE public.tracking_config
  DROP COLUMN IF EXISTS auto_action_enabled,
  DROP COLUMN IF EXISTS apply_wallet_penalties,
  DROP COLUMN IF EXISTS penalize_min_level,
  DROP COLUMN IF EXISTS dismiss_below_min_level,
  DROP COLUMN IF EXISTS penalty_long_stop,
  DROP COLUMN IF EXISTS penalty_wrong_direction,
  DROP COLUMN IF EXISTS penalty_route_deviation,
  DROP COLUMN IF EXISTS per_order_penalty_cap;
