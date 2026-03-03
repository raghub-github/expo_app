-- Migration: 0111_merchant_portal_activity_logs_updated
-- Ensures merchant_portal_activity_logs exists and is ready to record every change
-- on the merchant portal (settings page and all other store pages). Audit log shows in Activity.

-- Create table if not exists (exact schema you provided).
CREATE TABLE IF NOT EXISTS public.merchant_portal_activity_logs (
  id bigserial NOT NULL,
  store_id bigint NOT NULL,
  agent_id integer NULL,
  changed_section text NOT NULL,
  field_name text NOT NULL,
  old_value text NULL,
  new_value text NULL,
  change_reason text NULL,
  action_type text NOT NULL DEFAULT 'update'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_portal_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_portal_activity_logs_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Indexes (idempotent).
CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_store_id_idx
  ON public.merchant_portal_activity_logs USING btree (store_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_created_at_idx
  ON public.merchant_portal_activity_logs USING btree (created_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_agent_id_idx
  ON public.merchant_portal_activity_logs USING btree (agent_id) TABLESPACE pg_default;

-- Filter by section (outlet_timings, store_settings, etc.) for audit UI.
CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_store_section_idx
  ON public.merchant_portal_activity_logs USING btree (store_id, changed_section) TABLESPACE pg_default;

-- Optional metadata column for extra context (add if missing).
ALTER TABLE public.merchant_portal_activity_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Document table and sections so all portal changes are recorded here and show in Activity.
COMMENT ON TABLE public.merchant_portal_activity_logs IS
  'Audit log: every change on the merchant portal (settings and all store pages) is saved here. Used for Activity / audit view. changed_section: outlet_timings | store_settings | store_operations | delivery | address | plans | documents | bank_accounts | media | tickets | orders | verification_steps | profile.';

COMMENT ON COLUMN public.merchant_portal_activity_logs.changed_section IS
  'Section where change happened: outlet_timings, store_settings, store_operations, delivery, address, plans, documents, bank_accounts, media, tickets, orders, verification_steps, profile.';

COMMENT ON COLUMN public.merchant_portal_activity_logs.field_name IS
  'Field(s) that changed (e.g. operating_hours, delivery_radius_km, full_address).';

COMMENT ON COLUMN public.merchant_portal_activity_logs.old_value IS
  'Previous value (JSON or text) before change.';

COMMENT ON COLUMN public.merchant_portal_activity_logs.new_value IS
  'New value (JSON or text) after change.';
