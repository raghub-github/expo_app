-- Phase 3: denormalized ETA audit columns for SLA / analytics queries.
-- History remains append-only; metadata JSON remains the full snapshot.
-- eta_version is the row id (set after insert); clients already use id as version.

ALTER TABLE public.order_eta_history
  ADD COLUMN IF NOT EXISTS order_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS current_stage TEXT NULL,
  ADD COLUMN IF NOT EXISTS display_eta_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS total_eta_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS confidence TEXT NULL,
  ADD COLUMN IF NOT EXISTS freeze_countdown BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS eta_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS delta_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS previous_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS new_snapshot JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_order_eta_history_stage
  ON public.order_eta_history (current_stage)
  WHERE current_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_eta_history_source
  ON public.order_eta_history (eta_source)
  WHERE eta_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_eta_history_store_created
  ON public.order_eta_history (merchant_store_id, created_at DESC)
  WHERE merchant_store_id IS NOT NULL;
