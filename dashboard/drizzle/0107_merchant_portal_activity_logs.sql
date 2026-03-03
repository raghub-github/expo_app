-- Merchant Portal Activity Logs: audit trail for every change made by agents in the Merchant Portal.
-- Both old_value and new_value are stored for full historical tracking.

CREATE TABLE IF NOT EXISTS public.merchant_portal_activity_logs (
  id bigserial NOT NULL,
  store_id bigint NOT NULL,
  agent_id integer NULL,
  changed_section text NOT NULL,
  field_name text NOT NULL,
  old_value text NULL,
  new_value text NULL,
  change_reason text NULL,
  action_type text NOT NULL DEFAULT 'update',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_portal_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_portal_activity_logs_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_store_id_idx
  ON public.merchant_portal_activity_logs USING btree (store_id);

CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_created_at_idx
  ON public.merchant_portal_activity_logs USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_agent_id_idx
  ON public.merchant_portal_activity_logs USING btree (agent_id);

COMMENT ON TABLE public.merchant_portal_activity_logs IS 'Audit log for agent edits in Merchant Portal; old_value and new_value stored for every change.';
