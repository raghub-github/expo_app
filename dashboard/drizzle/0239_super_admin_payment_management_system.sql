-- ============================================================================
-- 0239: Super Admin Payment Management System (production upgrade)
-- Extends existing merchant_wallet / ledger / payout architecture.
-- Run AFTER: merchant_wallet.sql, merchant_wallet_v2, v3, 0238.
-- Safe to re-run: idempotent DDL (IF NOT EXISTS / exception guards).
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE payment_calculation_mode AS ENUM ('FIXED', 'PERCENTAGE', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_transaction_status AS ENUM (
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_settlement_lifecycle_status AS ENUM (
    'PENDING', 'DELIVERED', 'LOCKED', 'HOLD', 'AVAILABLE', 'SETTLED', 'REVERSED', 'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_order_milestone AS ENUM (
    'ORDER_CREATED',
    'ORDER_ACCEPTED',
    'MERCHANT_PREPARING',
    'RIDER_ASSIGNED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED_AFTER_DELIVERED',
    'FAILED_DELIVERY',
    'CUSTOMER_CANCELLED',
    'MERCHANT_CANCELLED',
    'RIDER_CANCELLED',
    'ADMIN_CANCELLED',
    'SYSTEM_CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_cancelled_by AS ENUM (
    'CUSTOMER', 'MERCHANT', 'RIDER', 'ADMIN', 'SYSTEM', 'PLATFORM'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_wallet_party_type AS ENUM ('MERCHANT', 'RIDER', 'PLATFORM', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_gateway_provider AS ENUM ('RAZORPAY', 'CASHFREE', 'STRIPE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_reconciliation_type AS ENUM (
    'DAILY_WALLET', 'GATEWAY', 'PAYOUT', 'SETTLEMENT', 'REFUND'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_audit_action AS ENUM (
    'RULE_CREATED', 'RULE_UPDATED', 'RULE_DEACTIVATED',
    'PAYOUT_APPROVED', 'PAYOUT_REJECTED', 'PAYOUT_RETRIED', 'PAYOUT_REVERSED',
    'WALLET_FROZEN', 'WALLET_UNFROZEN', 'SETTLEMENT_PAUSED', 'SETTLEMENT_RESUMED',
    'REFUND_PROCESSED', 'REVERSAL_PROCESSED', 'COMMISSION_CHANGED', 'GLOBAL_SETTING_CHANGED',
    'MANUAL_OVERRIDE', 'FRAUD_FLAGGED', 'CHARGEBACK_RECORDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend payout status (backward compatible with COMPLETED)
DO $$ BEGIN ALTER TYPE payout_request_status_type ADD VALUE 'SUCCESS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'SETTLEMENT_REVERSAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'CHARGEBACK'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'PAYOUT_HOLD'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'PAYOUT_RELEASE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. SUPER ADMIN CONFIG TABLES (no hardcoded percentages — all DB-driven)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_global_settings (
  id BIGSERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_global_settings_key_version_uniq UNIQUE (setting_key, version)
);

CREATE INDEX IF NOT EXISTS payment_global_settings_key_active_idx
  ON public.payment_global_settings(setting_key, is_active, effective_from DESC);

COMMENT ON TABLE public.payment_global_settings IS
  'Platform-wide payment knobs: settlement pause, auto-release cron, fraud thresholds, default hold hours, etc.';

CREATE TABLE IF NOT EXISTS public.payment_cancellation_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  order_milestone payment_order_milestone NOT NULL,
  cancelled_by payment_cancelled_by,
  service_type TEXT DEFAULT 'FOOD',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Merchant / rider / platform / customer outcomes (all configurable)
  merchant_gets_payment BOOLEAN NOT NULL DEFAULT FALSE,
  merchant_payment_mode payment_calculation_mode,
  merchant_payment_value NUMERIC(12, 4),
  rider_gets_payment BOOLEAN NOT NULL DEFAULT FALSE,
  rider_payment_mode payment_calculation_mode,
  rider_payment_value NUMERIC(12, 4),
  platform_keeps_commission BOOLEAN NOT NULL DEFAULT TRUE,
  customer_refund_mode TEXT NOT NULL DEFAULT 'NONE'
    CHECK (customer_refund_mode IN ('NONE', 'FULL', 'PARTIAL', 'PLATFORM_POLICY')),
  customer_refund_mode_calc payment_calculation_mode,
  customer_refund_value NUMERIC(12, 4),
  apply_penalty BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_mode payment_calculation_mode,
  penalty_value NUMERIC(12, 4),
  metadata JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  updated_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_cancellation_rules_code_uniq UNIQUE (rule_code)
);

CREATE INDEX IF NOT EXISTS payment_cancellation_rules_lookup_idx
  ON public.payment_cancellation_rules(is_active, order_milestone, cancelled_by, priority);

COMMENT ON TABLE public.payment_cancellation_rules IS
  'Dynamic cancellation payment engine rules by order milestone and cancelled_by.';

CREATE TABLE IF NOT EXISTS public.payment_settlement_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'FOOD',
  order_milestone payment_order_milestone NOT NULL DEFAULT 'DELIVERED',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Delivered-order splits (merchant / rider / platform)
  merchant_share_mode payment_calculation_mode NOT NULL DEFAULT 'PERCENTAGE',
  merchant_share_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
  rider_share_mode payment_calculation_mode NOT NULL DEFAULT 'PERCENTAGE',
  rider_share_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
  platform_commission_mode payment_calculation_mode NOT NULL DEFAULT 'PERCENTAGE',
  platform_commission_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
  include_packaging BOOLEAN NOT NULL DEFAULT TRUE,
  include_surge_in_rider BOOLEAN NOT NULL DEFAULT TRUE,
  include_tips_mode TEXT NOT NULL DEFAULT 'RIDER'
    CHECK (include_tips_mode IN ('RIDER', 'MERCHANT', 'SPLIT', 'PLATFORM')),
  tips_split_merchant_pct NUMERIC(5, 2) DEFAULT 0,
  tips_split_rider_pct NUMERIC(5, 2) DEFAULT 100,
  auto_settlement_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  settlement_delay_hours INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_settlement_rules IS
  'Delivered-order settlement split rules (fixed / percent / hybrid).';

CREATE TABLE IF NOT EXISTS public.payment_tax_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  party_type payment_wallet_party_type NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('GST', 'TDS', 'CESS', 'OTHER')),
  calculation_mode payment_calculation_mode NOT NULL DEFAULT 'PERCENTAGE',
  tax_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
  applies_on TEXT NOT NULL DEFAULT 'MERCHANT_NET'
    CHECK (applies_on IN ('ORDER_GROSS', 'MERCHANT_NET', 'COMMISSION', 'PAYOUT', 'RIDER_EARNING')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_tax_rules IS 'GST / TDS and other tax rules — all values admin-configurable.';

CREATE TABLE IF NOT EXISTS public.payment_commission_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  merchant_parent_id BIGINT REFERENCES public.merchant_parents(id) ON DELETE CASCADE,
  merchant_store_id BIGINT REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL DEFAULT 'FOOD',
  calculation_mode payment_calculation_mode NOT NULL DEFAULT 'PERCENTAGE',
  commission_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
  min_commission NUMERIC(12, 2) DEFAULT 0,
  max_commission NUMERIC(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_commission_rules_scope_check
    CHECK (merchant_store_id IS NOT NULL OR merchant_parent_id IS NOT NULL OR rule_code LIKE 'DEFAULT%')
);

CREATE INDEX IF NOT EXISTS payment_commission_rules_store_idx
  ON public.payment_commission_rules(merchant_store_id, is_active, effective_from DESC)
  WHERE merchant_store_id IS NOT NULL;

COMMENT ON TABLE public.payment_commission_rules IS
  'Admin commission rules per store/parent; complements platform_commission_rules.';

CREATE TABLE IF NOT EXISTS public.payment_payout_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  party_type payment_wallet_party_type NOT NULL DEFAULT 'MERCHANT',
  min_payout_amount NUMERIC(14, 2) NOT NULL DEFAULT 100,
  max_payout_amount NUMERIC(14, 2),
  requires_admin_approval BOOLEAN NOT NULL DEFAULT TRUE,
  auto_approve_below NUMERIC(14, 2),
  max_daily_payout NUMERIC(14, 2),
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_delay_minutes INTEGER NOT NULL DEFAULT 30,
  commission_at_payout BOOLEAN NOT NULL DEFAULT FALSE,
  payout_commission_mode payment_calculation_mode,
  payout_commission_value NUMERIC(12, 4),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_payout_rules IS 'Merchant/rider payout thresholds, approval, retry policy.';

CREATE TABLE IF NOT EXISTS public.payment_hold_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  party_type payment_wallet_party_type NOT NULL DEFAULT 'MERCHANT',
  hold_hours INTEGER NOT NULL DEFAULT 72,
  auto_release_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  release_cron_expression TEXT DEFAULT '0 */6 * * *',
  locked_to_available_on_release BOOLEAN NOT NULL DEFAULT TRUE,
  settlement_paused BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_hold_rules IS
  'DELIVERED → LOCKED → HOLD → AVAILABLE lifecycle timing (cron-safe release).';

CREATE TABLE IF NOT EXISTS public.payment_refund_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  refund_trigger TEXT NOT NULL
    CHECK (refund_trigger IN ('CANCELLATION', 'PARTIAL_ITEMS', 'CHARGEBACK', 'ADMIN', 'QUALITY')),
  customer_refund_mode payment_calculation_mode NOT NULL DEFAULT 'PERCENTAGE',
  customer_refund_value NUMERIC(12, 4) NOT NULL DEFAULT 100,
  reverse_merchant_settlement BOOLEAN NOT NULL DEFAULT TRUE,
  reverse_rider_settlement BOOLEAN NOT NULL DEFAULT TRUE,
  reverse_platform_commission BOOLEAN NOT NULL DEFAULT TRUE,
  auto_reverse_if_settled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_refund_rules IS 'Refund & post-settlement reversal policy.';

CREATE TABLE IF NOT EXISTS public.payment_penalty_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  party_type payment_wallet_party_type NOT NULL,
  penalty_trigger TEXT NOT NULL,
  calculation_mode payment_calculation_mode NOT NULL DEFAULT 'FIXED',
  penalty_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_settings (
  id BIGSERIAL PRIMARY KEY,
  provider payment_gateway_provider NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_gateway_settings_provider_uniq UNIQUE (provider)
);

COMMENT ON TABLE public.payment_gateway_settings IS 'Razorpay / Cashfree / Stripe credentials (encrypted at app layer).';

-- ============================================================================
-- 3. OPERATIONAL TABLES (settlements, refunds, payouts, gateways, reconciliation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_order_settlements (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  orders_food_id BIGINT,
  wallet_id BIGINT NOT NULL REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  settlement_rule_id BIGINT REFERENCES public.payment_settlement_rules(id) ON DELETE SET NULL,
  lifecycle_status payment_settlement_lifecycle_status NOT NULL DEFAULT 'PENDING',
  merchant_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  rider_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  platform_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tds_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  packaging_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  surge_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tips_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  credit_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  release_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  breakdown_id BIGINT REFERENCES public.order_settlement_breakdown(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_order_settlements_order_wallet_uniq UNIQUE (order_id, wallet_id),
  CONSTRAINT payment_order_settlements_idempotency_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_order_settlements_lifecycle_idx
  ON public.payment_order_settlements(lifecycle_status, locked_until)
  WHERE lifecycle_status IN ('LOCKED', 'HOLD');

COMMENT ON TABLE public.payment_order_settlements IS
  'Per-order settlement lifecycle: DELIVERED → LOCKED → HOLD → AVAILABLE. One row per order/wallet.';

CREATE TABLE IF NOT EXISTS public.payment_refund_ledger (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  refund_rule_id BIGINT REFERENCES public.payment_refund_rules(id) ON DELETE SET NULL,
  party_type payment_wallet_party_type NOT NULL,
  wallet_id BIGINT,
  rider_id BIGINT,
  direction wallet_transaction_direction NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status payment_transaction_status NOT NULL DEFAULT 'PENDING',
  merchant_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  reference_type wallet_reference_type NOT NULL DEFAULT 'REFUND',
  reference_id BIGINT,
  idempotency_key TEXT NOT NULL UNIQUE,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_refund_ledger_order_idx ON public.payment_refund_ledger(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_reversal_ledger (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  original_settlement_id BIGINT REFERENCES public.payment_order_settlements(id) ON DELETE SET NULL,
  party_type payment_wallet_party_type NOT NULL,
  wallet_id BIGINT REFERENCES public.merchant_wallet(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status payment_transaction_status NOT NULL DEFAULT 'PENDING',
  merchant_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  chargeback_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.payment_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  party_type payment_wallet_party_type NOT NULL,
  merchant_store_id BIGINT REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  rider_id BIGINT,
  account_holder_name TEXT NOT NULL,
  account_number_masked TEXT NOT NULL,
  account_number_hash TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_name TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_bank_accounts_party_idx
  ON public.payment_bank_accounts(party_type, merchant_store_id, rider_id)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.payment_payout_approvals (
  id BIGSERIAL PRIMARY KEY,
  payout_request_id BIGINT NOT NULL,
  payout_type TEXT NOT NULL DEFAULT 'MERCHANT' CHECK (payout_type IN ('MERCHANT', 'RIDER')),
  status payout_request_status_type NOT NULL DEFAULT 'PENDING',
  amount NUMERIC(14, 2) NOT NULL,
  net_amount NUMERIC(14, 2) NOT NULL,
  risk_score NUMERIC(5, 2) DEFAULT 0,
  approved_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  rejected_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  approval_notes TEXT,
  rejection_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  bank_account_id BIGINT REFERENCES public.payment_bank_accounts(id) ON DELETE SET NULL,
  gateway_provider payment_gateway_provider,
  gateway_payout_id TEXT,
  utr_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_payout_approvals_request_uniq UNIQUE (payout_request_id, payout_type)
);

CREATE TABLE IF NOT EXISTS public.payment_payout_retries (
  id BIGSERIAL PRIMARY KEY,
  payout_approval_id BIGINT NOT NULL REFERENCES public.payment_payout_approvals(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status payment_transaction_status NOT NULL DEFAULT 'PENDING',
  failure_reason TEXT,
  gateway_response JSONB DEFAULT '{}',
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_payout_retries_attempt_uniq UNIQUE (payout_approval_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  provider payment_gateway_provider NOT NULL,
  event_type TEXT NOT NULL,
  external_event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  signature_valid BOOLEAN,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_detected BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  related_order_id BIGINT,
  related_payout_id BIGINT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_logs_dedupe_idx
  ON public.payment_webhook_logs(provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_runs (
  id BIGSERIAL PRIMARY KEY,
  reconciliation_type payment_reconciliation_type NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status payment_transaction_status NOT NULL DEFAULT 'PENDING',
  total_records INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT payment_reconciliation_runs_type_date_uniq UNIQUE (reconciliation_type, run_date)
);

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_mismatches (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES public.payment_reconciliation_runs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  expected_amount NUMERIC(14, 2),
  actual_amount NUMERIC(14, 2),
  delta_amount NUMERIC(14, 2),
  details JSONB NOT NULL DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_wallet_freeze_logs (
  id BIGSERIAL PRIMARY KEY,
  party_type payment_wallet_party_type NOT NULL,
  wallet_id BIGINT REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  previous_status wallet_status_type,
  new_status wallet_status_type NOT NULL,
  reason TEXT NOT NULL,
  frozen_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_fraud_flags (
  id BIGSERIAL PRIMARY KEY,
  party_type payment_wallet_party_type NOT NULL,
  wallet_id BIGINT,
  rider_id BIGINT,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action payment_audit_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  actor_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_audit_logs_entity_idx
  ON public.payment_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_audit_logs_actor_idx
  ON public.payment_audit_logs(actor_system_user_id, created_at DESC);

-- ============================================================================
-- 4. EXTEND EXISTING TABLES (backward compatible)
-- ============================================================================

ALTER TABLE public.merchant_payout_requests
  ADD COLUMN IF NOT EXISTS approved_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_payout_rule_id BIGINT REFERENCES public.payment_payout_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_payout_requests_idempotency_idx
  ON public.merchant_payout_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.merchant_wallet
  ADD COLUMN IF NOT EXISTS settlement_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_settlement_at TIMESTAMPTZ;

ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS payment_settlement_id BIGINT REFERENCES public.payment_order_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_rule_id BIGINT REFERENCES public.payment_settlement_rules(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. IMMUTABLE LEDGER PROTECTION (CREDIT/DEBIT only; no UPDATE/DELETE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_ledger_deny_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'merchant_wallet_ledger is immutable (operation=%)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_wallet_ledger_no_update ON public.merchant_wallet_ledger;
CREATE TRIGGER trg_merchant_wallet_ledger_no_update
  BEFORE UPDATE ON public.merchant_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.merchant_wallet_ledger_deny_mutation();

DROP TRIGGER IF EXISTS trg_merchant_wallet_ledger_no_delete ON public.merchant_wallet_ledger;
CREATE TRIGGER trg_merchant_wallet_ledger_no_delete
  BEFORE DELETE ON public.merchant_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.merchant_wallet_ledger_deny_mutation();

COMMENT ON FUNCTION public.merchant_wallet_ledger_deny_mutation IS
  'Enforces append-only merchant ledger (CREDIT/DEBIT inserts only).';

-- ============================================================================
-- 6. AUDIT + SETTINGS HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_audit_log(
  p_action payment_audit_action,
  p_entity_type TEXT,
  p_entity_id BIGINT,
  p_actor_system_user_id BIGINT,
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id BIGINT;
BEGIN
  INSERT INTO public.payment_audit_logs (
    action, entity_type, entity_id, actor_system_user_id,
    before_state, after_state, notes
  ) VALUES (
    p_action, p_entity_type, p_entity_id, p_actor_system_user_id,
    p_before_state, p_after_state, p_notes
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_get_global_setting(
  p_key TEXT,
  p_default JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT setting_value
      FROM public.payment_global_settings
      WHERE setting_key = p_key
        AND is_active = TRUE
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY version DESC, effective_from DESC
      LIMIT 1
    ),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.payment_calc_amount(
  p_mode payment_calculation_mode,
  p_value NUMERIC,
  p_base NUMERIC,
  p_cap NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v NUMERIC(14, 2);
BEGIN
  IF p_value IS NULL OR p_value < 0 THEN RETURN 0; END IF;
  CASE p_mode
    WHEN 'FIXED' THEN v := p_value;
    WHEN 'PERCENTAGE' THEN v := ROUND((p_base * p_value / 100.0)::numeric, 2);
    WHEN 'HYBRID' THEN
      -- value encodes fixed + pct as JSON in callers; fallback: fixed + 0% of base
      v := p_value;
    ELSE v := 0;
  END CASE;
  IF p_cap IS NOT NULL AND v > p_cap THEN v := p_cap; END IF;
  IF v < 0 THEN v := 0; END IF;
  RETURN v;
END;
$$;

-- ============================================================================
-- 7. CANCELLATION PAYMENT RULE ENGINE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_resolve_cancellation_rule(
  p_milestone payment_order_milestone,
  p_cancelled_by payment_cancelled_by DEFAULT NULL,
  p_service_type TEXT DEFAULT 'FOOD'
)
RETURNS public.payment_cancellation_rules
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_rule public.payment_cancellation_rules;
BEGIN
  SELECT * INTO v_rule
  FROM public.payment_cancellation_rules r
  WHERE r.is_active = TRUE
    AND r.order_milestone = p_milestone
    AND r.service_type = p_service_type
    AND (r.cancelled_by IS NULL OR r.cancelled_by = p_cancelled_by)
    AND r.effective_from <= NOW()
    AND (r.effective_to IS NULL OR r.effective_to > NOW())
  ORDER BY
    CASE WHEN r.cancelled_by IS NOT NULL THEN 0 ELSE 1 END,
    r.priority ASC,
    r.id DESC
  LIMIT 1;
  RETURN v_rule;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_apply_cancellation(
  p_order_id BIGINT,
  p_orders_food_id BIGINT,
  p_milestone payment_order_milestone,
  p_cancelled_by payment_cancelled_by,
  p_order_gross NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_prefix TEXT DEFAULT 'cancel'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.payment_cancellation_rules;
  v_wallet_id BIGINT;
  v_store_id BIGINT;
  v_merchant_amt NUMERIC(14, 2) := 0;
  v_ledger_id BIGINT;
  v_refund_id BIGINT;
  v_key TEXT;
  v_result JSONB := '{}';
BEGIN
  v_rule := public.payment_resolve_cancellation_rule(p_milestone, p_cancelled_by);
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_active_cancellation_rule');
  END IF;

  SELECT f.merchant_store_id INTO v_store_id
  FROM public.orders_food f
  WHERE f.id = p_orders_food_id OR f.order_id = p_order_id
  LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    v_wallet_id := public.get_or_create_merchant_wallet(v_store_id);
  END IF;

  IF v_rule.merchant_gets_payment AND v_wallet_id IS NOT NULL THEN
    v_merchant_amt := public.payment_calc_amount(
      COALESCE(v_rule.merchant_payment_mode, 'FIXED'::payment_calculation_mode),
      COALESCE(v_rule.merchant_payment_value, 0),
      p_order_gross
    );
    IF v_merchant_amt > 0 THEN
      v_key := p_idempotency_prefix || ':merchant:' || p_order_id::text;
      v_ledger_id := public.merchant_wallet_credit(
        v_wallet_id, v_merchant_amt, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
        'PENDING'::wallet_balance_type, 'ORDER'::wallet_reference_type,
        COALESCE(p_orders_food_id, p_order_id), v_key,
        'Cancellation rule credit: ' || v_rule.rule_code, jsonb_build_object('rule_id', v_rule.id)
      );
      v_result := v_result || jsonb_build_object('merchant_ledger_id', v_ledger_id);
    END IF;
  END IF;

  IF v_rule.customer_refund_mode IN ('FULL', 'PARTIAL') THEN
    v_key := p_idempotency_prefix || ':refund:' || p_order_id::text;
    INSERT INTO public.payment_refund_ledger (
      order_id, refund_rule_id, party_type, wallet_id, direction, amount,
      status, idempotency_key, reason, metadata
    ) VALUES (
      p_order_id, NULL, 'CUSTOMER', v_wallet_id, 'CREDIT',
      public.payment_calc_amount(
        COALESCE(v_rule.customer_refund_mode_calc, 'PERCENTAGE'::payment_calculation_mode),
        COALESCE(v_rule.customer_refund_value, 100),
        p_order_gross
      ),
      'PENDING', v_key, 'Cancellation refund per rule ' || v_rule.rule_code,
      jsonb_build_object('rule_id', v_rule.id, 'cancelled_by', p_cancelled_by)
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_refund_id;
    v_result := v_result || jsonb_build_object('refund_ledger_id', v_refund_id);
  END IF;

  PERFORM public.payment_audit_log(
    'REFUND_PROCESSED'::payment_audit_action,
    'payment_cancellation_rules', v_rule.id, p_actor_system_user_id,
    NULL, jsonb_build_object('order_id', p_order_id, 'result', v_result)
  );

  RETURN jsonb_build_object('ok', true, 'rule_code', v_rule.rule_code) || v_result;
END;
$$;

-- ============================================================================
-- 8. DELIVERED ORDER SETTLEMENT (idempotent; uses admin rules)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_resolve_settlement_rule(
  p_service_type TEXT DEFAULT 'FOOD'
)
RETURNS public.payment_settlement_rules
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.payment_settlement_rules r
  WHERE r.is_active = TRUE
    AND r.service_type = p_service_type
    AND r.order_milestone = 'DELIVERED'::payment_order_milestone
    AND r.effective_from <= NOW()
    AND (r.effective_to IS NULL OR r.effective_to > NOW())
  ORDER BY r.priority ASC, r.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.payment_process_delivered_settlement(
  p_order_id BIGINT,
  p_orders_food_id BIGINT,
  p_merchant_store_id BIGINT,
  p_merchant_gross NUMERIC,
  p_packaging NUMERIC DEFAULT 0,
  p_surge NUMERIC DEFAULT 0,
  p_tips NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.payment_settlement_rules;
  v_hold public.payment_hold_rules;
  v_comm public.payment_commission_rules;
  v_tax_gst public.payment_tax_rules;
  v_tax_tds public.payment_tax_rules;
  v_wallet_id BIGINT;
  v_settlement_id BIGINT;
  v_key TEXT;
  v_merchant_net NUMERIC(14, 2);
  v_comm_amt NUMERIC(14, 2);
  v_gst NUMERIC(14, 2);
  v_tds NUMERIC(14, 2);
  v_ledger_id BIGINT;
  v_locked_until TIMESTAMPTZ;
  v_hold_hours INTEGER;
  v_paused BOOLEAN;
BEGIN
  v_key := COALESCE(p_idempotency_key, 'settle:order:' || p_order_id::text);

  IF EXISTS (
    SELECT 1 FROM public.payment_order_settlements
    WHERE idempotency_key = v_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'idempotency_key', v_key);
  END IF;

  PERFORM public.merchant_wallet_assert_order_delivered_for_earning(
    COALESCE(p_orders_food_id, p_order_id)
  );

  v_wallet_id := public.get_or_create_merchant_wallet(p_merchant_store_id);

  SELECT settlement_paused INTO v_paused FROM public.merchant_wallet WHERE id = v_wallet_id;
  IF COALESCE(v_paused, FALSE) THEN
    RAISE EXCEPTION 'Settlement paused for wallet %', v_wallet_id;
  END IF;

  v_rule := public.payment_resolve_settlement_rule('FOOD');
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'No active payment_settlement_rules for DELIVERED';
  END IF;

  SELECT * INTO v_hold
  FROM public.payment_hold_rules h
  WHERE h.is_active = TRUE AND h.party_type = 'MERCHANT'
    AND h.effective_from <= NOW()
    AND (h.effective_to IS NULL OR h.effective_to > NOW())
  ORDER BY h.priority ASC NULLS LAST, h.id DESC
  LIMIT 1;

  v_hold_hours := COALESCE(
    v_hold.hold_hours,
    NULLIF(public.payment_get_global_setting('default_hold_hours', '72'::jsonb)::text, '')::integer,
    72
  );

  SELECT * INTO v_comm
  FROM public.payment_commission_rules c
  WHERE c.is_active = TRUE
    AND (c.merchant_store_id = p_merchant_store_id OR c.merchant_store_id IS NULL)
    AND c.effective_from <= NOW()
    AND (c.effective_to IS NULL OR c.effective_to > NOW())
  ORDER BY CASE WHEN c.merchant_store_id IS NOT NULL THEN 0 ELSE 1 END, c.id DESC
  LIMIT 1;

  v_comm_amt := public.payment_calc_amount(
    COALESCE(v_comm.calculation_mode, v_rule.platform_commission_mode),
    COALESCE(v_comm.commission_value, v_rule.platform_commission_value),
    p_merchant_gross + CASE WHEN v_rule.include_packaging THEN p_packaging ELSE 0 END
  );

  SELECT * INTO v_tax_gst FROM public.payment_tax_rules
  WHERE is_active AND tax_type = 'GST' AND party_type = 'MERCHANT' LIMIT 1;
  SELECT * INTO v_tax_tds FROM public.payment_tax_rules
  WHERE is_active AND tax_type = 'TDS' AND party_type = 'MERCHANT' LIMIT 1;

  v_gst := public.payment_calc_amount(
    COALESCE(v_tax_gst.calculation_mode, 'PERCENTAGE'::payment_calculation_mode),
    COALESCE(v_tax_gst.tax_value, 0),
    p_merchant_gross
  );
  v_tds := public.payment_calc_amount(
    COALESCE(v_tax_tds.calculation_mode, 'PERCENTAGE'::payment_calculation_mode),
    COALESCE(v_tax_tds.tax_value, 0),
    p_merchant_gross
  );

  v_merchant_net := public.payment_calc_amount(
    v_rule.merchant_share_mode, v_rule.merchant_share_value,
    p_merchant_gross + CASE WHEN v_rule.include_packaging THEN p_packaging ELSE 0 END
  ) - v_comm_amt - v_gst - v_tds;

  IF v_merchant_net < 0 THEN v_merchant_net := 0; END IF;

  v_locked_until := NOW() + (v_hold_hours || ' hours')::interval;

  INSERT INTO public.payment_order_settlements (
    order_id, orders_food_id, wallet_id, settlement_rule_id,
    lifecycle_status, merchant_net, platform_commission, gst_amount, tds_amount,
    packaging_amount, surge_amount, tips_amount, locked_until, idempotency_key, metadata
  ) VALUES (
    p_order_id, p_orders_food_id, v_wallet_id, v_rule.id,
    'LOCKED', v_merchant_net, v_comm_amt, v_gst, v_tds,
    p_packaging, p_surge, p_tips, v_locked_until, v_key,
    jsonb_build_object('rule_code', v_rule.rule_code)
  )
  RETURNING id INTO v_settlement_id;

  v_ledger_id := public.merchant_wallet_credit(
    v_wallet_id, v_merchant_net, 'ORDER_EARNING'::wallet_transaction_category,
    'LOCKED'::wallet_balance_type, 'ORDER'::wallet_reference_type,
    COALESCE(p_orders_food_id, p_order_id),
    v_key || ':credit',
    'Delivered settlement (locked)', jsonb_build_object('settlement_id', v_settlement_id)
  );

  UPDATE public.payment_order_settlements
  SET credit_ledger_id = v_ledger_id, lifecycle_status = 'LOCKED', updated_at = NOW()
  WHERE id = v_settlement_id;

  UPDATE public.order_settlement_breakdown
  SET
    merchant_net = v_merchant_net,
    commission_amount = v_comm_amt,
    tds_amount = v_tds,
    gst_amount = v_gst,
    locked_until = v_locked_until,
    settled = TRUE,
    settled_at = NOW(),
    ledger_id = v_ledger_id,
    wallet_id = v_wallet_id,
    payment_settlement_id = v_settlement_id,
    settlement_rule_id = v_rule.id,
    updated_at = NOW()
  WHERE order_id = p_order_id;

  PERFORM public.payment_audit_log(
    'RULE_UPDATED'::payment_audit_action,
    'payment_order_settlements', v_settlement_id, p_actor_system_user_id,
    NULL, jsonb_build_object('merchant_net', v_merchant_net, 'ledger_id', v_ledger_id)
  );

  RETURN jsonb_build_object(
    'ok', true, 'settlement_id', v_settlement_id,
    'ledger_id', v_ledger_id, 'merchant_net', v_merchant_net,
    'locked_until', v_locked_until
  );
END;
$$;

-- ============================================================================
-- 9. CRON-SAFE LOCKED → AVAILABLE RELEASE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_release_due_locked_balances(
  p_batch_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_ledger_id BIGINT;
  v_key TEXT;
BEGIN
  IF (public.payment_get_global_setting('settlement_paused_globally', 'false'::jsonb))::text = 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'global_settlement_paused');
  END IF;

  FOR v_rec IN
    SELECT s.id, s.order_id, s.orders_food_id, s.wallet_id, s.merchant_net, s.credit_ledger_id
    FROM public.payment_order_settlements s
    JOIN public.merchant_wallet w ON w.id = s.wallet_id
    WHERE s.lifecycle_status = 'LOCKED'
      AND s.locked_until IS NOT NULL
      AND s.locked_until <= NOW()
      AND COALESCE(w.settlement_paused, FALSE) = FALSE
      AND w.status = 'ACTIVE'
    ORDER BY s.locked_until ASC
    LIMIT p_batch_limit
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    v_key := 'release:settlement:' || v_rec.id::text;
    BEGIN
      v_ledger_id := public.merchant_wallet_release_locked(
        v_rec.wallet_id, v_rec.merchant_net, COALESCE(v_rec.orders_food_id, v_rec.order_id), v_key
      );
      UPDATE public.payment_order_settlements
      SET lifecycle_status = 'AVAILABLE',
          release_ledger_id = v_ledger_id,
          released_at = NOW(),
          updated_at = NOW()
      WHERE id = v_rec.id AND lifecycle_status = 'LOCKED';
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.payment_order_settlements
      SET lifecycle_status = 'FAILED', metadata = metadata || jsonb_build_object('release_error', SQLERRM),
          updated_at = NOW()
      WHERE id = v_rec.id;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released_count', v_count);
END;
$$;

COMMENT ON FUNCTION public.payment_release_due_locked_balances IS
  'Cron-safe: move LOCKED settlements to AVAILABLE after hold period. Call via pg_cron or edge scheduler.';

-- ============================================================================
-- 10. REFUND / REVERSAL AFTER SETTLEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_process_refund_reversal(
  p_order_id BIGINT,
  p_refund_amount NUMERIC,
  p_reason TEXT,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settlement public.payment_order_settlements;
  v_rule public.payment_refund_rules;
  v_key TEXT;
  v_ledger_id BIGINT;
  v_reversal_id BIGINT;
BEGIN
  v_key := COALESCE(p_idempotency_key, 'refund:rev:' || p_order_id::text);

  SELECT * INTO v_settlement
  FROM public.payment_order_settlements
  WHERE order_id = p_order_id
  ORDER BY id DESC
  LIMIT 1;

  SELECT * INTO v_rule
  FROM public.payment_refund_rules
  WHERE is_active AND auto_reverse_if_settled = TRUE
  ORDER BY id DESC
  LIMIT 1;

  IF v_settlement.id IS NULL OR v_settlement.wallet_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_settlement');
  END IF;

  INSERT INTO public.payment_reversal_ledger (
    order_id, original_settlement_id, party_type, wallet_id,
    amount, status, idempotency_key, metadata
  ) VALUES (
    p_order_id, v_settlement.id, 'MERCHANT', v_settlement.wallet_id,
    p_refund_amount, 'PENDING', v_key,
    jsonb_build_object('reason', p_reason)
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_reversal_id;

  IF COALESCE(v_rule.reverse_merchant_settlement, TRUE) THEN
    IF v_settlement.lifecycle_status IN ('LOCKED', 'AVAILABLE', 'SETTLED') THEN
      v_ledger_id := public.merchant_wallet_debit(
        v_settlement.wallet_id,
        LEAST(p_refund_amount, v_settlement.merchant_net),
        CASE
          WHEN v_settlement.lifecycle_status = 'LOCKED' THEN 'REFUND_DEBIT'::wallet_transaction_category
          ELSE 'SETTLEMENT_REVERSAL'::wallet_transaction_category
        END,
        CASE
          WHEN v_settlement.lifecycle_status = 'LOCKED' THEN 'LOCKED'::wallet_balance_type
          ELSE 'AVAILABLE'::wallet_balance_type
        END,
        'REFUND'::wallet_reference_type,
        p_order_id,
        v_key || ':debit',
        p_reason,
        jsonb_build_object('reversal_id', v_reversal_id)
      );
      UPDATE public.payment_reversal_ledger
      SET status = 'COMPLETED', merchant_ledger_id = v_ledger_id, completed_at = NOW()
      WHERE id = v_reversal_id;
    END IF;
  END IF;

  PERFORM public.payment_audit_log(
    'REVERSAL_PROCESSED'::payment_audit_action,
    'payment_reversal_ledger', v_reversal_id, p_actor_system_user_id,
    NULL, jsonb_build_object('order_id', p_order_id, 'ledger_id', v_ledger_id)
  );

  RETURN jsonb_build_object('ok', true, 'reversal_id', v_reversal_id, 'ledger_id', v_ledger_id);
END;
$$;

-- ============================================================================
-- 11. PAYOUT APPROVAL WORKFLOW (super admin)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_approve_merchant_payout(
  p_payout_request_id BIGINT,
  p_approved_by_system_user_id BIGINT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr public.merchant_payout_requests;
  v_approval_id BIGINT;
BEGIN
  SELECT * INTO v_pr FROM public.merchant_payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'payout request not found';
  END IF;
  IF v_pr.status NOT IN ('PENDING'::payout_request_status_type) THEN
    RAISE EXCEPTION 'payout not in PENDING status (current=%)', v_pr.status;
  END IF;

  UPDATE public.merchant_payout_requests
  SET status = 'APPROVED', approved_at = NOW(), approved_by_system_user_id = p_approved_by_system_user_id,
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  INSERT INTO public.payment_payout_approvals (
    payout_request_id, payout_type, status, amount, net_amount,
    approved_by_system_user_id, approval_notes
  ) VALUES (
    p_payout_request_id, 'MERCHANT', 'APPROVED', v_pr.amount, v_pr.net_payout_amount,
    p_approved_by_system_user_id, p_notes
  )
  ON CONFLICT (payout_request_id, payout_type) DO UPDATE
  SET status = 'APPROVED', approved_by_system_user_id = p_approved_by_system_user_id,
      approval_notes = p_notes, updated_at = NOW()
  RETURNING id INTO v_approval_id;

  PERFORM public.payment_audit_log(
    'PAYOUT_APPROVED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_approved_by_system_user_id, NULL,
    jsonb_build_object('approval_id', v_approval_id)
  );

  RETURN jsonb_build_object('ok', true, 'approval_id', v_approval_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_reject_merchant_payout(
  p_payout_request_id BIGINT,
  p_rejected_by_system_user_id BIGINT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.merchant_payout_requests
  SET status = 'CANCELLED', rejection_reason = p_reason,
      rejected_by_system_user_id = p_rejected_by_system_user_id, updated_at = NOW()
  WHERE id = p_payout_request_id AND status = 'PENDING';

  PERFORM public.payment_audit_log(
    'PAYOUT_REJECTED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_rejected_by_system_user_id, NULL,
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_retry_failed_payout(
  p_payout_request_id BIGINT,
  p_actor_system_user_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr public.merchant_payout_requests;
  v_rule public.payment_payout_rules;
  v_approval public.payment_payout_approvals;
  v_next_retry TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_pr FROM public.merchant_payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF v_pr.status NOT IN ('FAILED'::payout_request_status_type) THEN
    RAISE EXCEPTION 'Can only retry FAILED payouts';
  END IF;

  SELECT * INTO v_rule FROM public.payment_payout_rules
  WHERE is_active AND party_type = 'MERCHANT' ORDER BY id DESC LIMIT 1;

  IF v_pr.retry_count >= COALESCE(v_rule.max_retries, 3) THEN
    RAISE EXCEPTION 'Max payout retries exceeded';
  END IF;

  v_next_retry := NOW() + (COALESCE(v_rule.retry_delay_minutes, 30) || ' minutes')::interval;

  UPDATE public.merchant_payout_requests
  SET status = 'PENDING', retry_count = retry_count + 1, next_retry_at = v_next_retry, updated_at = NOW()
  WHERE id = p_payout_request_id;

  SELECT * INTO v_approval FROM public.payment_payout_approvals
  WHERE payout_request_id = p_payout_request_id;

  IF v_approval.id IS NOT NULL THEN
    INSERT INTO public.payment_payout_retries (payout_approval_id, attempt_number, status, failure_reason)
    VALUES (v_approval.id, v_pr.retry_count + 1, 'PENDING', 'Manual retry')
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.payment_audit_log(
    'PAYOUT_RETRIED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_actor_system_user_id, NULL, jsonb_build_object('next_retry_at', v_next_retry)
  );

  RETURN jsonb_build_object('ok', true, 'next_retry_at', v_next_retry);
END;
$$;

-- ============================================================================
-- 12. WALLET FREEZE / UNFREEZE (super admin)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_freeze_merchant_wallet(
  p_wallet_id BIGINT,
  p_reason TEXT,
  p_actor_system_user_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_prev wallet_status_type;
BEGIN
  SELECT status INTO v_prev FROM public.merchant_wallet WHERE id = p_wallet_id FOR UPDATE;
  UPDATE public.merchant_wallet
  SET status = 'FROZEN', frozen_reason = p_reason, frozen_at = NOW(),
      frozen_by_system_user_id = p_actor_system_user_id, updated_at = NOW()
  WHERE id = p_wallet_id;

  INSERT INTO public.payment_wallet_freeze_logs (
    party_type, wallet_id, previous_status, new_status, reason, frozen_by_system_user_id
  ) VALUES ('MERCHANT', p_wallet_id, v_prev, 'FROZEN', p_reason, p_actor_system_user_id);

  PERFORM public.payment_audit_log(
    'WALLET_FROZEN'::payment_audit_action, 'merchant_wallet', p_wallet_id, p_actor_system_user_id,
    jsonb_build_object('status', v_prev), jsonb_build_object('status', 'FROZEN', 'reason', p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_unfreeze_merchant_wallet(
  p_wallet_id BIGINT,
  p_actor_system_user_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_prev wallet_status_type;
BEGIN
  SELECT status INTO v_prev FROM public.merchant_wallet WHERE id = p_wallet_id FOR UPDATE;
  UPDATE public.merchant_wallet
  SET status = 'ACTIVE', frozen_reason = NULL, frozen_at = NULL,
      frozen_by_system_user_id = NULL, updated_at = NOW()
  WHERE id = p_wallet_id;

  INSERT INTO public.payment_wallet_freeze_logs (
    party_type, wallet_id, previous_status, new_status, reason, frozen_by_system_user_id
  ) VALUES ('MERCHANT', p_wallet_id, v_prev, 'ACTIVE', 'Unfrozen by admin', p_actor_system_user_id);

  PERFORM public.payment_audit_log(
    'WALLET_UNFROZEN'::payment_audit_action, 'merchant_wallet', p_wallet_id, p_actor_system_user_id,
    jsonb_build_object('status', v_prev), jsonb_build_object('status', 'ACTIVE')
  );
END;
$$;

-- ============================================================================
-- 13. DAILY RECONCILIATION (cron-safe stub + mismatch detection)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_run_daily_reconciliation(
  p_run_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id BIGINT;
  v_mismatch INTEGER := 0;
  v_matched INTEGER := 0;
  v_rec RECORD;
BEGIN
  INSERT INTO public.payment_reconciliation_runs (reconciliation_type, run_date, status)
  VALUES ('DAILY_WALLET', p_run_date, 'PROCESSING')
  ON CONFLICT (reconciliation_type, run_date) DO UPDATE SET status = 'PROCESSING', started_at = NOW()
  RETURNING id INTO v_run_id;

  FOR v_rec IN
    SELECT w.id AS wallet_id,
           w.available_balance + COALESCE(w.locked_balance, 0) + w.hold_balance + w.pending_balance AS wallet_total,
           COALESCE(SUM(
             CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END
           ), 0) AS ledger_net
    FROM public.merchant_wallet w
    LEFT JOIN public.merchant_wallet_ledger l ON l.wallet_id = w.id
    GROUP BY w.id, w.available_balance, w.locked_balance, w.hold_balance, w.pending_balance
  LOOP
    IF ABS(v_rec.wallet_total - v_rec.ledger_net) > 0.01 THEN
      INSERT INTO public.payment_reconciliation_mismatches (
        run_id, entity_type, entity_id, expected_amount, actual_amount, delta_amount, details
      ) VALUES (
        v_run_id, 'merchant_wallet', v_rec.wallet_id, v_rec.wallet_total, v_rec.ledger_net,
        v_rec.wallet_total - v_rec.ledger_net,
        jsonb_build_object('note', 'wallet buckets vs ledger net direction sum')
      );
      v_mismatch := v_mismatch + 1;
    ELSE
      v_matched := v_matched + 1;
    END IF;
  END LOOP;

  UPDATE public.payment_reconciliation_runs
  SET status = 'COMPLETED', matched_count = v_matched, mismatch_count = v_mismatch, completed_at = NOW()
  WHERE id = v_run_id;

  RETURN jsonb_build_object('ok', true, 'run_id', v_run_id, 'matched', v_matched, 'mismatches', v_mismatch);
END;
$$;

-- ============================================================================
-- 14. SEED DEFAULT ADMIN RULES (editable from super admin panel)
-- ============================================================================

INSERT INTO public.payment_global_settings (setting_key, setting_value, description, is_active)
VALUES
  ('settlement_paused_globally', 'false', 'Pause all automated settlement/release', TRUE),
  ('default_hold_hours', '72', 'Default LOCKED hold before AVAILABLE release', TRUE),
  ('fraud_rapid_withdrawal_threshold', '3', 'Max payout requests per wallet per 24h before flag', TRUE),
  ('auto_settlement_enabled', 'true', 'Enable payment_process_delivered_settlement', TRUE)
ON CONFLICT (setting_key, version) DO NOTHING;

INSERT INTO public.payment_settlement_rules (
  rule_code, rule_name, merchant_share_mode, merchant_share_value,
  platform_commission_mode, platform_commission_value, rider_share_mode, rider_share_value
) VALUES (
  'DEFAULT_DELIVERED_FOOD', 'Default delivered food settlement',
  'PERCENTAGE', 100, 'PERCENTAGE', 0, 'PERCENTAGE', 0
) ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_hold_rules (rule_code, rule_name, hold_hours, auto_release_enabled)
VALUES ('DEFAULT_MERCHANT_HOLD', 'Default merchant locked hold', 72, TRUE)
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_payout_rules (
  rule_code, rule_name, requires_admin_approval, min_payout_amount, max_retries
) VALUES ('DEFAULT_MERCHANT_PAYOUT', 'Default merchant payout policy', TRUE, 100, 3)
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_cancellation_rules (
  rule_code, rule_name, order_milestone, cancelled_by,
  merchant_gets_payment, customer_refund_mode, platform_keeps_commission
) VALUES
  ('CANCEL_BEFORE_ACCEPT', 'No pay before accept', 'ORDER_CREATED', NULL, FALSE, 'FULL', TRUE),
  ('CANCEL_MERCHANT_AFTER_ACCEPT', 'Merchant cancel after accept', 'MERCHANT_CANCELLED', 'MERCHANT', FALSE, 'FULL', TRUE),
  ('CANCEL_CUSTOMER_AFTER_PREP', 'Customer cancel while preparing', 'CUSTOMER_CANCELLED', 'CUSTOMER', FALSE, 'PARTIAL', TRUE),
  ('CANCEL_ADMIN', 'Admin cancellation', 'ADMIN_CANCELLED', 'ADMIN', FALSE, 'FULL', TRUE)
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_refund_rules (
  rule_code, rule_name, refund_trigger, customer_refund_mode, customer_refund_value, auto_reverse_if_settled
) VALUES ('DEFAULT_POST_SETTLEMENT_REFUND', 'Reverse merchant on refund after settle', 'CANCELLATION', 'PERCENTAGE', 100, TRUE)
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_tax_rules (rule_code, rule_name, party_type, tax_type, calculation_mode, tax_value)
VALUES
  ('DEFAULT_GST_MERCHANT', 'Default GST on merchant', 'MERCHANT', 'GST', 'PERCENTAGE', 0),
  ('DEFAULT_TDS_MERCHANT', 'Default TDS on merchant', 'MERCHANT', 'TDS', 'PERCENTAGE', 0)
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_commission_rules (rule_code, rule_name, calculation_mode, commission_value)
VALUES ('DEFAULT_COMMISSION', 'Default platform commission', 'PERCENTAGE', 0)
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO public.payment_gateway_settings (provider, display_name, is_active, is_default)
VALUES
  ('RAZORPAY', 'Razorpay', FALSE, TRUE),
  ('CASHFREE', 'Cashfree', FALSE, FALSE),
  ('STRIPE', 'Stripe', FALSE, FALSE)
ON CONFLICT (provider) DO NOTHING;

-- ============================================================================
-- 15. RLS (service role + authenticated super admin via system_users)
-- ============================================================================

ALTER TABLE public.payment_global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_cancellation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settlement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_payout_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_hold_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refund_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_penalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_order_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_payout_approvals ENABLE ROW LEVEL SECURITY;

-- Super admin / service role policies (dashboard uses service role for admin APIs)
DO $$ BEGIN
  CREATE POLICY payment_admin_all_global_settings ON public.payment_global_settings
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY payment_admin_all_cancellation_rules ON public.payment_cancellation_rules
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY payment_admin_all_settlement_rules ON public.payment_settlement_rules
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY payment_admin_all_audit ON public.payment_audit_logs
    FOR SELECT USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 16. GRANTS (Supabase: service_role for dashboard backend)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON
  public.payment_global_settings,
  public.payment_cancellation_rules,
  public.payment_settlement_rules,
  public.payment_tax_rules,
  public.payment_commission_rules,
  public.payment_payout_rules,
  public.payment_hold_rules,
  public.payment_refund_rules,
  public.payment_penalty_rules,
  public.payment_gateway_settings,
  public.payment_order_settlements,
  public.payment_refund_ledger,
  public.payment_reversal_ledger,
  public.payment_bank_accounts,
  public.payment_payout_approvals,
  public.payment_payout_retries,
  public.payment_webhook_logs,
  public.payment_reconciliation_runs,
  public.payment_reconciliation_mismatches,
  public.payment_wallet_freeze_logs,
  public.payment_fraud_flags,
  public.payment_audit_logs
TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_audit_log TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_get_global_setting TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_apply_cancellation TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_process_delivered_settlement TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_release_due_locked_balances TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_process_refund_reversal TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_approve_merchant_payout TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_reject_merchant_payout TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_retry_failed_payout TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_freeze_merchant_wallet TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_unfreeze_merchant_wallet TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_run_daily_reconciliation TO service_role;

-- ============================================================================
-- 17. CRON HINT (run in Supabase SQL editor or pg_cron)
-- ============================================================================
-- SELECT cron.schedule('payment_release_locked', '0 */6 * * *',
--   $$SELECT public.payment_release_due_locked_balances(500)$$);
-- SELECT cron.schedule('payment_daily_recon', '15 2 * * *',
--   $$SELECT public.payment_run_daily_reconciliation(CURRENT_DATE)$$);
