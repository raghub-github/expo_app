-- Mirror of backend/drizzle/0466_merchant_store_onboarding_resubmissions.sql
-- Apply once on shared DB (from partnersite or backend drizzle).

BEGIN;

CREATE TABLE IF NOT EXISTS public.merchant_store_onboarding_resubmissions (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES public.merchant_stores (id) ON DELETE CASCADE,
  parent_id BIGINT NULL,
  verification_step INTEGER NOT NULL CHECK (verification_step BETWEEN 1 AND 8),
  field_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  r2_object_key TEXT NULL,
  proxy_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'discarded')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by_auth_user_id UUID NULL,
  applied_at TIMESTAMPTZ NULL,
  applied_by_system_user_id INTEGER NULL,
  discarded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.merchant_store_onboarding_resubmissions IS
  'Pending partner onboarding re-submissions. One pending row per (store, step, field). Admin verify applies payload into main tables.';

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_pending_uniq
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step, field_key)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_store_pending_idx
  ON public.merchant_store_onboarding_resubmissions (store_id, submitted_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_step_pending_idx
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step)
  WHERE status = 'pending';

COMMIT;
