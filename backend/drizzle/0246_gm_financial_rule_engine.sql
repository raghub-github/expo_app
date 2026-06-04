-- ============================================================================
-- 0246: GatiMitra Production Financial Rule Engine
-- Centralized cancellation, refund, penalty, settlement, dispute & reversal rules.
--
-- Prerequisites (run in order if not already applied):
--   dashboard/drizzle/0235_order_cancellation_reason_catalog.sql
--   dashboard/drizzle/0236_order_cancellation_attributes.sql
--   dashboard/drizzle/0239_super_admin_payment_management_system.sql
--   dashboard/drizzle/0240a_payment_cancellation_milestone_enums.sql
--   dashboard/drizzle/0240_payment_cancellation_scenarios.sql
--   partnersite/drizzle/merchant_wallet.sql (+ v2/v3)
--
-- Idempotent: safe to re-run (IF NOT EXISTS / exception guards).
-- ============================================================================

-- ============================================================================
-- 1. ENUMS (extend only; no hardcoded business values)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE gm_rule_active_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DRAFT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_rule_scenario_type AS ENUM (
    'CANCELLATION',
    'POST_DELIVERY_CANCELLATION',
    'PARTIAL_REFUND',
    'RTO',
    'COD_FAILURE',
    'CHARGEBACK',
    'COMPENSATION',
    'DISPUTE_RESOLUTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_fault_bucket AS ENUM (
    'CUSTOMER_FAULT',
    'RIDER_FAULT',
    'MERCHANT_FAULT',
    'SYSTEM_FAULT',
    'GATIMITRA_FAULT',
    'SHARED_FAULT',
    'NO_FAULT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_refund_recipient AS ENUM (
    'ORIGINAL_SOURCE', 'WALLET', 'BANK', 'CREDITS', 'SPLIT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_account_restriction AS ENUM (
    'NONE', 'WARNING', 'TEMPORARY_BLOCK', 'PERMANENT_BLOCK', 'RESTRICTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_dispute_status AS ENUM (
    'OPEN', 'EVIDENCE_PENDING', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_dispute_party AS ENUM ('CUSTOMER', 'MERCHANT', 'RIDER', 'PLATFORM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_reversal_type AS ENUM (
    'REFUND', 'PENALTY', 'SETTLEMENT', 'WALLET_CREDIT', 'COMPENSATION', 'CHARGEBACK'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gm_execution_status AS ENUM (
    'SIMULATED', 'PENDING', 'APPROVAL_REQUIRED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REVERSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. DYNAMIC CATALOG FUNCTIONS (no hardcoded service types / stages)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_catalog_service_types()
RETURNS TABLE(code TEXT, label TEXT, sort_order INT)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.enumlabel::text AS code,
    initcap(lower(replace(e.enumlabel::text, '_', ' '))) AS label,
    e.enumsortorder::int AS sort_order
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'service_type'
  ORDER BY e.enumsortorder;
$$;

COMMENT ON FUNCTION public.gm_catalog_service_types IS
  'All service_type enum values (FOOD/PARCEL/RIDE). New enum values appear automatically.';

CREATE OR REPLACE FUNCTION public.gm_catalog_order_stages()
RETURNS TABLE(code TEXT, label TEXT, source TEXT, sort_order INT)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  -- payment_order_milestone (primary cancellation engine vocabulary)
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_order_milestone') THEN
    RETURN QUERY
    SELECT
      e.enumlabel::text,
      initcap(lower(replace(e.enumlabel::text, '_', ' '))),
      'payment_order_milestone'::text,
      e.enumsortorder::int
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'payment_order_milestone'
    ORDER BY e.enumsortorder;
  END IF;

  -- order_event_type lifecycle events
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_event_type') THEN
    RETURN QUERY
    SELECT
      e.enumlabel::text,
      initcap(lower(replace(e.enumlabel::text, '_', ' '))),
      'order_event_type'::text,
      1000 + e.enumsortorder::int
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'order_event_type'
      AND NOT EXISTS (
        SELECT 1 FROM pg_enum e2
        JOIN pg_type t2 ON e2.enumtypid = t2.oid
        WHERE t2.typname = 'payment_order_milestone' AND e2.enumlabel = e.enumlabel
      )
    ORDER BY e.enumsortorder;
  END IF;

  -- order_status_type (orders_core.status)
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_type') THEN
    RETURN QUERY
    SELECT
      upper(e.enumlabel::text),
      initcap(replace(e.enumlabel::text, '_', ' ')),
      'order_status_type'::text,
      2000 + e.enumsortorder::int
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'order_status_type'
    ORDER BY e.enumsortorder;
  END IF;

  -- Configured transitions (FOOD vertical)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_status_transitions'
  ) THEN
    RETURN QUERY
    SELECT DISTINCT
      upper(t.to_status),
      initcap(replace(t.to_status, '_', ' ')),
      'order_status_transitions'::text,
      3000
    FROM public.order_status_transitions t
    WHERE t.to_status IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type ty ON e.enumtypid = ty.oid
        WHERE ty.typname IN ('payment_order_milestone', 'order_event_type', 'order_status_type')
          AND upper(e.enumlabel::text) = upper(t.to_status)
      );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.gm_catalog_order_stages IS
  'Union of order stage vocabularies from existing DB enums and transition config.';

CREATE OR REPLACE FUNCTION public.gm_catalog_triggered_by()
RETURNS TABLE(code TEXT, label TEXT, sort_order INT)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.enumlabel::text,
    initcap(lower(e.enumlabel::text)),
    e.enumsortorder::int
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'payment_cancelled_by'
  ORDER BY e.enumsortorder;
$$;

CREATE OR REPLACE FUNCTION public.gm_is_valid_service_type(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gm_catalog_service_types() c WHERE c.code = upper(trim(p_code))
  );
$$;

CREATE OR REPLACE FUNCTION public.gm_is_valid_order_stage(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gm_catalog_order_stages() c
    WHERE upper(trim(c.code)) = upper(trim(p_code))
  );
$$;

CREATE OR REPLACE FUNCTION public.gm_is_valid_triggered_by(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gm_catalog_triggered_by() c
    WHERE upper(trim(c.code)) = upper(trim(p_code))
  );
$$;

-- ============================================================================
-- 3. RULE MASTER & CONDITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_rule_master (
  id BIGSERIAL PRIMARY KEY,
  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  scenario_type gm_rule_scenario_type NOT NULL DEFAULT 'CANCELLATION',
  priority INTEGER NOT NULL DEFAULT 100,
  active_status gm_rule_active_status NOT NULL DEFAULT 'DRAFT',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  version_no INTEGER NOT NULL DEFAULT 1,
  change_reason TEXT,
  cloned_from_rule_id BIGINT REFERENCES public.gm_rule_master(id) ON DELETE SET NULL,
  legacy_payment_rule_id BIGINT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gm_rule_master_code_version_uniq UNIQUE (rule_code, version_no),
  CONSTRAINT gm_rule_master_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS gm_rule_master_lookup_idx
  ON public.gm_rule_master(active_status, scenario_type, priority, effective_from DESC)
  WHERE is_deleted = FALSE;

COMMENT ON TABLE public.gm_rule_master IS
  'Central financial rule master. Soft-delete only; versioned via version_no + audit.';

CREATE TABLE IF NOT EXISTS public.gm_rule_conditions (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  service_type TEXT,
  order_stage TEXT,
  cancellation_reason_id BIGINT,
  triggered_by TEXT,
  CONSTRAINT gm_rule_conditions_rule_uniq UNIQUE (rule_id),
  CONSTRAINT gm_rule_conditions_service_type_valid
    CHECK (service_type IS NULL OR public.gm_is_valid_service_type(service_type)),
  CONSTRAINT gm_rule_conditions_order_stage_valid
    CHECK (order_stage IS NULL OR public.gm_is_valid_order_stage(order_stage)),
  CONSTRAINT gm_rule_conditions_triggered_by_valid
    CHECK (triggered_by IS NULL OR public.gm_is_valid_triggered_by(triggered_by))
);

CREATE INDEX IF NOT EXISTS gm_rule_conditions_lookup_idx
  ON public.gm_rule_conditions(service_type, order_stage, triggered_by, cancellation_reason_id);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_cancellation_reason_catalog'
  ) THEN
    ALTER TABLE public.gm_rule_conditions
      DROP CONSTRAINT IF EXISTS gm_rule_conditions_reason_fk;
    ALTER TABLE public.gm_rule_conditions
      ADD CONSTRAINT gm_rule_conditions_reason_fk
      FOREIGN KEY (cancellation_reason_id)
      REFERENCES public.order_cancellation_reason_catalog(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. FAULT & LIABILITY ALLOCATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_rule_fault_allocation (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  fault_bucket gm_fault_bucket NOT NULL DEFAULT 'NO_FAULT',
  customer_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  merchant_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  rider_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  platform_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  gatimitra_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  CONSTRAINT gm_rule_fault_allocation_rule_uniq UNIQUE (rule_id),
  CONSTRAINT gm_rule_fault_allocation_pct_range
    CHECK (
      customer_pct BETWEEN 0 AND 100
      AND merchant_pct BETWEEN 0 AND 100
      AND rider_pct BETWEEN 0 AND 100
      AND platform_pct BETWEEN 0 AND 100
      AND gatimitra_pct BETWEEN 0 AND 100
    ),
  CONSTRAINT gm_rule_fault_allocation_sum_100
    CHECK (
      (
        fault_bucket = 'NO_FAULT'
        AND customer_pct = 0 AND merchant_pct = 0 AND rider_pct = 0
        AND platform_pct = 0 AND gatimitra_pct = 0
      )
      OR round(customer_pct + merchant_pct + rider_pct + platform_pct + gatimitra_pct, 2) = 100.00
    )
);

COMMENT ON TABLE public.gm_rule_fault_allocation IS
  'Shared-fault percentages; DB enforces total = 100%.';

CREATE TABLE IF NOT EXISTS public.gm_rule_platform_liability (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  platform_bears_loss BOOLEAN NOT NULL DEFAULT FALSE,
  liability_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  customer_liability_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  merchant_liability_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  rider_liability_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  gatimitra_liability_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  internal_notes TEXT,
  CONSTRAINT gm_rule_platform_liability_rule_uniq UNIQUE (rule_id),
  CONSTRAINT gm_rule_platform_liability_sum_100
    CHECK (
      round(
        liability_pct + customer_liability_pct + merchant_liability_pct
        + rider_liability_pct + gatimitra_liability_pct, 2
      ) = 100.00
    )
);

-- ============================================================================
-- 5. REFUND, SETTLEMENT, PENALTY CONFIG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_rule_refund_config (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  refund_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  refund_recipient gm_refund_recipient NOT NULL DEFAULT 'ORIGINAL_SOURCE',
  refund_priority JSONB NOT NULL DEFAULT '["ORIGINAL_SOURCE","WALLET","BANK"]'::jsonb,
  refund_pct NUMERIC(8, 4),
  refund_flat_amount NUMERIC(14, 2),
  platform_fee_refund_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  delivery_fee_refund_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  convenience_fee_refund_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  tip_refund_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  tax_refund_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  coupon_restore BOOLEAN NOT NULL DEFAULT FALSE,
  item_level_refund BOOLEAN NOT NULL DEFAULT FALSE,
  order_level_refund BOOLEAN NOT NULL DEFAULT TRUE,
  auto_refund BOOLEAN NOT NULL DEFAULT FALSE,
  refund_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  min_refund_amount NUMERIC(14, 2),
  max_refund_amount NUMERIC(14, 2),
  CONSTRAINT gm_rule_refund_config_rule_uniq UNIQUE (rule_id),
  CONSTRAINT gm_rule_refund_config_amount_range
    CHECK (
      min_refund_amount IS NULL OR max_refund_amount IS NULL
      OR min_refund_amount <= max_refund_amount
    )
);

CREATE TABLE IF NOT EXISTS public.gm_rule_merchant_settlement (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  merchant_receives_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  merchant_penalty_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  merchant_compensation_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  settlement_hold BOOLEAN NOT NULL DEFAULT FALSE,
  settlement_hold_hours INTEGER NOT NULL DEFAULT 0,
  settlement_notes TEXT,
  CONSTRAINT gm_rule_merchant_settlement_rule_uniq UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_rider_settlement (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  rider_receives_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  rider_penalty_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  rider_compensation_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  min_rider_protection_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  settlement_hold BOOLEAN NOT NULL DEFAULT FALSE,
  settlement_hold_hours INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT gm_rule_rider_settlement_rule_uniq UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_customer_penalty (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  customer_penalty_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  customer_flat_penalty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  warning_increment INTEGER NOT NULL DEFAULT 0,
  account_restriction gm_account_restriction NOT NULL DEFAULT 'NONE',
  temporary_block_hours INTEGER,
  CONSTRAINT gm_rule_customer_penalty_rule_uniq UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_financial_limits (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  max_refund_amount NUMERIC(14, 2),
  min_refund_amount NUMERIC(14, 2),
  max_penalty_amount NUMERIC(14, 2),
  max_compensation_amount NUMERIC(14, 2),
  CONSTRAINT gm_rule_financial_limits_rule_uniq UNIQUE (rule_id)
);

-- ============================================================================
-- 6. AUTO ACTIONS, FRAUD, EVIDENCE, APPROVAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_rule_auto_actions (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  auto_cancel BOOLEAN NOT NULL DEFAULT FALSE,
  auto_refund BOOLEAN NOT NULL DEFAULT FALSE,
  auto_settlement_recalc BOOLEAN NOT NULL DEFAULT FALSE,
  auto_notification BOOLEAN NOT NULL DEFAULT TRUE,
  auto_ticket_creation BOOLEAN NOT NULL DEFAULT FALSE,
  auto_wallet_adjustment BOOLEAN NOT NULL DEFAULT FALSE,
  auto_fraud_review BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT gm_rule_auto_actions_rule_uniq UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_fraud_config (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  mark_fraud BOOLEAN NOT NULL DEFAULT FALSE,
  manual_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  blacklist_customer BOOLEAN NOT NULL DEFAULT FALSE,
  blacklist_merchant BOOLEAN NOT NULL DEFAULT FALSE,
  blacklist_rider BOOLEAN NOT NULL DEFAULT FALSE,
  freeze_wallet BOOLEAN NOT NULL DEFAULT FALSE,
  freeze_settlement BOOLEAN NOT NULL DEFAULT FALSE,
  create_investigation_ticket BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT gm_rule_fraud_config_rule_uniq UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_evidence_config (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  require_customer_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  require_rider_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  require_merchant_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  require_photo BOOLEAN NOT NULL DEFAULT FALSE,
  require_video BOOLEAN NOT NULL DEFAULT FALSE,
  require_admin_approval BOOLEAN NOT NULL DEFAULT FALSE,
  require_support_approval BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT gm_rule_evidence_config_rule_uniq UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_approval_thresholds (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  threshold_amount NUMERIC(14, 2) NOT NULL,
  required_role_codes TEXT[] NOT NULL DEFAULT '{}',
  approval_sequence INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT gm_rule_approval_thresholds_rule_seq_uniq UNIQUE (rule_id, approval_sequence)
);

CREATE TABLE IF NOT EXISTS public.gm_rule_advanced_config (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT gm_rule_advanced_config_rule_uniq UNIQUE (rule_id)
);

COMMENT ON TABLE public.gm_rule_advanced_config IS
  'Scenario-specific knobs: RTO charges, COD recovery, chargeback workflow, split refund details.';

-- ============================================================================
-- 7. EXECUTION, SIMULATION, AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_rule_execution_log (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT REFERENCES public.gm_rule_master(id) ON DELETE SET NULL,
  rule_code TEXT NOT NULL,
  rule_version_no INTEGER NOT NULL DEFAULT 1,
  order_id BIGINT,
  core_order_id TEXT,
  orders_food_id BIGINT,
  scenario_type gm_rule_scenario_type NOT NULL,
  trigger_event TEXT NOT NULL,
  execution_status gm_execution_status NOT NULL DEFAULT 'COMPLETED',
  input_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_refund NUMERIC(14, 2) NOT NULL DEFAULT 0,
  applied_penalty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  applied_compensation NUMERIC(14, 2) NOT NULL DEFAULT 0,
  applied_merchant_settlement NUMERIC(14, 2) NOT NULL DEFAULT 0,
  applied_rider_settlement NUMERIC(14, 2) NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  error_message TEXT,
  executed_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gm_rule_execution_log_idempotency_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS gm_rule_execution_log_order_idx
  ON public.gm_rule_execution_log(order_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS gm_rule_execution_log_rule_idx
  ON public.gm_rule_execution_log(rule_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS public.gm_rule_simulation_log (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT REFERENCES public.gm_rule_master(id) ON DELETE SET NULL,
  simulated_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  input_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gm_rule_audit_log (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  device_info TEXT,
  change_reason TEXT
);

CREATE INDEX IF NOT EXISTS gm_rule_audit_log_rule_idx
  ON public.gm_rule_audit_log(rule_id, changed_at DESC);

-- ============================================================================
-- 8. DISPUTES, CHARGEBACKS, REVERSALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_disputes (
  id BIGSERIAL PRIMARY KEY,
  dispute_code TEXT NOT NULL UNIQUE,
  order_id BIGINT,
  core_order_id TEXT,
  party_type gm_dispute_party NOT NULL,
  party_id BIGINT,
  dispute_type TEXT NOT NULL,
  status gm_dispute_status NOT NULL DEFAULT 'OPEN',
  rule_execution_id BIGINT REFERENCES public.gm_rule_execution_log(id) ON DELETE SET NULL,
  claimed_amount NUMERIC(14, 2),
  resolved_amount NUMERIC(14, 2),
  resolution_notes TEXT,
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gm_dispute_evidence (
  id BIGSERIAL PRIMARY KEY,
  dispute_id BIGINT NOT NULL REFERENCES public.gm_disputes(id) ON DELETE CASCADE,
  uploaded_by_party gm_dispute_party NOT NULL,
  uploaded_by_id BIGINT,
  evidence_type TEXT NOT NULL,
  media_url TEXT,
  gps_data JSONB,
  timeline_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gm_chargeback_cases (
  id BIGSERIAL PRIMARY KEY,
  case_code TEXT NOT NULL UNIQUE,
  order_id BIGINT,
  core_order_id TEXT,
  payment_transaction_id BIGINT,
  chargeback_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  status gm_dispute_status NOT NULL DEFAULT 'OPEN',
  merchant_recovery_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  rider_recovery_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  customer_restriction gm_account_restriction NOT NULL DEFAULT 'NONE',
  settlement_hold BOOLEAN NOT NULL DEFAULT TRUE,
  rule_id BIGINT REFERENCES public.gm_rule_master(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.gm_financial_reversals (
  id BIGSERIAL PRIMARY KEY,
  reversal_code TEXT NOT NULL UNIQUE,
  reversal_type gm_reversal_type NOT NULL,
  original_execution_id BIGINT REFERENCES public.gm_rule_execution_log(id) ON DELETE SET NULL,
  order_id BIGINT,
  party_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  reversed_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. AUDIT TRIGGER (soft delete only; no physical DELETE on master)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_rule_master_deny_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'gm_rule_master rows cannot be physically deleted; use active_status=ARCHIVED and is_deleted=true';
END;
$$;

DROP TRIGGER IF EXISTS trg_gm_rule_master_no_delete ON public.gm_rule_master;
CREATE TRIGGER trg_gm_rule_master_no_delete
  BEFORE DELETE ON public.gm_rule_master
  FOR EACH ROW EXECUTE FUNCTION public.gm_rule_master_deny_delete();

CREATE OR REPLACE FUNCTION public.gm_rule_master_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.gm_rule_audit_log (
      rule_id, rule_code, version_no, action, new_value, changed_by, change_reason
    ) VALUES (
      NEW.id, NEW.rule_code, NEW.version_no, 'CREATED',
      to_jsonb(NEW), NEW.created_by, NEW.change_reason
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.gm_rule_audit_log (
      rule_id, rule_code, version_no, action, old_value, new_value, changed_by, change_reason
    ) VALUES (
      NEW.id, NEW.rule_code, NEW.version_no, 'UPDATED',
      to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by, NEW.change_reason
    );
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_gm_rule_master_audit ON public.gm_rule_master;
CREATE TRIGGER trg_gm_rule_master_audit
  AFTER INSERT OR UPDATE ON public.gm_rule_master
  FOR EACH ROW EXECUTE FUNCTION public.gm_rule_master_audit_trigger();

-- ============================================================================
-- 10. RULE RESOLUTION & CALCULATION HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_calc_pct_or_flat(
  p_pct NUMERIC,
  p_flat NUMERIC,
  p_base NUMERIC,
  p_max NUMERIC DEFAULT NULL,
  p_min NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v NUMERIC(14, 2);
BEGIN
  IF p_flat IS NOT NULL AND p_flat > 0 THEN
    v := p_flat;
  ELSIF p_pct IS NOT NULL AND p_pct > 0 THEN
    v := round((p_base * p_pct / 100.0)::numeric, 2);
  ELSE
    v := 0;
  END IF;
  IF p_max IS NOT NULL AND v > p_max THEN v := p_max; END IF;
  IF p_min IS NOT NULL AND v < p_min THEN v := p_min; END IF;
  IF v < 0 THEN v := 0; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_resolve_rule(
  p_scenario_type gm_rule_scenario_type,
  p_service_type TEXT DEFAULT NULL,
  p_order_stage TEXT DEFAULT NULL,
  p_cancellation_reason_id BIGINT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT NULL
)
RETURNS public.gm_rule_master
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_rule public.gm_rule_master;
BEGIN
  SELECT m.* INTO v_rule
  FROM public.gm_rule_master m
  JOIN public.gm_rule_conditions c ON c.rule_id = m.id
  WHERE m.is_deleted = FALSE
    AND m.active_status = 'ACTIVE'
    AND m.scenario_type = p_scenario_type
    AND m.effective_from <= NOW()
    AND (m.effective_to IS NULL OR m.effective_to > NOW())
    AND (c.service_type IS NULL OR upper(c.service_type) = upper(coalesce(p_service_type, c.service_type)))
    AND (c.order_stage IS NULL OR upper(c.order_stage) = upper(coalesce(p_order_stage, c.order_stage)))
    AND (c.cancellation_reason_id IS NULL OR c.cancellation_reason_id = p_cancellation_reason_id)
    AND (c.triggered_by IS NULL OR upper(c.triggered_by) = upper(coalesce(p_triggered_by, c.triggered_by)))
  ORDER BY
    (CASE WHEN c.service_type IS NOT NULL THEN 0 ELSE 1 END)
    + (CASE WHEN c.order_stage IS NOT NULL THEN 0 ELSE 1 END)
    + (CASE WHEN c.cancellation_reason_id IS NOT NULL THEN 0 ELSE 1 END)
    + (CASE WHEN c.triggered_by IS NOT NULL THEN 0 ELSE 1 END),
    m.priority ASC,
    m.version_no DESC,
    m.id DESC
  LIMIT 1;
  RETURN v_rule;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_build_rule_snapshot(p_rule_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'master', (SELECT to_jsonb(m) FROM public.gm_rule_master m WHERE m.id = p_rule_id),
    'conditions', (SELECT to_jsonb(c) FROM public.gm_rule_conditions c WHERE c.rule_id = p_rule_id),
    'fault', (SELECT to_jsonb(f) FROM public.gm_rule_fault_allocation f WHERE f.rule_id = p_rule_id),
    'liability', (SELECT to_jsonb(l) FROM public.gm_rule_platform_liability l WHERE l.rule_id = p_rule_id),
    'refund', (SELECT to_jsonb(r) FROM public.gm_rule_refund_config r WHERE r.rule_id = p_rule_id),
    'merchant', (SELECT to_jsonb(ms) FROM public.gm_rule_merchant_settlement ms WHERE ms.rule_id = p_rule_id),
    'rider', (SELECT to_jsonb(rs) FROM public.gm_rule_rider_settlement rs WHERE rs.rule_id = p_rule_id),
    'customer_penalty', (SELECT to_jsonb(cp) FROM public.gm_rule_customer_penalty cp WHERE cp.rule_id = p_rule_id),
    'limits', (SELECT to_jsonb(fl) FROM public.gm_rule_financial_limits fl WHERE fl.rule_id = p_rule_id),
    'auto_actions', (SELECT to_jsonb(a) FROM public.gm_rule_auto_actions a WHERE a.rule_id = p_rule_id),
    'fraud', (SELECT to_jsonb(fr) FROM public.gm_rule_fraud_config fr WHERE fr.rule_id = p_rule_id),
    'evidence', (SELECT to_jsonb(ev) FROM public.gm_rule_evidence_config ev WHERE ev.rule_id = p_rule_id),
    'approvals', (SELECT coalesce(jsonb_agg(to_jsonb(at) ORDER BY at.approval_sequence), '[]'::jsonb)
                  FROM public.gm_rule_approval_thresholds at WHERE at.rule_id = p_rule_id),
    'advanced', (SELECT to_jsonb(ad) FROM public.gm_rule_advanced_config ad WHERE ad.rule_id = p_rule_id)
  );
$$;

-- ============================================================================
-- 11. SIMULATION ENGINE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_simulate_rule(
  p_scenario_type gm_rule_scenario_type,
  p_service_type TEXT,
  p_order_stage TEXT,
  p_cancellation_reason_id BIGINT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT NULL,
  p_order_gross NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule public.gm_rule_master;
  v_refund public.gm_rule_refund_config;
  v_limits public.gm_rule_financial_limits;
  v_merchant public.gm_rule_merchant_settlement;
  v_rider public.gm_rule_rider_settlement;
  v_penalty public.gm_rule_customer_penalty;
  v_refund_amt NUMERIC(14, 2);
  v_merchant_amt NUMERIC(14, 2);
  v_rider_amt NUMERIC(14, 2);
  v_penalty_amt NUMERIC(14, 2);
  v_result JSONB;
BEGIN
  v_rule := public.gm_resolve_rule(
    p_scenario_type, p_service_type, p_order_stage, p_cancellation_reason_id, p_triggered_by
  );
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_rule');
  END IF;

  SELECT * INTO v_refund FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  SELECT * INTO v_limits FROM public.gm_rule_financial_limits WHERE rule_id = v_rule.id;
  SELECT * INTO v_merchant FROM public.gm_rule_merchant_settlement WHERE rule_id = v_rule.id;
  SELECT * INTO v_rider FROM public.gm_rule_rider_settlement WHERE rule_id = v_rule.id;
  SELECT * INTO v_penalty FROM public.gm_rule_customer_penalty WHERE rule_id = v_rule.id;

  v_refund_amt := CASE WHEN coalesce(v_refund.refund_allowed, false) THEN
    public.gm_calc_pct_or_flat(
      v_refund.refund_pct, v_refund.refund_flat_amount, p_order_gross,
      coalesce(v_limits.max_refund_amount, v_refund.max_refund_amount),
      coalesce(v_limits.min_refund_amount, v_refund.min_refund_amount)
    ) ELSE 0 END;

  IF v_refund_amt > p_order_gross THEN
    v_refund_amt := p_order_gross;
  END IF;

  v_merchant_amt := public.gm_calc_pct_or_flat(v_merchant.merchant_receives_pct, NULL, p_order_gross, NULL, NULL);
  v_rider_amt := public.gm_calc_pct_or_flat(v_rider.rider_receives_pct, NULL, p_order_gross, NULL, NULL);
  v_penalty_amt := public.gm_calc_pct_or_flat(
    v_penalty.customer_penalty_pct, v_penalty.customer_flat_penalty, p_order_gross,
    v_limits.max_penalty_amount, NULL
  );

  v_result := jsonb_build_object(
    'ok', true,
    'simulated', true,
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'rule_version', v_rule.version_no,
    'snapshot', public.gm_build_rule_snapshot(v_rule.id),
    'amounts', jsonb_build_object(
      'refund', v_refund_amt,
      'merchant_settlement', v_merchant_amt,
      'rider_settlement', v_rider_amt,
      'customer_penalty', v_penalty_amt,
      'order_gross', p_order_gross
    ),
    'approval_required', coalesce(v_refund.refund_approval_required, false)
      OR EXISTS (SELECT 1 FROM public.gm_rule_approval_thresholds t
                 WHERE t.rule_id = v_rule.id AND v_refund_amt >= t.threshold_amount)
  );

  INSERT INTO public.gm_rule_simulation_log (rule_id, simulated_by, input_context, output_result)
  VALUES (
    v_rule.id, p_actor_system_user_id,
    jsonb_build_object(
      'scenario_type', p_scenario_type,
      'service_type', p_service_type,
      'order_stage', p_order_stage,
      'cancellation_reason_id', p_cancellation_reason_id,
      'triggered_by', p_triggered_by,
      'order_gross', p_order_gross
    ),
    v_result
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 12. EXECUTION ENGINE (logs everything; idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_execute_rule(
  p_scenario_type gm_rule_scenario_type,
  p_order_id BIGINT,
  p_orders_food_id BIGINT DEFAULT NULL,
  p_core_order_id TEXT DEFAULT NULL,
  p_service_type TEXT DEFAULT 'FOOD',
  p_order_stage TEXT DEFAULT NULL,
  p_cancellation_reason_id BIGINT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT NULL,
  p_order_gross NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_simulate_only BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.gm_rule_master;
  v_refund public.gm_rule_refund_config;
  v_limits public.gm_rule_financial_limits;
  v_merchant_cfg public.gm_rule_merchant_settlement;
  v_rider_cfg public.gm_rule_rider_settlement;
  v_penalty_cfg public.gm_rule_customer_penalty;
  v_auto public.gm_rule_auto_actions;
  v_key TEXT;
  v_refund_amt NUMERIC(14, 2) := 0;
  v_penalty_amt NUMERIC(14, 2) := 0;
  v_comp_amt NUMERIC(14, 2) := 0;
  v_merchant_amt NUMERIC(14, 2) := 0;
  v_rider_amt NUMERIC(14, 2) := 0;
  v_exec_id BIGINT;
  v_snapshot JSONB;
  v_result JSONB;
  v_legacy JSONB;
  v_wallet_id BIGINT;
  v_store_id BIGINT;
  v_ledger_id BIGINT;
  v_status gm_execution_status := 'COMPLETED';
BEGIN
  IF p_simulate_only THEN
    RETURN public.gm_simulate_rule(
      p_scenario_type, p_service_type, p_order_stage,
      p_cancellation_reason_id, p_triggered_by, p_order_gross, p_actor_system_user_id
    );
  END IF;

  v_key := coalesce(
    p_idempotency_key,
    'gm_exec:' || p_scenario_type::text || ':' || coalesce(p_core_order_id, p_order_id::text)
      || ':' || coalesce(p_order_stage, 'any') || ':' || coalesce(p_triggered_by, 'any')
  );

  IF EXISTS (SELECT 1 FROM public.gm_rule_execution_log WHERE idempotency_key = v_key) THEN
    SELECT output_result INTO v_result FROM public.gm_rule_execution_log WHERE idempotency_key = v_key;
    RETURN v_result || jsonb_build_object('duplicate', true);
  END IF;

  v_rule := public.gm_resolve_rule(
    p_scenario_type, p_service_type, p_order_stage, p_cancellation_reason_id, p_triggered_by
  );

  IF v_rule.id IS NULL THEN
    -- Fallback to legacy payment engine if present
    IF p_scenario_type = 'CANCELLATION'
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'payment_apply_cancellation') THEN
      BEGIN
        v_legacy := public.payment_apply_cancellation(
          p_order_id, coalesce(p_orders_food_id, p_order_id),
          p_order_stage::payment_order_milestone,
          p_triggered_by::payment_cancelled_by,
          p_order_gross, p_actor_system_user_id, v_key
        );
        INSERT INTO public.gm_rule_execution_log (
          rule_id, rule_code, rule_version_no, order_id, core_order_id, orders_food_id,
          scenario_type, trigger_event, execution_status, input_context, output_result,
          idempotency_key, executed_by
        ) VALUES (
          NULL, 'LEGACY_PAYMENT_ENGINE', 0, p_order_id, p_core_order_id, p_orders_food_id,
          p_scenario_type, 'CANCELLATION', 'COMPLETED',
          jsonb_build_object('fallback', true), v_legacy, v_key, p_actor_system_user_id
        );
        RETURN v_legacy || jsonb_build_object('engine', 'legacy_payment');
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_rule_and_legacy_failed');
      END;
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_rule');
  END IF;

  SELECT * INTO v_refund FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  SELECT * INTO v_limits FROM public.gm_rule_financial_limits WHERE rule_id = v_rule.id;
  SELECT * INTO v_merchant_cfg FROM public.gm_rule_merchant_settlement WHERE rule_id = v_rule.id;
  SELECT * INTO v_rider_cfg FROM public.gm_rule_rider_settlement WHERE rule_id = v_rule.id;
  SELECT * INTO v_penalty_cfg FROM public.gm_rule_customer_penalty WHERE rule_id = v_rule.id;
  SELECT * INTO v_auto FROM public.gm_rule_auto_actions WHERE rule_id = v_rule.id;

  IF coalesce(v_refund.refund_allowed, false) THEN
    v_refund_amt := public.gm_calc_pct_or_flat(
      v_refund.refund_pct, v_refund.refund_flat_amount, p_order_gross,
      coalesce(v_limits.max_refund_amount, v_refund.max_refund_amount),
      coalesce(v_limits.min_refund_amount, v_refund.min_refund_amount)
    );
  END IF;
  IF v_refund_amt > p_order_gross THEN v_refund_amt := p_order_gross; END IF;

  v_merchant_amt := public.gm_calc_pct_or_flat(v_merchant_cfg.merchant_receives_pct, NULL, p_order_gross, NULL, NULL);
  v_rider_amt := public.gm_calc_pct_or_flat(v_rider_cfg.rider_receives_pct, NULL, p_order_gross, NULL, NULL);
  v_penalty_amt := public.gm_calc_pct_or_flat(
    v_penalty_cfg.customer_penalty_pct, v_penalty_cfg.customer_flat_penalty, p_order_gross,
    v_limits.max_penalty_amount, NULL
  );
  v_comp_amt := public.gm_calc_pct_or_flat(
    v_merchant_cfg.merchant_compensation_pct, NULL, p_order_gross, v_limits.max_compensation_amount, NULL
  ) + public.gm_calc_pct_or_flat(
    v_rider_cfg.rider_compensation_pct, NULL, p_order_gross, v_limits.max_compensation_amount, NULL
  );

  IF coalesce(v_refund.refund_approval_required, false)
     OR EXISTS (
       SELECT 1 FROM public.gm_rule_approval_thresholds t
       WHERE t.rule_id = v_rule.id AND v_refund_amt >= t.threshold_amount
     ) THEN
    v_status := 'APPROVAL_REQUIRED';
  END IF;

  v_snapshot := public.gm_build_rule_snapshot(v_rule.id);

  -- Wallet / settlement side effects (when functions exist)
  IF v_status = 'COMPLETED' AND coalesce(v_auto.auto_wallet_adjustment, true) THEN
    IF p_orders_food_id IS NOT NULL THEN
      SELECT f.merchant_store_id INTO v_store_id
      FROM public.orders_food f
      WHERE f.id = p_orders_food_id OR f.order_id = p_order_id
      LIMIT 1;
    END IF;

    IF v_store_id IS NOT NULL AND v_merchant_amt > 0
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_or_create_merchant_wallet') THEN
      v_wallet_id := public.get_or_create_merchant_wallet(v_store_id);
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_credit') THEN
        v_ledger_id := public.merchant_wallet_credit(
          v_wallet_id, v_merchant_amt, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          CASE WHEN coalesce(v_merchant_cfg.settlement_hold, false) THEN 'LOCKED'::wallet_balance_type
               ELSE 'PENDING'::wallet_balance_type END,
          'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id),
          v_key || ':merchant',
          'GM rule merchant credit: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id)
        );
      END IF;
    END IF;

    IF v_refund_amt > 0 AND EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'payment_refund_ledger'
    ) THEN
      INSERT INTO public.payment_refund_ledger (
        order_id, party_type, wallet_id, direction, amount, status, idempotency_key, reason, metadata
      ) VALUES (
        p_order_id, 'CUSTOMER', v_wallet_id, 'CREDIT', v_refund_amt,
        CASE WHEN v_status = 'APPROVAL_REQUIRED' THEN 'PENDING'::payment_transaction_status
             ELSE 'PENDING'::payment_transaction_status END,
        v_key || ':refund',
        'GM rule refund: ' || v_rule.rule_code,
        jsonb_build_object('rule_id', v_rule.id, 'recipient', v_refund.refund_recipient)
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'engine', 'gm_rule_engine',
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'execution_status', v_status,
    'amounts', jsonb_build_object(
      'refund', v_refund_amt,
      'penalty', v_penalty_amt,
      'compensation', v_comp_amt,
      'merchant_settlement', v_merchant_amt,
      'rider_settlement', v_rider_amt
    ),
    'snapshot', v_snapshot
  );

  INSERT INTO public.gm_rule_execution_log (
    rule_id, rule_code, rule_version_no, order_id, core_order_id, orders_food_id,
    scenario_type, trigger_event, execution_status, input_context, output_result,
    applied_refund, applied_penalty, applied_compensation,
    applied_merchant_settlement, applied_rider_settlement,
    idempotency_key, executed_by
  ) VALUES (
    v_rule.id, v_rule.rule_code, v_rule.version_no, p_order_id, p_core_order_id, p_orders_food_id,
    p_scenario_type, coalesce(p_order_stage, 'UNKNOWN'), v_status,
    jsonb_build_object(
      'service_type', p_service_type, 'order_stage', p_order_stage,
      'cancellation_reason_id', p_cancellation_reason_id, 'triggered_by', p_triggered_by,
      'order_gross', p_order_gross
    ),
    v_result,
    v_refund_amt, v_penalty_amt, v_comp_amt, v_merchant_amt, v_rider_amt,
    v_key, p_actor_system_user_id
  )
  RETURNING id INTO v_exec_id;

  v_result := v_result || jsonb_build_object('execution_log_id', v_exec_id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_execute_order_cancellation(
  p_order_id BIGINT,
  p_orders_food_id BIGINT,
  p_order_stage TEXT,
  p_triggered_by TEXT,
  p_service_type TEXT DEFAULT 'FOOD',
  p_cancellation_reason_id BIGINT DEFAULT NULL,
  p_order_gross NUMERIC DEFAULT 0,
  p_core_order_id TEXT DEFAULT NULL,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.gm_execute_rule(
    'CANCELLATION'::gm_rule_scenario_type,
    p_order_id, p_orders_food_id, p_core_order_id, p_service_type, p_order_stage,
    p_cancellation_reason_id, p_triggered_by, p_order_gross,
    p_actor_system_user_id, p_idempotency_key, false
  );
$$;

-- ============================================================================
-- 13. CLONE / ARCHIVE HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_clone_rule(
  p_source_rule_id BIGINT,
  p_new_rule_code TEXT,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_change_reason TEXT DEFAULT 'Cloned rule'
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id BIGINT;
  v_src public.gm_rule_master;
BEGIN
  SELECT * INTO v_src FROM public.gm_rule_master WHERE id = p_source_rule_id AND is_deleted = FALSE;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Source rule % not found', p_source_rule_id; END IF;

  INSERT INTO public.gm_rule_master (
    rule_code, rule_name, description, scenario_type, priority, active_status,
    effective_from, version_no, change_reason, cloned_from_rule_id, created_by, updated_by
  ) VALUES (
    p_new_rule_code, v_src.rule_name || ' (clone)', v_src.description, v_src.scenario_type,
    v_src.priority, 'DRAFT', NOW(), 1, p_change_reason, p_source_rule_id,
    p_actor_system_user_id, p_actor_system_user_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.gm_rule_conditions (rule_id, service_type, order_stage, cancellation_reason_id, triggered_by)
  SELECT v_new_id, service_type, order_stage, cancellation_reason_id, triggered_by
  FROM public.gm_rule_conditions WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_fault_allocation (rule_id, fault_bucket, customer_pct, merchant_pct, rider_pct, platform_pct, gatimitra_pct)
  SELECT v_new_id, fault_bucket, customer_pct, merchant_pct, rider_pct, platform_pct, gatimitra_pct
  FROM public.gm_rule_fault_allocation WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_platform_liability (rule_id, platform_bears_loss, liability_pct, customer_liability_pct, merchant_liability_pct, rider_liability_pct, gatimitra_liability_pct, internal_notes)
  SELECT v_new_id, platform_bears_loss, liability_pct, customer_liability_pct, merchant_liability_pct, rider_liability_pct, gatimitra_liability_pct, internal_notes
  FROM public.gm_rule_platform_liability WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_refund_config (rule_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount, platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct, tip_refund_pct, tax_refund_pct, coupon_restore, item_level_refund, order_level_refund, auto_refund, refund_approval_required, min_refund_amount, max_refund_amount)
  SELECT v_new_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount, platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct, tip_refund_pct, tax_refund_pct, coupon_restore, item_level_refund, order_level_refund, auto_refund, refund_approval_required, min_refund_amount, max_refund_amount
  FROM public.gm_rule_refund_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_merchant_settlement (rule_id, merchant_receives_pct, merchant_penalty_pct, merchant_compensation_pct, settlement_hold, settlement_hold_hours, settlement_notes)
  SELECT v_new_id, merchant_receives_pct, merchant_penalty_pct, merchant_compensation_pct, settlement_hold, settlement_hold_hours, settlement_notes
  FROM public.gm_rule_merchant_settlement WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_rider_settlement (rule_id, rider_receives_pct, rider_penalty_pct, rider_compensation_pct, min_rider_protection_amount, settlement_hold, settlement_hold_hours)
  SELECT v_new_id, rider_receives_pct, rider_penalty_pct, rider_compensation_pct, min_rider_protection_amount, settlement_hold, settlement_hold_hours
  FROM public.gm_rule_rider_settlement WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_customer_penalty (rule_id, customer_penalty_pct, customer_flat_penalty, warning_increment, account_restriction, temporary_block_hours)
  SELECT v_new_id, customer_penalty_pct, customer_flat_penalty, warning_increment, account_restriction, temporary_block_hours
  FROM public.gm_rule_customer_penalty WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_financial_limits (rule_id, max_refund_amount, min_refund_amount, max_penalty_amount, max_compensation_amount)
  SELECT v_new_id, max_refund_amount, min_refund_amount, max_penalty_amount, max_compensation_amount
  FROM public.gm_rule_financial_limits WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_auto_actions (rule_id, auto_cancel, auto_refund, auto_settlement_recalc, auto_notification, auto_ticket_creation, auto_wallet_adjustment, auto_fraud_review)
  SELECT v_new_id, auto_cancel, auto_refund, auto_settlement_recalc, auto_notification, auto_ticket_creation, auto_wallet_adjustment, auto_fraud_review
  FROM public.gm_rule_auto_actions WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_fraud_config (rule_id, mark_fraud, manual_review_required, blacklist_customer, blacklist_merchant, blacklist_rider, freeze_wallet, freeze_settlement, create_investigation_ticket)
  SELECT v_new_id, mark_fraud, manual_review_required, blacklist_customer, blacklist_merchant, blacklist_rider, freeze_wallet, freeze_settlement, create_investigation_ticket
  FROM public.gm_rule_fraud_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_evidence_config (rule_id, require_customer_evidence, require_rider_evidence, require_merchant_evidence, require_photo, require_video, require_admin_approval, require_support_approval)
  SELECT v_new_id, require_customer_evidence, require_rider_evidence, require_merchant_evidence, require_photo, require_video, require_admin_approval, require_support_approval
  FROM public.gm_rule_evidence_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_approval_thresholds (rule_id, threshold_amount, required_role_codes, approval_sequence)
  SELECT v_new_id, threshold_amount, required_role_codes, approval_sequence
  FROM public.gm_rule_approval_thresholds WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_advanced_config (rule_id, config)
  SELECT v_new_id, config FROM public.gm_rule_advanced_config WHERE rule_id = p_source_rule_id;

  RETURN v_new_id;
END;
$$;

-- ============================================================================
-- 14. MIGRATE payment_cancellation_rules → gm_rule_master (one-time bridge)
-- ============================================================================

DO $$
DECLARE r RECORD;
  v_rule_id BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_cancellation_rules'
  ) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM public.payment_cancellation_rules p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.gm_rule_master g
      WHERE g.legacy_payment_rule_id = p.id
    )
  LOOP
    INSERT INTO public.gm_rule_master (
      rule_code, rule_name, description, scenario_type, priority, active_status,
      effective_from, effective_to, version_no, legacy_payment_rule_id, created_at, updated_at
    ) VALUES (
      'LEGACY_' || r.rule_code,
      r.rule_name,
      'Migrated from payment_cancellation_rules',
      'CANCELLATION',
      r.priority,
      CASE WHEN r.is_active THEN 'ACTIVE'::gm_rule_active_status ELSE 'INACTIVE'::gm_rule_active_status END,
      r.effective_from,
      r.effective_to,
      1,
      r.id,
      r.created_at,
      r.updated_at
    )
    ON CONFLICT (rule_code, version_no) DO NOTHING
    RETURNING id INTO v_rule_id;

    IF v_rule_id IS NOT NULL THEN
      INSERT INTO public.gm_rule_conditions (rule_id, service_type, order_stage, triggered_by)
      VALUES (v_rule_id, upper(r.service_type), r.order_milestone::text, r.cancelled_by::text)
      ON CONFLICT (rule_id) DO NOTHING;

      INSERT INTO public.gm_rule_refund_config (
        rule_id, refund_allowed, refund_pct, auto_refund, refund_approval_required
      ) VALUES (
        v_rule_id,
        r.customer_refund_mode IN ('FULL', 'PARTIAL'),
        CASE WHEN r.customer_refund_mode = 'NONE' THEN 0 ELSE coalesce(r.customer_refund_value, 100) END,
        false,
        false
      ) ON CONFLICT (rule_id) DO NOTHING;

      INSERT INTO public.gm_rule_merchant_settlement (rule_id, merchant_receives_pct)
      VALUES (
        v_rule_id,
        CASE WHEN r.merchant_gets_payment THEN coalesce(r.merchant_payment_value, 0) ELSE 0 END
      ) ON CONFLICT (rule_id) DO NOTHING;

      INSERT INTO public.gm_rule_fault_allocation (rule_id, fault_bucket)
      VALUES (v_rule_id, 'NO_FAULT')
      ON CONFLICT (rule_id) DO NOTHING;

      INSERT INTO public.gm_rule_platform_liability (
        rule_id, platform_bears_loss, gatimitra_liability_pct
      ) VALUES (
        v_rule_id,
        NOT coalesce(r.platform_keeps_commission, true),
        100
      ) ON CONFLICT (rule_id) DO NOTHING;

      INSERT INTO public.gm_rule_auto_actions (rule_id) VALUES (v_rule_id) ON CONFLICT (rule_id) DO NOTHING;
      INSERT INTO public.gm_rule_financial_limits (rule_id) VALUES (v_rule_id) ON CONFLICT (rule_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 15. RLS (super-admin / service_role)
-- ============================================================================

ALTER TABLE public.gm_rule_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gm_rule_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gm_rule_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY gm_rule_master_service_all ON public.gm_rule_master
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY gm_rule_execution_service_all ON public.gm_rule_execution_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY gm_rule_audit_service_all ON public.gm_rule_audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT EXECUTE ON FUNCTION public.gm_catalog_service_types TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_catalog_order_stages TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_catalog_triggered_by TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_simulate_rule TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_execute_rule TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_execute_order_cancellation TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_clone_rule TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_build_rule_snapshot TO service_role;

COMMENT ON FUNCTION public.gm_execute_rule IS
  'Central order financial rule executor. Always writes gm_rule_execution_log. Falls back to payment_apply_cancellation when no GM rule matches.';
