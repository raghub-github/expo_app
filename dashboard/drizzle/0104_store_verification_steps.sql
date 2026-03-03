-- Step-by-step store verification (9 onboarding steps).
-- One row per store per step; verified_at/verified_by record who verified and when.

CREATE TABLE IF NOT EXISTS public.store_verification_steps (
  id BIGSERIAL NOT NULL,
  store_id BIGINT NOT NULL,
  step_number SMALLINT NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_by INTEGER NULL,
  verified_by_name TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT store_verification_steps_pkey PRIMARY KEY (id),
  CONSTRAINT store_verification_steps_store_step_unique UNIQUE (store_id, step_number),
  CONSTRAINT store_verification_steps_step_number_check CHECK (step_number >= 1 AND step_number <= 9)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS store_verification_steps_store_id_idx
  ON public.store_verification_steps USING btree (store_id) TABLESPACE pg_default;

-- Optional FK; skip if merchant_stores not in same DB or you use different schema
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_stores') THEN
    ALTER TABLE public.store_verification_steps
      ADD CONSTRAINT store_verification_steps_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
