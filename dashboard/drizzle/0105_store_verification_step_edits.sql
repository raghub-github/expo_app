-- Track per-field edits during store verification (who changed what and when).
-- Each row = one field edit on one step by one agent.

CREATE TABLE IF NOT EXISTS public.store_verification_step_edits (
  id BIGSERIAL NOT NULL,
  store_id BIGINT NOT NULL,
  step_number SMALLINT NOT NULL,
  field_key TEXT NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  edited_by INTEGER NULL,
  edited_by_name TEXT NULL,
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT store_verification_step_edits_pkey PRIMARY KEY (id),
  CONSTRAINT store_verification_step_edits_step_check CHECK (step_number >= 1 AND step_number <= 9)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS store_verification_step_edits_store_step_idx
  ON public.store_verification_step_edits (store_id, step_number);

CREATE INDEX IF NOT EXISTS store_verification_step_edits_edited_at_idx
  ON public.store_verification_step_edits (edited_at);
