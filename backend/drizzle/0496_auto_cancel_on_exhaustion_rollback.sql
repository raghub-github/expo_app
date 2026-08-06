-- Rollback for 0496_auto_cancel_on_exhaustion.sql
ALTER TABLE public.platform_rider_dispatch_strategy_config
  DROP COLUMN IF EXISTS auto_cancel_on_exhaustion;
