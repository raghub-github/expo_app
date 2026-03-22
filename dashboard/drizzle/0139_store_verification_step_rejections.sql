-- Active rejection state per store step (survives un-verify DELETE on store_verification_steps).
-- Run 0140_store_verification_step_rejections_enriched.sql for audit history + any missing columns on old DBs.

CREATE TABLE IF NOT EXISTS public.store_verification_step_rejections (
  store_id BIGINT NOT NULL,
  step_number SMALLINT NOT NULL,
  rejected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rejection_reason TEXT NOT NULL,
  step_label TEXT,
  rejected_by INTEGER NULL,
  rejected_by_name TEXT NULL,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_skip_reason TEXT NULL,
  merchant_resubmitted_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT store_verification_step_rejections_pkey PRIMARY KEY (store_id, step_number),
  CONSTRAINT store_verification_step_rejections_step_check CHECK (step_number >= 1 AND step_number <= 9)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS store_verification_step_rejections_store_id_idx
  ON public.store_verification_step_rejections USING btree (store_id) TABLESPACE pg_default;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_stores') THEN
    ALTER TABLE public.store_verification_step_rejections
      ADD CONSTRAINT store_verification_step_rejections_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
