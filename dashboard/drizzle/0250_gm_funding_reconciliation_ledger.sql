-- ============================================================================
-- 0250: Refund funding, penalty recovery, double-entry reconciliation & ledger
-- Run AFTER 0249_gm_financial_responsibility_matrix.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.gm_refund_funding_source AS ENUM (
    'MERCHANT_WALLET',
    'RIDER_WALLET',
    'GATIMITRA_WALLET',
    'MERCHANT_SETTLEMENT',
    'RIDER_SETTLEMENT',
    'SHARED_LIABILITY_POOL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gm_merchant_penalty_recovery_source AS ENUM (
    'MERCHANT_WALLET',
    'MERCHANT_SETTLEMENT',
    'MERCHANT_SECURITY_DEPOSIT',
    'FUTURE_SETTLEMENT',
    'EXTERNAL_RECOVERY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gm_rider_penalty_recovery_source AS ENUM (
    'RIDER_WALLET',
    'RIDER_EARNINGS',
    'RIDER_SECURITY_DEPOSIT',
    'FUTURE_SETTLEMENT',
    'EXTERNAL_RECOVERY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gm_customer_penalty_recovery_source AS ENUM (
    'CUSTOMER_WALLET',
    'STORED_CREDITS',
    'FUTURE_ORDERS',
    'EXTERNAL_RECOVERY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Funding & recovery configuration (one row per rule)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gm_rule_funding_config (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id) ON DELETE CASCADE,
  refund_funding_source public.gm_refund_funding_source NOT NULL DEFAULT 'SHARED_LIABILITY_POOL',
  refund_fund_merchant_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  refund_fund_rider_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  refund_fund_platform_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  refund_fund_customer_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  merchant_penalty_recovery_source public.gm_merchant_penalty_recovery_source NOT NULL DEFAULT 'MERCHANT_WALLET',
  rider_penalty_recovery_source public.gm_rider_penalty_recovery_source NOT NULL DEFAULT 'RIDER_WALLET',
  customer_penalty_recovery_source public.gm_customer_penalty_recovery_source NOT NULL DEFAULT 'CUSTOMER_WALLET',
  platform_wallet_debit BOOLEAN NOT NULL DEFAULT FALSE,
  platform_wallet_credit BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT gm_rule_funding_config_rule_uniq UNIQUE (rule_id),
  CONSTRAINT gm_rule_funding_refund_split_100 CHECK (
    round(
      refund_fund_merchant_pct + refund_fund_rider_pct
      + refund_fund_platform_pct + refund_fund_customer_pct, 2
    ) = 100.00
  )
);

COMMENT ON TABLE public.gm_rule_funding_config IS
  'Defines who funds refunds and from where penalties are recovered. Split must sum to 100%.';

-- ---------------------------------------------------------------------------
-- 3. Double-entry execution ledger (immutable audit trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gm_financial_execution_ledger (
  id BIGSERIAL PRIMARY KEY,
  execution_log_id BIGINT REFERENCES public.gm_rule_execution_log(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL,
  rule_id BIGINT NOT NULL REFERENCES public.gm_rule_master(id),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'WALLET', 'SETTLEMENT', 'PENALTY', 'REFUND', 'COMPENSATION',
      'REFUND_FUNDING', 'AUDIT'
    )
  ),
  party_type TEXT NOT NULL CHECK (
    party_type IN ('CUSTOMER', 'MERCHANT', 'RIDER', 'PLATFORM')
  ),
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  funding_or_recovery_source TEXT,
  wallet_id BIGINT,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gm_financial_execution_ledger_idempotency_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS gm_financial_execution_ledger_exec_idx
  ON public.gm_financial_execution_ledger(execution_log_id);
CREATE INDEX IF NOT EXISTS gm_financial_execution_ledger_order_idx
  ON public.gm_financial_execution_ledger(order_id, created_at DESC);

COMMENT ON TABLE public.gm_financial_execution_ledger IS
  'Double-entry ledger lines for every rule execution — refund funding, penalties, settlements, wallet moves.';

-- ---------------------------------------------------------------------------
-- 4. Resolve effective refund funding split from rule config
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_resolve_refund_funding_split(p_rule_id BIGINT)
RETURNS TABLE(
  merchant_pct NUMERIC,
  rider_pct NUMERIC,
  platform_pct NUMERIC,
  customer_pct NUMERIC,
  primary_source TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_funding public.gm_rule_funding_config;
  v_liability public.gm_rule_platform_liability;
BEGIN
  SELECT * INTO v_funding FROM public.gm_rule_funding_config WHERE rule_id = p_rule_id;
  SELECT * INTO v_liability FROM public.gm_rule_platform_liability WHERE rule_id = p_rule_id;

  IF v_funding.rule_id IS NULL THEN
    merchant_pct := coalesce(v_liability.merchant_liability_pct, 0);
    rider_pct := coalesce(v_liability.rider_liability_pct, 0);
    platform_pct := coalesce(v_liability.gatimitra_liability_pct, 100);
    customer_pct := coalesce(v_liability.customer_liability_pct, 0);
    primary_source := 'SHARED_LIABILITY_POOL';
    RETURN NEXT;
    RETURN;
  END IF;

  primary_source := v_funding.refund_funding_source::text;

  CASE v_funding.refund_funding_source
    WHEN 'MERCHANT_WALLET', 'MERCHANT_SETTLEMENT' THEN
      merchant_pct := 100; rider_pct := 0; platform_pct := 0; customer_pct := 0;
    WHEN 'RIDER_WALLET', 'RIDER_SETTLEMENT' THEN
      merchant_pct := 0; rider_pct := 100; platform_pct := 0; customer_pct := 0;
    WHEN 'GATIMITRA_WALLET' THEN
      merchant_pct := 0; rider_pct := 0; platform_pct := 100; customer_pct := 0;
    ELSE
      merchant_pct := v_funding.refund_fund_merchant_pct;
      rider_pct := v_funding.refund_fund_rider_pct;
      platform_pct := v_funding.refund_fund_platform_pct;
      customer_pct := v_funding.refund_fund_customer_pct;
      IF merchant_pct + rider_pct + platform_pct + customer_pct = 0 THEN
        merchant_pct := coalesce(v_liability.merchant_liability_pct, 0);
        rider_pct := coalesce(v_liability.rider_liability_pct, 0);
        platform_pct := coalesce(v_liability.gatimitra_liability_pct, 100);
        customer_pct := coalesce(v_liability.customer_liability_pct, 0);
      END IF;
  END CASE;

  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Build funding + recovery plan with ledger lines
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_build_funding_reconciliation_plan(
  p_rule_id BIGINT,
  p_amounts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_funding public.gm_rule_funding_config;
  v_split RECORD;
  v_refund NUMERIC(14, 2);
  v_m_refund_fund NUMERIC(14, 2) := 0;
  v_r_refund_fund NUMERIC(14, 2) := 0;
  v_p_refund_fund NUMERIC(14, 2) := 0;
  v_c_refund_fund NUMERIC(14, 2) := 0;
  v_entries JSONB := '[]'::jsonb;
  v_penalties JSONB := '[]'::jsonb;
  v_m_penalty NUMERIC(14, 2);
  v_r_penalty NUMERIC(14, 2);
  v_c_penalty NUMERIC(14, 2);
  v_m_settle NUMERIC(14, 2);
  v_r_settle NUMERIC(14, 2);
  v_m_comp NUMERIC(14, 2);
  v_r_comp NUMERIC(14, 2);
  v_c_comp NUMERIC(14, 2);
  v_p_comp NUMERIC(14, 2);
  v_m_src TEXT;
  v_r_src TEXT;
  v_c_src TEXT;
BEGIN
  SELECT * INTO v_funding FROM public.gm_rule_funding_config WHERE rule_id = p_rule_id;
  SELECT * INTO v_split FROM public.gm_resolve_refund_funding_split(p_rule_id);

  v_refund := coalesce((p_amounts->>'refund')::numeric, 0);
  v_m_penalty := coalesce((p_amounts->'merchant'->>'penalty')::numeric, 0);
  v_r_penalty := coalesce((p_amounts->'rider'->>'penalty')::numeric, 0);
  v_c_penalty := coalesce((p_amounts->'customer'->>'penalty')::numeric, 0);
  v_m_settle := coalesce((p_amounts->'merchant'->>'settlement')::numeric, 0);
  v_r_settle := coalesce((p_amounts->'rider'->>'settlement')::numeric, 0);
  v_m_comp := coalesce((p_amounts->'merchant'->>'compensation')::numeric, 0);
  v_r_comp := coalesce((p_amounts->'rider'->>'compensation')::numeric, 0);
  v_c_comp := coalesce((p_amounts->'customer'->>'compensation')::numeric, 0);
  v_p_comp := coalesce((p_amounts->'platform'->>'compensation')::numeric, 0);

  v_m_src := coalesce(v_funding.merchant_penalty_recovery_source::text, 'MERCHANT_WALLET');
  v_r_src := coalesce(v_funding.rider_penalty_recovery_source::text, 'RIDER_WALLET');
  v_c_src := coalesce(v_funding.customer_penalty_recovery_source::text, 'CUSTOMER_WALLET');

  IF v_refund > 0 THEN
    v_m_refund_fund := round(v_refund * v_split.merchant_pct / 100.0, 2);
    v_r_refund_fund := round(v_refund * v_split.rider_pct / 100.0, 2);
    v_p_refund_fund := round(v_refund * v_split.platform_pct / 100.0, 2);
    v_c_refund_fund := v_refund - v_m_refund_fund - v_r_refund_fund - v_p_refund_fund;

    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'REFUND', 'party_type', 'CUSTOMER', 'direction', 'CREDIT',
      'amount', v_refund, 'funding_or_recovery_source', NULL
    );

    IF v_m_refund_fund > 0 THEN
      v_entries := v_entries || jsonb_build_object(
        'entry_type', 'REFUND_FUNDING', 'party_type', 'MERCHANT', 'direction', 'DEBIT',
        'amount', v_m_refund_fund,
        'funding_or_recovery_source', coalesce(v_split.primary_source, 'MERCHANT_WALLET')
      );
    END IF;
    IF v_r_refund_fund > 0 THEN
      v_entries := v_entries || jsonb_build_object(
        'entry_type', 'REFUND_FUNDING', 'party_type', 'RIDER', 'direction', 'DEBIT',
        'amount', v_r_refund_fund,
        'funding_or_recovery_source', coalesce(v_split.primary_source, 'RIDER_WALLET')
      );
    END IF;
    IF v_p_refund_fund > 0 THEN
      v_entries := v_entries || jsonb_build_object(
        'entry_type', 'REFUND_FUNDING', 'party_type', 'PLATFORM', 'direction', 'DEBIT',
        'amount', v_p_refund_fund,
        'funding_or_recovery_source', 'GATIMITRA_WALLET'
      );
    END IF;
    IF v_c_refund_fund > 0 THEN
      v_entries := v_entries || jsonb_build_object(
        'entry_type', 'REFUND_FUNDING', 'party_type', 'CUSTOMER', 'direction', 'DEBIT',
        'amount', v_c_refund_fund,
        'funding_or_recovery_source', 'CUSTOMER_WALLET'
      );
    END IF;
  END IF;

  IF v_m_penalty > 0 THEN
    v_penalties := v_penalties || jsonb_build_object(
      'party', 'MERCHANT', 'amount', v_m_penalty, 'recovery_source', v_m_src
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'PENALTY', 'party_type', 'MERCHANT', 'direction', 'DEBIT',
      'amount', v_m_penalty, 'funding_or_recovery_source', v_m_src
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'PENALTY', 'party_type', 'PLATFORM', 'direction', 'CREDIT',
      'amount', v_m_penalty, 'funding_or_recovery_source', v_m_src
    );
  END IF;

  IF v_r_penalty > 0 THEN
    v_penalties := v_penalties || jsonb_build_object(
      'party', 'RIDER', 'amount', v_r_penalty, 'recovery_source', v_r_src
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'PENALTY', 'party_type', 'RIDER', 'direction', 'DEBIT',
      'amount', v_r_penalty, 'funding_or_recovery_source', v_r_src
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'PENALTY', 'party_type', 'PLATFORM', 'direction', 'CREDIT',
      'amount', v_r_penalty, 'funding_or_recovery_source', v_r_src
    );
  END IF;

  IF v_c_penalty > 0 THEN
    v_penalties := v_penalties || jsonb_build_object(
      'party', 'CUSTOMER', 'amount', v_c_penalty, 'recovery_source', v_c_src
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'PENALTY', 'party_type', 'CUSTOMER', 'direction', 'DEBIT',
      'amount', v_c_penalty, 'funding_or_recovery_source', v_c_src
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'PENALTY', 'party_type', 'PLATFORM', 'direction', 'CREDIT',
      'amount', v_c_penalty, 'funding_or_recovery_source', v_c_src
    );
  END IF;

  IF v_m_settle > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'SETTLEMENT', 'party_type', 'MERCHANT', 'direction', 'CREDIT',
      'amount', v_m_settle, 'funding_or_recovery_source', 'MERCHANT_SETTLEMENT'
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'SETTLEMENT', 'party_type', 'PLATFORM', 'direction', 'DEBIT',
      'amount', v_m_settle, 'funding_or_recovery_source', 'MERCHANT_SETTLEMENT'
    );
  END IF;

  IF v_r_settle > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'SETTLEMENT', 'party_type', 'RIDER', 'direction', 'CREDIT',
      'amount', v_r_settle, 'funding_or_recovery_source', 'RIDER_SETTLEMENT'
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'SETTLEMENT', 'party_type', 'PLATFORM', 'direction', 'DEBIT',
      'amount', v_r_settle, 'funding_or_recovery_source', 'RIDER_SETTLEMENT'
    );
  END IF;

  IF v_m_comp > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'MERCHANT', 'direction', 'CREDIT',
      'amount', v_m_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'PLATFORM', 'direction', 'DEBIT',
      'amount', v_m_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
  END IF;

  IF v_r_comp > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'RIDER', 'direction', 'CREDIT',
      'amount', v_r_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'PLATFORM', 'direction', 'DEBIT',
      'amount', v_r_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
  END IF;

  IF v_c_comp > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'CUSTOMER', 'direction', 'CREDIT',
      'amount', v_c_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'PLATFORM', 'direction', 'DEBIT',
      'amount', v_c_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
  END IF;

  IF v_p_comp > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'entry_type', 'COMPENSATION', 'party_type', 'PLATFORM', 'direction', 'CREDIT',
      'amount', v_p_comp, 'funding_or_recovery_source', 'GATIMITRA_WALLET'
    );
  END IF;

  RETURN jsonb_build_object(
    'refund', jsonb_build_object(
      'triggered', v_refund,
      'funded_total', v_m_refund_fund + v_r_refund_fund + v_p_refund_fund + v_c_refund_fund,
      'funding_source', coalesce(v_split.primary_source, 'SHARED_LIABILITY_POOL'),
      'split', jsonb_build_object(
        'merchant_pct', v_split.merchant_pct,
        'rider_pct', v_split.rider_pct,
        'platform_pct', v_split.platform_pct,
        'customer_pct', v_split.customer_pct,
        'merchant_amount', v_m_refund_fund,
        'rider_amount', v_r_refund_fund,
        'platform_amount', v_p_refund_fund,
        'customer_amount', v_c_refund_fund
      )
    ),
    'penalties', v_penalties,
    'ledger_entries', v_entries,
    'funding_config', CASE WHEN v_funding.rule_id IS NOT NULL THEN to_jsonb(v_funding) ELSE NULL END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Double-entry + refund funding validation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_validate_financial_reconciliation(p_plan JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_entry JSONB;
  v_total_debits NUMERIC(14, 2) := 0;
  v_total_credits NUMERIC(14, 2) := 0;
  v_refund_triggered NUMERIC(14, 2);
  v_refund_funded NUMERIC(14, 2);
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_entry IN SELECT * FROM jsonb_array_elements(coalesce(p_plan->'ledger_entries', '[]'::jsonb))
  LOOP
    IF v_entry->>'direction' = 'DEBIT' THEN
      v_total_debits := v_total_debits + coalesce((v_entry->>'amount')::numeric, 0);
    ELSE
      v_total_credits := v_total_credits + coalesce((v_entry->>'amount')::numeric, 0);
    END IF;
  END LOOP;

  v_refund_triggered := coalesce((p_plan->'refund'->>'triggered')::numeric, 0);
  v_refund_funded := coalesce((p_plan->'refund'->>'funded_total')::numeric, 0);

  IF round(v_total_debits, 2) <> round(v_total_credits, 2) THEN
    v_errors := array_append(v_errors,
      format('Double-entry imbalance: debits=%s credits=%s', v_total_debits, v_total_credits));
  END IF;

  IF v_refund_triggered > 0 AND round(v_refund_funded, 2) <> round(v_refund_triggered, 2) THEN
    v_errors := array_append(v_errors,
      format('Refund funding mismatch: triggered=%s funded=%s', v_refund_triggered, v_refund_funded));
  END IF;

  IF v_refund_triggered = 0 AND v_refund_funded > 0 THEN
    v_errors := array_append(v_errors, 'Refund funded without refund triggered');
  END IF;

  RETURN jsonb_build_object(
    'ok', coalesce(array_length(v_errors, 1), 0) = 0,
    'errors', to_jsonb(v_errors),
    'total_debits', v_total_debits,
    'total_credits', v_total_credits,
    'refund_triggered', v_refund_triggered,
    'refund_funded', v_refund_funded,
    'balanced', round(v_total_debits, 2) = round(v_total_credits, 2)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Persist ledger lines
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_write_execution_ledger(
  p_execution_log_id BIGINT,
  p_order_id BIGINT,
  p_rule_id BIGINT,
  p_plan JSONB,
  p_idempotency_prefix TEXT,
  p_actor BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry JSONB;
  v_idx INT := 0;
  v_written INT := 0;
BEGIN
  FOR v_entry IN SELECT * FROM jsonb_array_elements(coalesce(p_plan->'ledger_entries', '[]'::jsonb))
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.gm_financial_execution_ledger (
      execution_log_id, order_id, rule_id, entry_type, party_type, direction, amount,
      funding_or_recovery_source, idempotency_key, metadata, executed_by
    ) VALUES (
      p_execution_log_id,
      p_order_id,
      p_rule_id,
      v_entry->>'entry_type',
      v_entry->>'party_type',
      v_entry->>'direction',
      coalesce((v_entry->>'amount')::numeric, 0),
      v_entry->>'funding_or_recovery_source',
      p_idempotency_prefix || ':ledger:' || v_idx,
      v_entry,
      p_actor
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    v_written := v_written + 1;
  END LOOP;

  INSERT INTO public.gm_financial_execution_ledger (
    execution_log_id, order_id, rule_id, entry_type, party_type, direction, amount,
    funding_or_recovery_source, idempotency_key, metadata, executed_by
  ) VALUES (
    p_execution_log_id, p_order_id, p_rule_id, 'AUDIT', 'PLATFORM', 'CREDIT', 0,
    'AUDIT', p_idempotency_prefix || ':audit',
    jsonb_build_object('plan', p_plan, 'validation', public.gm_validate_financial_reconciliation(p_plan)),
    p_actor
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ledger_rows_written', v_written + 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Extend amount calc + snapshot
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_calc_rule_financial_amounts(
  p_rule_id BIGINT,
  p_order_gross NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_base JSONB;
  v_plan JSONB;
  v_validation JSONB;
  v_refund_cfg public.gm_rule_refund_config;
  v_limits public.gm_rule_financial_limits;
  v_merchant public.gm_rule_merchant_settlement;
  v_rider public.gm_rule_rider_settlement;
  v_customer public.gm_rule_customer_penalty;
  v_platform public.gm_rule_platform_liability;
  v_funding public.gm_rule_funding_config;
  v_refund_amt NUMERIC(14, 2) := 0;
  v_customer_penalty NUMERIC(14, 2) := 0;
  v_customer_comp NUMERIC(14, 2) := 0;
  v_merchant_settlement NUMERIC(14, 2) := 0;
  v_merchant_penalty NUMERIC(14, 2) := 0;
  v_merchant_comp NUMERIC(14, 2) := 0;
  v_rider_settlement NUMERIC(14, 2) := 0;
  v_rider_penalty NUMERIC(14, 2) := 0;
  v_rider_comp NUMERIC(14, 2) := 0;
  v_platform_comp NUMERIC(14, 2) := 0;
  v_platform_absorbed NUMERIC(14, 2) := 0;
  v_platform_impact NUMERIC(14, 2) := 0;
BEGIN
  SELECT * INTO v_refund_cfg FROM public.gm_rule_refund_config WHERE rule_id = p_rule_id;
  SELECT * INTO v_limits FROM public.gm_rule_financial_limits WHERE rule_id = p_rule_id;
  SELECT * INTO v_merchant FROM public.gm_rule_merchant_settlement WHERE rule_id = p_rule_id;
  SELECT * INTO v_rider FROM public.gm_rule_rider_settlement WHERE rule_id = p_rule_id;
  SELECT * INTO v_customer FROM public.gm_rule_customer_penalty WHERE rule_id = p_rule_id;
  SELECT * INTO v_platform FROM public.gm_rule_platform_liability WHERE rule_id = p_rule_id;
  SELECT * INTO v_funding FROM public.gm_rule_funding_config WHERE rule_id = p_rule_id;

  IF coalesce(v_refund_cfg.refund_allowed, false) THEN
      v_refund_amt := public.gm_calc_pct_or_flat(
        v_refund_cfg.refund_pct, v_refund_cfg.refund_flat_amount, p_order_gross,
        coalesce(v_limits.max_refund_amount, v_refund_cfg.max_refund_amount),
        coalesce(v_limits.min_refund_amount, v_refund_cfg.min_refund_amount)
      );
    END IF;
    IF v_refund_amt > p_order_gross THEN v_refund_amt := p_order_gross; END IF;

    v_customer_penalty := public.gm_calc_pct_or_flat(
      v_customer.customer_penalty_pct, v_customer.customer_flat_penalty, p_order_gross,
      v_limits.max_penalty_amount, NULL
    );
    v_customer_comp := public.gm_calc_pct_or_flat(
      v_customer.customer_compensation_pct, v_customer.customer_compensation_flat, p_order_gross,
      v_limits.max_compensation_amount, NULL
    );
    v_merchant_settlement := public.gm_calc_pct_or_flat(
      v_merchant.merchant_receives_pct, NULL, p_order_gross, NULL, NULL
    );
    v_merchant_penalty := public.gm_calc_pct_or_flat(
      v_merchant.merchant_penalty_pct, v_merchant.merchant_flat_penalty, p_order_gross,
      v_limits.max_penalty_amount, NULL
    );
    v_merchant_comp := public.gm_calc_pct_or_flat(
      v_merchant.merchant_compensation_pct, v_merchant.merchant_compensation_flat, p_order_gross,
      v_limits.max_compensation_amount, NULL
    );
    v_rider_settlement := public.gm_calc_pct_or_flat(
      v_rider.rider_receives_pct, NULL, p_order_gross, NULL, NULL
    );
    v_rider_penalty := public.gm_calc_pct_or_flat(
      v_rider.rider_penalty_pct, v_rider.rider_flat_penalty, p_order_gross,
      v_limits.max_penalty_amount, NULL
    );
    v_rider_comp := public.gm_calc_pct_or_flat(
      v_rider.rider_compensation_pct, v_rider.rider_compensation_flat, p_order_gross,
      v_limits.max_compensation_amount, NULL
    );
    v_platform_comp := coalesce(v_platform.platform_compensation_flat, 0);
    v_platform_absorbed := public.gm_calc_pct_or_flat(
      v_platform.platform_absorbed_loss_pct, NULL, p_order_gross, NULL, NULL
    );
    v_platform_impact := public.gm_calc_pct_or_flat(
      v_platform.platform_settlement_impact_pct, NULL, p_order_gross, NULL, NULL
    );
    IF coalesce(v_platform.platform_bears_loss, false) AND v_platform_absorbed = 0 THEN
      v_platform_absorbed := public.gm_calc_pct_or_flat(
        v_platform.gatimitra_liability_pct, NULL, p_order_gross, NULL, NULL
      );
    END IF;

    v_base := jsonb_build_object(
      'refund', v_refund_amt,
      'penalty', v_customer_penalty + v_merchant_penalty + v_rider_penalty,
      'compensation', v_customer_comp + v_merchant_comp + v_rider_comp + v_platform_comp,
      'merchant_settlement', v_merchant_settlement,
      'rider_settlement', v_rider_settlement,
      'customer', jsonb_build_object(
        'refund', v_refund_amt, 'compensation', v_customer_comp, 'penalty', v_customer_penalty,
        'wallet_debit', coalesce(v_customer.customer_wallet_debit, false),
        'wallet_credit', coalesce(v_customer.customer_wallet_credit, false),
        'penalty_recovery_source', coalesce(v_funding.customer_penalty_recovery_source::text, 'CUSTOMER_WALLET')
      ),
      'merchant', jsonb_build_object(
        'settlement', v_merchant_settlement, 'compensation', v_merchant_comp, 'penalty', v_merchant_penalty,
        'settlement_hold', coalesce(v_merchant.settlement_hold, false),
        'settlement_hold_hours', coalesce(v_merchant.settlement_hold_hours, 0),
        'wallet_debit', coalesce(v_merchant.merchant_wallet_debit, false),
        'wallet_credit', coalesce(v_merchant.merchant_wallet_credit, true),
        'penalty_recovery_source', coalesce(v_funding.merchant_penalty_recovery_source::text, 'MERCHANT_WALLET')
      ),
      'rider', jsonb_build_object(
        'settlement', v_rider_settlement, 'compensation', v_rider_comp, 'penalty', v_rider_penalty,
        'settlement_hold', coalesce(v_rider.settlement_hold, false),
        'settlement_hold_hours', coalesce(v_rider.settlement_hold_hours, 0),
        'wallet_debit', coalesce(v_rider.rider_wallet_debit, false),
        'wallet_credit', coalesce(v_rider.rider_wallet_credit, false),
        'penalty_recovery_source', coalesce(v_funding.rider_penalty_recovery_source::text, 'RIDER_WALLET')
      ),
      'platform', jsonb_build_object(
        'liability_pct', coalesce(v_platform.gatimitra_liability_pct, 0),
        'compensation', v_platform_comp, 'absorbed_loss', v_platform_absorbed,
        'settlement_impact', v_platform_impact,
        'platform_bears_loss', coalesce(v_platform.platform_bears_loss, false),
        'wallet_debit', coalesce(v_funding.platform_wallet_debit, false),
        'wallet_credit', coalesce(v_funding.platform_wallet_credit, false)
      ),
      'order_gross', p_order_gross
    );

  v_plan := public.gm_build_funding_reconciliation_plan(p_rule_id, v_base);
  v_validation := public.gm_validate_financial_reconciliation(v_plan);

  RETURN v_base || jsonb_build_object(
    'reconciliation', jsonb_build_object(
      'plan', v_plan,
      'validation', v_validation
    )
  );
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
    'funding', (SELECT to_jsonb(fc) FROM public.gm_rule_funding_config fc WHERE fc.rule_id = p_rule_id),
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

-- ---------------------------------------------------------------------------
-- 9. Simulation + execution (validation gate + ledger writes)
-- ---------------------------------------------------------------------------

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
  v_amounts JSONB;
  v_validation JSONB;
  v_result JSONB;
BEGIN
  v_rule := public.gm_resolve_rule(
    p_scenario_type, p_service_type, p_order_stage, p_cancellation_reason_id, p_triggered_by
  );
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_rule');
  END IF;

  SELECT * INTO v_refund FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  v_amounts := public.gm_calc_rule_financial_amounts(v_rule.id, p_order_gross);
  v_validation := v_amounts->'reconciliation'->'validation';

  IF coalesce((v_validation->>'ok')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'reconciliation_validation_failed',
      'errors', v_validation->'errors',
      'amounts', v_amounts
    );
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'simulated', true,
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'rule_version', v_rule.version_no,
    'snapshot', public.gm_build_rule_snapshot(v_rule.id),
    'amounts', v_amounts,
    'reconciliation', v_amounts->'reconciliation',
    'approval_required', coalesce(v_refund.refund_approval_required, false)
      OR EXISTS (
        SELECT 1 FROM public.gm_rule_approval_thresholds t
        WHERE t.rule_id = v_rule.id
          AND (v_amounts->>'refund')::numeric >= t.threshold_amount
      )
  );

  INSERT INTO public.gm_rule_simulation_log (rule_id, simulated_by, input_context, output_result)
  VALUES (
    v_rule.id, p_actor_system_user_id,
    jsonb_build_object(
      'scenario_type', p_scenario_type, 'service_type', p_service_type,
      'order_stage', p_order_stage, 'cancellation_reason_id', p_cancellation_reason_id,
      'triggered_by', p_triggered_by, 'order_gross', p_order_gross
    ),
    v_result
  );

  RETURN v_result;
END;
$$;

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
  v_refund_cfg public.gm_rule_refund_config;
  v_auto public.gm_rule_auto_actions;
  v_funding public.gm_rule_funding_config;
  v_key TEXT;
  v_amounts JSONB;
  v_plan JSONB;
  v_validation JSONB;
  v_refund_amt NUMERIC(14, 2) := 0;
  v_penalty_amt NUMERIC(14, 2) := 0;
  v_comp_amt NUMERIC(14, 2) := 0;
  v_merchant_amt NUMERIC(14, 2) := 0;
  v_rider_amt NUMERIC(14, 2) := 0;
  v_merchant_penalty NUMERIC(14, 2) := 0;
  v_merchant_comp NUMERIC(14, 2) := 0;
  v_rider_comp NUMERIC(14, 2) := 0;
  v_rider_penalty NUMERIC(14, 2) := 0;
  v_merchant_hold BOOLEAN := FALSE;
  v_exec_id BIGINT;
  v_snapshot JSONB;
  v_result JSONB;
  v_legacy JSONB;
  v_wallet_id BIGINT;
  v_store_id BIGINT;
  v_status gm_execution_status := 'COMPLETED';
  v_m_recovery TEXT;
  v_r_recovery TEXT;
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
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'payment_apply_cancellation')
       AND p_scenario_type = 'CANCELLATION'::gm_rule_scenario_type THEN
      v_legacy := public.payment_apply_cancellation(
        p_order_id, coalesce(p_orders_food_id, p_order_id),
        coalesce(p_order_stage, 'PRE_PICKUP_CANCELLED')::payment_order_milestone,
        coalesce(p_triggered_by, 'SYSTEM')::payment_cancelled_by,
        p_order_gross, p_actor_system_user_id, v_key
      );
      RETURN v_legacy || jsonb_build_object('engine', 'legacy_payment', 'fallback', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_rule');
  END IF;

  SELECT * INTO v_refund_cfg FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  SELECT * INTO v_auto FROM public.gm_rule_auto_actions WHERE rule_id = v_rule.id;
  SELECT * INTO v_funding FROM public.gm_rule_funding_config WHERE rule_id = v_rule.id;

  v_amounts := public.gm_calc_rule_financial_amounts(v_rule.id, p_order_gross);
  v_plan := v_amounts->'reconciliation'->'plan';
  v_validation := v_amounts->'reconciliation'->'validation';

  IF coalesce((v_validation->>'ok')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'reconciliation_validation_failed',
      'errors', v_validation->'errors',
      'amounts', v_amounts,
      'rule_id', v_rule.id,
      'rule_code', v_rule.rule_code
    );
  END IF;

  v_refund_amt := coalesce((v_amounts->>'refund')::numeric, 0);
  v_penalty_amt := coalesce((v_amounts->>'penalty')::numeric, 0);
  v_comp_amt := coalesce((v_amounts->>'compensation')::numeric, 0);
  v_merchant_amt := coalesce((v_amounts->>'merchant_settlement')::numeric, 0);
  v_rider_amt := coalesce((v_amounts->>'rider_settlement')::numeric, 0);
  v_merchant_penalty := coalesce((v_amounts->'merchant'->>'penalty')::numeric, 0);
  v_merchant_comp := coalesce((v_amounts->'merchant'->>'compensation')::numeric, 0);
  v_rider_penalty := coalesce((v_amounts->'rider'->>'penalty')::numeric, 0);
  v_rider_comp := coalesce((v_amounts->'rider'->>'compensation')::numeric, 0);
  v_merchant_hold := coalesce((v_amounts->'merchant'->>'settlement_hold')::boolean, false);
  v_m_recovery := coalesce(v_funding.merchant_penalty_recovery_source::text, 'MERCHANT_WALLET');
  v_r_recovery := coalesce(v_funding.rider_penalty_recovery_source::text, 'RIDER_WALLET');

  IF coalesce(v_refund_cfg.refund_approval_required, false)
     OR EXISTS (
       SELECT 1 FROM public.gm_rule_approval_thresholds t
       WHERE t.rule_id = v_rule.id AND v_refund_amt >= t.threshold_amount
     ) THEN
    v_status := 'APPROVAL_REQUIRED';
  END IF;

  v_snapshot := public.gm_build_rule_snapshot(v_rule.id);

  IF v_status = 'COMPLETED' AND coalesce(v_auto.auto_wallet_adjustment, true) THEN
    IF p_orders_food_id IS NOT NULL THEN
      SELECT f.merchant_store_id INTO v_store_id
      FROM public.orders_food f
      WHERE f.id = p_orders_food_id OR f.order_id = p_order_id
      LIMIT 1;
    END IF;

    IF v_store_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_or_create_merchant_wallet') THEN
      v_wallet_id := public.get_or_create_merchant_wallet(v_store_id);

      IF coalesce((v_amounts->'merchant'->>'wallet_credit')::boolean, true) AND v_merchant_amt > 0
         AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_credit') THEN
        PERFORM public.merchant_wallet_credit(
          v_wallet_id, v_merchant_amt, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          CASE WHEN v_merchant_hold THEN 'LOCKED'::wallet_balance_type ELSE 'PENDING'::wallet_balance_type END,
          'ORDER'::wallet_reference_type, coalesce(p_orders_food_id, p_order_id),
          v_key || ':merchant:credit', 'GM settlement: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'entry_type', 'SETTLEMENT')
        );
      END IF;

      IF v_merchant_penalty > 0 AND v_m_recovery = 'MERCHANT_WALLET'
         AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_debit') THEN
        PERFORM public.merchant_wallet_debit(
          v_wallet_id, v_merchant_penalty, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          'PENDING'::wallet_balance_type, 'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id), v_key || ':merchant:penalty',
          'GM penalty recovery: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'recovery_source', v_m_recovery)
        );
      END IF;

      IF v_merchant_comp > 0 AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_credit') THEN
        PERFORM public.merchant_wallet_credit(
          v_wallet_id, v_merchant_comp, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          'PENDING'::wallet_balance_type, 'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id), v_key || ':merchant:comp',
          'GM compensation: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'entry_type', 'COMPENSATION')
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
        'PENDING'::payment_transaction_status, v_key || ':refund',
        'GM rule refund: ' || v_rule.rule_code,
        jsonb_build_object(
          'rule_id', v_rule.id,
          'recipient', v_refund_cfg.refund_recipient,
          'funding_plan', v_plan->'refund'
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    IF (v_rider_comp > 0 OR (v_rider_penalty > 0 AND v_r_recovery = 'RIDER_WALLET'))
       AND EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'payment_refund_ledger'
       ) THEN
      IF v_rider_comp > 0 THEN
        INSERT INTO public.payment_refund_ledger (
          order_id, party_type, wallet_id, direction, amount, status, idempotency_key, reason, metadata
        ) VALUES (
          p_order_id, 'RIDER', NULL, 'CREDIT', v_rider_comp,
          'PENDING'::payment_transaction_status, v_key || ':rider:comp',
          'GM rider compensation: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'recovery_source', v_r_recovery)
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
      IF v_rider_penalty > 0 AND v_r_recovery = 'RIDER_WALLET' THEN
        INSERT INTO public.payment_refund_ledger (
          order_id, party_type, wallet_id, direction, amount, status, idempotency_key, reason, metadata
        ) VALUES (
          p_order_id, 'RIDER', NULL, 'DEBIT', v_rider_penalty,
          'PENDING'::payment_transaction_status, v_key || ':rider:penalty',
          'GM rider penalty: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'recovery_source', v_r_recovery)
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'engine', 'gm_rule_engine',
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'execution_status', v_status,
    'amounts', v_amounts,
    'reconciliation', v_amounts->'reconciliation',
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

  PERFORM public.gm_write_execution_ledger(
    v_exec_id, p_order_id, v_rule.id, v_plan, v_key, p_actor_system_user_id
  );

  v_result := v_result || jsonb_build_object('execution_log_id', v_exec_id);

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gm_finalize_execution') THEN
    v_result := public.gm_finalize_execution(v_exec_id, v_rule.id, v_refund_amt, v_auto, v_result);
  END IF;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Default funding rows for existing rules + clone support
-- ---------------------------------------------------------------------------

INSERT INTO public.gm_rule_funding_config (
  rule_id, refund_funding_source,
  refund_fund_merchant_pct, refund_fund_rider_pct, refund_fund_platform_pct, refund_fund_customer_pct,
  merchant_penalty_recovery_source, rider_penalty_recovery_source, customer_penalty_recovery_source
)
SELECT
  m.id, 'SHARED_LIABILITY_POOL',
  coalesce(l.merchant_liability_pct, 0),
  coalesce(l.rider_liability_pct, 0),
  coalesce(l.gatimitra_liability_pct, 100),
  coalesce(l.customer_liability_pct, 0),
  'MERCHANT_WALLET', 'RIDER_WALLET', 'CUSTOMER_WALLET'
FROM public.gm_rule_master m
LEFT JOIN public.gm_rule_platform_liability l ON l.rule_id = m.id
WHERE NOT EXISTS (SELECT 1 FROM public.gm_rule_funding_config fc WHERE fc.rule_id = m.id)
ON CONFLICT (rule_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gm_clone_rule(
  p_source_rule_id BIGINT,
  p_new_rule_code TEXT,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_change_reason TEXT DEFAULT 'Cloned'
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_src public.gm_rule_master;
  v_new_id BIGINT;
BEGIN
  SELECT * INTO v_src FROM public.gm_rule_master WHERE id = p_source_rule_id AND is_deleted = FALSE;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Source rule % not found', p_source_rule_id;
  END IF;

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

  INSERT INTO public.gm_rule_platform_liability (
    rule_id, platform_bears_loss, liability_pct, customer_liability_pct, merchant_liability_pct,
    rider_liability_pct, gatimitra_liability_pct, internal_notes,
    platform_compensation_flat, platform_absorbed_loss_pct, platform_settlement_impact_pct
  )
  SELECT v_new_id, platform_bears_loss, liability_pct, customer_liability_pct, merchant_liability_pct,
    rider_liability_pct, gatimitra_liability_pct, internal_notes,
    platform_compensation_flat, platform_absorbed_loss_pct, platform_settlement_impact_pct
  FROM public.gm_rule_platform_liability WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_refund_config (
    rule_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount,
    platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct, tip_refund_pct,
    tax_refund_pct, coupon_restore, item_level_refund, order_level_refund, auto_refund,
    refund_approval_required, min_refund_amount, max_refund_amount
  )
  SELECT v_new_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount,
    platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct, tip_refund_pct,
    tax_refund_pct, coupon_restore, item_level_refund, order_level_refund, auto_refund,
    refund_approval_required, min_refund_amount, max_refund_amount
  FROM public.gm_rule_refund_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_funding_config (
    rule_id, refund_funding_source, refund_fund_merchant_pct, refund_fund_rider_pct,
    refund_fund_platform_pct, refund_fund_customer_pct,
    merchant_penalty_recovery_source, rider_penalty_recovery_source, customer_penalty_recovery_source,
    platform_wallet_debit, platform_wallet_credit
  )
  SELECT v_new_id, refund_funding_source, refund_fund_merchant_pct, refund_fund_rider_pct,
    refund_fund_platform_pct, refund_fund_customer_pct,
    merchant_penalty_recovery_source, rider_penalty_recovery_source, customer_penalty_recovery_source,
    platform_wallet_debit, platform_wallet_credit
  FROM public.gm_rule_funding_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_merchant_settlement (
    rule_id, merchant_receives_pct, merchant_penalty_pct, merchant_compensation_pct,
    settlement_hold, settlement_hold_hours, settlement_notes,
    merchant_flat_penalty, merchant_compensation_flat, merchant_wallet_debit, merchant_wallet_credit
  )
  SELECT v_new_id, merchant_receives_pct, merchant_penalty_pct, merchant_compensation_pct,
    settlement_hold, settlement_hold_hours, settlement_notes,
    merchant_flat_penalty, merchant_compensation_flat, merchant_wallet_debit, merchant_wallet_credit
  FROM public.gm_rule_merchant_settlement WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_rider_settlement (
    rule_id, rider_receives_pct, rider_penalty_pct, rider_compensation_pct,
    min_rider_protection_amount, settlement_hold, settlement_hold_hours,
    rider_flat_penalty, rider_compensation_flat, rider_wallet_debit, rider_wallet_credit
  )
  SELECT v_new_id, rider_receives_pct, rider_penalty_pct, rider_compensation_pct,
    min_rider_protection_amount, settlement_hold, settlement_hold_hours,
    rider_flat_penalty, rider_compensation_flat, rider_wallet_debit, rider_wallet_credit
  FROM public.gm_rule_rider_settlement WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_customer_penalty (
    rule_id, customer_penalty_pct, customer_flat_penalty, warning_increment,
    account_restriction, temporary_block_hours,
    customer_compensation_pct, customer_compensation_flat, customer_wallet_debit, customer_wallet_credit
  )
  SELECT v_new_id, customer_penalty_pct, customer_flat_penalty, warning_increment,
    account_restriction, temporary_block_hours,
    customer_compensation_pct, customer_compensation_flat, customer_wallet_debit, customer_wallet_credit
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

GRANT EXECUTE ON FUNCTION public.gm_resolve_refund_funding_split TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_build_funding_reconciliation_plan TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_validate_financial_reconciliation TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_write_execution_ledger TO service_role;
GRANT SELECT, INSERT ON public.gm_financial_execution_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.gm_rule_funding_config TO service_role;

COMMENT ON FUNCTION public.gm_execute_rule IS
  'Production executor — validates refund funding balance, writes double-entry ledger, applies wallet moves by source.';
