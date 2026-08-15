-- =============================================================================
-- 0539 — Unified wallet freeze (Rider + Merchant)
-- Idempotent. Catalog / singleton-row safe. No table rewrite. No backfill.
--
-- I/O impact:
--   * ADD COLUMN IF NOT EXISTS freeze_reason on rider_wallet
--     (PG 11+ NULL default — no rewrite)
--   * ADD COLUMN IF NOT EXISTS freeze columns on merchant_wallet
--     (already added by 0239 on most envs)
--   * CREATE TABLE IF NOT EXISTS payment_wallet_freeze_logs
--   * CREATE OR REPLACE freeze/unfreeze functions (catalog only)
--   * INSERT notification templates ON CONFLICT DO NOTHING
-- =============================================================================

-- Rider: persist the live freeze reason on the wallet row (history remains the audit log).
ALTER TABLE public.rider_wallet
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

COMMENT ON COLUMN public.rider_wallet.freeze_reason IS
  'Admin-entered reason while frozen. Cleared on unfreeze. History is kept in rider_wallet_freeze_history.';

-- Merchant wallet freeze columns (no-op if 0239 already applied).
ALTER TABLE public.merchant_wallet
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT;

ALTER TABLE public.merchant_wallet
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;

ALTER TABLE public.merchant_wallet
  ADD COLUMN IF NOT EXISTS frozen_by_system_user_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_wallet_frozen_by_system_user_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_wallet
      ADD CONSTRAINT merchant_wallet_frozen_by_system_user_id_fkey
      FOREIGN KEY (frozen_by_system_user_id)
      REFERENCES public.system_users(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS merchant_wallet_frozen_idx
  ON public.merchant_wallet (id)
  WHERE status = 'FROZEN';

-- Audit log for merchant freeze/unfreeze (reuse 0239 table if present).
DO $$ BEGIN
  CREATE TYPE payment_wallet_party_type AS ENUM ('MERCHANT', 'RIDER', 'PLATFORM', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_wallet_freeze_logs (
  id BIGSERIAL PRIMARY KEY,
  party_type payment_wallet_party_type NOT NULL,
  wallet_id BIGINT REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  previous_status wallet_status_type,
  new_status wallet_status_type NOT NULL,
  reason TEXT NOT NULL,
  frozen_by_system_user_id BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_wallet_freeze_logs_wallet_idx
  ON public.payment_wallet_freeze_logs (wallet_id, created_at DESC);

-- Freeze / unfreeze with row lock. Independent of payment_audit_log.
CREATE OR REPLACE FUNCTION public.payment_freeze_merchant_wallet(
  p_wallet_id BIGINT,
  p_reason TEXT,
  p_actor_system_user_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev wallet_status_type;
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'freeze reason is required';
  END IF;

  SELECT status INTO v_prev
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  UPDATE public.merchant_wallet
  SET status = 'FROZEN',
      frozen_reason = v_reason,
      frozen_at = NOW(),
      frozen_by_system_user_id = p_actor_system_user_id,
      updated_at = NOW()
  WHERE id = p_wallet_id;

  INSERT INTO public.payment_wallet_freeze_logs (
    party_type, wallet_id, previous_status, new_status, reason, frozen_by_system_user_id
  ) VALUES (
    'MERCHANT', p_wallet_id, v_prev, 'FROZEN', v_reason, p_actor_system_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_unfreeze_merchant_wallet(
  p_wallet_id BIGINT,
  p_actor_system_user_id BIGINT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev wallet_status_type;
  v_reason TEXT := COALESCE(NULLIF(BTRIM(p_reason), ''), 'Unfrozen by admin');
BEGIN
  SELECT status INTO v_prev
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  UPDATE public.merchant_wallet
  SET status = 'ACTIVE',
      frozen_reason = NULL,
      frozen_at = NULL,
      frozen_by_system_user_id = NULL,
      updated_at = NOW()
  WHERE id = p_wallet_id;

  INSERT INTO public.payment_wallet_freeze_logs (
    party_type, wallet_id, previous_status, new_status, reason, frozen_by_system_user_id
  ) VALUES (
    'MERCHANT', p_wallet_id, v_prev, 'ACTIVE', v_reason, p_actor_system_user_id
  );
END;
$$;

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES
  (
    'RIDER_WALLET_FROZEN', 'wallet', 'rider', 'all',
    'Wallet Frozen',
    'Your wallet withdrawals have been temporarily disabled. Reason: {{reason}}',
    '/earnings', 'high',
    '{"reason":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'RIDER_WALLET_UNFROZEN', 'wallet', 'rider', 'all',
    'Wallet Unfrozen',
    'Your wallet withdrawals are now available again.',
    '/earnings', 'high',
    '{}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_WALLET_FROZEN', 'wallet', 'merchant', 'all',
    'Wallet Frozen',
    'Your wallet withdrawals have been temporarily disabled. Reason: {{reason}}',
    '/earnings', 'high',
    '{"reason":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_WALLET_UNFROZEN', 'wallet', 'merchant', 'all',
    'Wallet Unfrozen',
    'Your wallet withdrawals are now available again.',
    '/earnings', 'high',
    '{}'::jsonb, 'en', TRUE, 4
  )
ON CONFLICT (code, locale) DO NOTHING;
