-- Commission Engine v2 — Phase 3 of 4
--
-- Append-only audit trail for every commission-affecting decision: default %
-- changes, per-store rule lifecycle, subscription activations/expiries.
-- Required by the merchant rate-history endpoint and admin compliance reports.

CREATE TABLE IF NOT EXISTS public.commission_audit_log (
  id BIGSERIAL PRIMARY KEY,

  store_id BIGINT NULL,
  plan_id  BIGINT NULL,

  action TEXT NOT NULL,
  -- One of: 'DEFAULT_CHANGED', 'RULE_CREATED', 'RULE_UPDATED', 'RULE_DEACTIVATED',
  --        'PLAN_BENEFIT_UPDATED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXPIRED'

  old_value JSONB NULL,
  new_value JSONB NULL,

  actor_id   INTEGER NULL,
  actor_role TEXT    NULL,
  reason     TEXT    NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT commission_audit_log_action_check
    CHECK (action IN (
      'DEFAULT_CHANGED',
      'RULE_CREATED',
      'RULE_UPDATED',
      'RULE_DEACTIVATED',
      'PLAN_BENEFIT_UPDATED',
      'SUBSCRIPTION_ACTIVATED',
      'SUBSCRIPTION_EXPIRED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_cal_store   ON public.commission_audit_log(store_id, created_at DESC) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cal_plan    ON public.commission_audit_log(plan_id, created_at DESC)  WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cal_action  ON public.commission_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_created ON public.commission_audit_log(created_at DESC);
