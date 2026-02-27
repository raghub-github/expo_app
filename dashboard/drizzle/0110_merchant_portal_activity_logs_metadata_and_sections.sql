-- Migration: 0110_merchant_portal_activity_logs_metadata_and_sections
-- 1) Adds optional metadata to activity logs and documents changed_section values
--    for the complete merchant portal (every change done by agents).
-- 2) Ensures merchant_store_operating_hours has updated_by_email and updated_by_at
--    for audit trail when agents save outlet timings.

-- merchant_store_operating_hours: audit columns for who last updated (agent email).
ALTER TABLE public.merchant_store_operating_hours
  ADD COLUMN IF NOT EXISTS updated_by_email text NULL,
  ADD COLUMN IF NOT EXISTS updated_by_at timestamp with time zone NULL DEFAULT now();

-- Optional metadata for extra context (e.g. request id, client payload summary).
ALTER TABLE public.merchant_portal_activity_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Index for filtering logs by section (outlet_timings, store_settings, store_operations, etc.).
CREATE INDEX IF NOT EXISTS merchant_portal_activity_logs_store_section_idx
  ON public.merchant_portal_activity_logs USING btree (store_id, changed_section);

-- Document allowed changed_section values for the merchant portal (agent edits).
COMMENT ON TABLE public.merchant_portal_activity_logs IS
  'Audit log for every change made by agents in the Merchant Portal. old_value and new_value stored for full history. changed_section: outlet_timings | store_settings | store_operations | delivery | address | plans | documents | bank_accounts | media | tickets | orders | verification_steps | profile.';

COMMENT ON COLUMN public.merchant_portal_activity_logs.changed_section IS
  'Portal section that was edited: outlet_timings, store_settings, store_operations, delivery, address, plans, documents, bank_accounts, media, tickets, orders, verification_steps, profile.';

COMMENT ON COLUMN public.merchant_portal_activity_logs.field_name IS
  'Field or comma-separated fields that changed (e.g. operating_hours, delivery_radius_km,full_address).';

COMMENT ON COLUMN public.merchant_portal_activity_logs.metadata IS
  'Optional JSON for extra context (e.g. closure_type, change_reason_code).';
