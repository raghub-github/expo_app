-- Append-only rejection audit + backfill columns if DB was created from an older 0139.

ALTER TABLE public.store_verification_step_rejections
  ADD COLUMN IF NOT EXISTS step_label TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by INTEGER NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_skip_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS merchant_resubmitted_at TIMESTAMPTZ NULL;

COMMENT ON TABLE public.store_verification_step_rejections IS 'Latest rejection per step; cleared when agent re-verifies';
COMMENT ON COLUMN public.store_verification_step_rejections.step_label IS 'Human-readable step name at rejection time';
COMMENT ON COLUMN public.store_verification_step_rejections.rejected_by IS 'system_users.id of agent who rejected';
COMMENT ON COLUMN public.store_verification_step_rejections.email_sent IS 'Whether rejection email was delivered';
COMMENT ON COLUMN public.store_verification_step_rejections.merchant_resubmitted_at IS 'Set when partner saves that step again after rejection';

CREATE TABLE IF NOT EXISTS public.store_verification_step_rejection_history (
  id BIGSERIAL NOT NULL,
  store_id BIGINT NOT NULL,
  step_number SMALLINT NOT NULL,
  step_label TEXT,
  rejection_reason TEXT NOT NULL,
  rejected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rejected_by INTEGER NULL,
  rejected_by_name TEXT NULL,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_skip_reason TEXT NULL,
  CONSTRAINT store_verification_step_rejection_history_pkey PRIMARY KEY (id),
  CONSTRAINT store_verification_step_rejection_hist_step_check CHECK (step_number >= 1 AND step_number <= 9)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS store_verification_step_rejection_history_store_step_idx
  ON public.store_verification_step_rejection_history USING btree (store_id, step_number DESC, rejected_at DESC)
  TABLESPACE pg_default;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_stores') THEN
    ALTER TABLE public.store_verification_step_rejection_history
      ADD CONSTRAINT store_verification_step_rejection_history_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
