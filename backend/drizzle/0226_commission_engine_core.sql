-- Commission Engine v2 — Phase 1 of 4
--
-- Extends existing tables so the new resolver can read:
--   merchant_plans.commission_percent_override   -> subscription-driven commission %
--   merchant_plans.commission_benefit_active     -> on/off switch for the plan benefit
--   merchant_store_commission_rules.priority     -> tie-break when multiple rules overlap
--   merchant_store_commission_rules.source_kind  -> distinguishes manual overrides from promos
--   merchant_store_commission_rules.approved_by  -> super-admin actor for audit
--   merchant_store_commission_rules.reason       -> free-text justification
--
-- Existing data is preserved. Defaults backfill safely: source_kind='MANUAL_OVERRIDE'
-- so any row that already exists is treated as an admin-set override.

ALTER TABLE public.merchant_plans
  ADD COLUMN IF NOT EXISTS commission_percent_override NUMERIC(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS commission_benefit_active   BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.merchant_store_commission_rules
  ADD COLUMN IF NOT EXISTS priority    SMALLINT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS source_kind TEXT     NOT NULL DEFAULT 'MANUAL_OVERRIDE',
  ADD COLUMN IF NOT EXISTS approved_by INTEGER  NULL,
  ADD COLUMN IF NOT EXISTS reason      TEXT     NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'merchant_store_commission_rules'
      AND constraint_name = 'merchant_store_commission_rules_source_kind_check'
  ) THEN
    ALTER TABLE public.merchant_store_commission_rules
      ADD CONSTRAINT merchant_store_commission_rules_source_kind_check
      CHECK (source_kind IN ('MANUAL_OVERRIDE', 'PROMOTIONAL', 'SUBSCRIPTION_BENEFIT'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_msc_rules_active_lookup
  ON public.merchant_store_commission_rules (store_id, is_active, effective_from DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_msc_rules_active_parent_lookup
  ON public.merchant_store_commission_rules (parent_id, is_active, effective_from DESC)
  WHERE is_active = true;
