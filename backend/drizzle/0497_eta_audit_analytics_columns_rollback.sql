-- Rollback 0497_eta_audit_analytics_columns.sql
DROP INDEX IF EXISTS public.idx_order_eta_history_store_created;
DROP INDEX IF EXISTS public.idx_order_eta_history_source;
DROP INDEX IF EXISTS public.idx_order_eta_history_stage;

ALTER TABLE public.order_eta_history
  DROP COLUMN IF EXISTS new_snapshot,
  DROP COLUMN IF EXISTS previous_snapshot,
  DROP COLUMN IF EXISTS delta_minutes,
  DROP COLUMN IF EXISTS eta_source,
  DROP COLUMN IF EXISTS freeze_countdown,
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS total_eta_minutes,
  DROP COLUMN IF EXISTS display_eta_minutes,
  DROP COLUMN IF EXISTS current_stage,
  DROP COLUMN IF EXISTS order_status;
