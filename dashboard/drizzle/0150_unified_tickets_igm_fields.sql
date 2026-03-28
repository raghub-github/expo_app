-- Add IGM and NP detail fields to unified_tickets for ticket inner-view properties.
ALTER TABLE public.unified_tickets
ADD COLUMN IF NOT EXISTS buyer_np_name text NULL,
ADD COLUMN IF NOT EXISTS seller_np_name text NULL,
ADD COLUMN IF NOT EXISTS logistics_np_name text NULL,
ADD COLUMN IF NOT EXISTS igm_action_triggered text NULL,
ADD COLUMN IF NOT EXISTS igm_short_resolution text NULL,
ADD COLUMN IF NOT EXISTS igm_long_resolution text NULL,
ADD COLUMN IF NOT EXISTS igm_refund_amount numeric(12,2) NULL,
ADD COLUMN IF NOT EXISTS gro_details text NULL;

CREATE INDEX IF NOT EXISTS unified_tickets_igm_action_triggered_idx
ON public.unified_tickets USING btree (igm_action_triggered)
TABLESPACE pg_default
WHERE igm_action_triggered IS NOT NULL;
