-- Rollback 0483 · order_refunds customer-facing capture columns
DROP INDEX IF EXISTS public.order_refunds_initiated_at_idx;
DROP INDEX IF EXISTS public.order_refunds_refund_reference_uniq;

ALTER TABLE public.order_refunds
  DROP COLUMN IF EXISTS refund_timeline,
  DROP COLUMN IF EXISTS initiated_at,
  DROP COLUMN IF EXISTS refund_reference,
  DROP COLUMN IF EXISTS original_gateway_amount,
  DROP COLUMN IF EXISTS original_gati_cash_amount;
