-- Migration: 0466_merchant_store_onboarding_resubmissions
-- Purpose: Stage partner/AM re-uploads after admin rejection so live
--   merchant_stores / merchant_store_documents stay unchanged until
--   dashboard "Verify again" promotes the pending payload into main columns
--   and deletes replaced R2 objects.
-- Multi-cycle: reject → resubmit (many times) → verify → reject again…
--   Only one pending row per (store, step, field); applied/discarded kept as history.
-- Safe to re-run.

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
  -- Cycle counter for multi reject/resubmit (1 = first fix after a reject round).
  cycle_number INTEGER NOT NULL DEFAULT 1,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by_auth_user_id UUID NULL,
  applied_at TIMESTAMPTZ NULL,
  applied_by_system_user_id INTEGER NULL,
  discarded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing installs that already created the table without cycle_number
ALTER TABLE public.merchant_store_onboarding_resubmissions
  ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;

COMMENT ON TABLE public.merchant_store_onboarding_resubmissions IS
  'Pending partner/AM onboarding re-submissions. One pending row per (store, step, field). Multi reject/resubmit cycles supported; Verify again applies payload into main tables and clears replaced R2 keys.';

COMMENT ON COLUMN public.merchant_store_onboarding_resubmissions.field_key IS
  'Logical field: fssai|pan|aadhaar|gst|bank_proof|banner_url|store_name|…';

COMMENT ON COLUMN public.merchant_store_onboarding_resubmissions.payload IS
  'Field values + proxy URLs to apply on verify (same shape as onboarding form fields).';

COMMENT ON COLUMN public.merchant_store_onboarding_resubmissions.r2_object_key IS
  'R2 object key when a file was uploaded (same onboarding path conventions).';

COMMENT ON COLUMN public.merchant_store_onboarding_resubmissions.cycle_number IS
  'Increments per reject round for this store/step/field (history of applied/discarded rows).';

COMMENT ON COLUMN public.merchant_store_onboarding_resubmissions.status IS
  'pending = awaiting admin verify; applied = promoted to live tables; discarded = superseded by newer resubmit or fresh reject.';

-- Only one pending row per store/step/field (allows unlimited applied/discarded history)
CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_pending_uniq
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step, field_key)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_store_pending_idx
  ON public.merchant_store_onboarding_resubmissions (store_id, submitted_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_step_pending_idx
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_history_idx
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step, field_key, submitted_at DESC);

COMMIT;
