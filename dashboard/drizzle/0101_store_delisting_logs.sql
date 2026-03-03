-- 0101_store_delisting_logs.sql
-- Store delisting audit log table for merchant_stores.
-- Tracks who delisted a store, when, why, and previous/new status flags.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'store_delisting_logs'
  ) THEN
    CREATE TABLE public.store_delisting_logs (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
      action_by_user_id BIGINT NOT NULL,
      action_by_role TEXT NOT NULL,

      delist_type TEXT NOT NULL, -- 'temporary_delisted' | 'permanently_delisted' | 'compliance_hold'
      reason_category TEXT NOT NULL,
      reason_description TEXT NOT NULL,

      previous_approval_status store_approval_status,
      new_approval_status store_approval_status,

      previous_operational_status store_operational_status,
      new_operational_status store_operational_status,

      previous_is_active BOOLEAN,
      new_is_active BOOLEAN,
      previous_is_accepting_orders BOOLEAN,
      new_is_accepting_orders BOOLEAN,
      previous_is_available BOOLEAN,
      new_is_available BOOLEAN,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS store_delisting_logs_store_id_idx
  ON public.store_delisting_logs (store_id);

CREATE INDEX IF NOT EXISTS store_delisting_logs_created_at_idx
  ON public.store_delisting_logs (created_at);

